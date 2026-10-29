import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const root = new URL('../', import.meta.url);
const pages = new Map([
  ['/index.html', readFileSync(new URL('index.html', root), 'utf8')],
  ['/rollover-budget-app.html', readFileSync(new URL('rollover-budget-app.html', root), 'utf8')]
]);
const sdk = `window.supabase = { createClient() { return { auth: {
  async getUser() { return { data: { user: null }, error: null }; },
  onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; }
} }; } };`;

for (const [name, viewport, mobile] of [
  ['desktop', { width: 1440, height: 1000 }, false],
  ['mobile', { width: 390, height: 844 }, true]
]) {
  test(`Chromium ${name}: startup, navigation, editing, persistence and theme`, { timeout: 60000 }, async () => {
    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport, serviceWorkers: 'block', locale: 'en-US' });
    const errors = [];
    const unexpected = [];
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.dismiss());
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin === 'http://budget.test' && pages.has(url.pathname)) {
        return route.fulfill({ status: 200, contentType: 'text/html', body: pages.get(url.pathname) });
      }
      if (url.href === 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2') {
        return route.fulfill({ status: 200, contentType: 'application/javascript', body: sdk });
      }
      if (url.origin === 'http://budget.test' && url.pathname === '/favicon.ico') {
        return route.fulfill({ status: 204, body: '' });
      }
      unexpected.push(url.origin + url.pathname);
      return route.abort('blockedbyclient');
    });
    try {
      await page.goto('http://budget.test/index.html');
      await page.waitForURL('**/rollover-budget-app.html');
      await page.locator('#paycheckContainer input').first().waitFor();
      assert.equal(await page.locator('.month-item').count(), 12);
      assert.equal(await page.locator('#homeView').isVisible(), true);
      assert.equal(await page.locator('.bottom-nav').isVisible(), mobile);
      assert.equal(await page.locator('.nav-group').isVisible(), !mobile);
      const nav = mobile ? ['#bnRecurring', '#bnSummary', '#bnHome'] : ['#navRecurring', '#navSummary', '#navHome'];
      for (const [selector, view] of nav.map((selector, i) => [selector, ['recurring', 'summary', 'home'][i]])) {
        await page.locator(selector).click();
        assert.equal(await page.locator('#' + view + 'View').isVisible(), true);
      }
      const label = page.locator('#paycheckContainer input').first();
      await label.fill('Synthetic browser paycheck');
      await label.press('Tab');
      const save = mobile ? '.bn-save' : '.nav-group button[onclick="saveData()"]';
      await page.locator(save).click();
      await page.waitForFunction(() => JSON.parse(localStorage.getItem('rollover_pro_v5') || 'null')?.years[0].months[0].paychecks[0].name === 'Synthetic browser paycheck');
      await page.reload();
      await page.locator('#paycheckContainer input').first().waitFor();
      assert.equal(await page.locator('#paycheckContainer input').first().inputValue(), 'Synthetic browser paycheck');
      await page.locator(mobile ? '#themeToggleMobile' : '#themeToggle').click();
      assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
      await page.reload();
      await page.locator('#paycheckContainer input').first().waitFor();
      assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, 'Unexpected page-level horizontal overflow');
      assert.deepEqual(errors, [], 'Uncaught browser errors');
      assert.deepEqual(unexpected, [], 'Unexpected network requests were blocked');
    } catch (error) {
      mkdirSync('browser-results', { recursive: true });
      await page.screenshot({ path: `browser-results/${name}-failure.png`, fullPage: true }).catch(() => {});
      throw error;
    } finally {
      await context.close();
      await browser.close();
    }
  });
}
