import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const appUrl = pathToFileURL(resolve('production-preview-dist/app/index.html')).href;
const homeUrl = pathToFileURL(resolve('production-preview-dist/index.html')).href;

for (const viewport of [{ name: 'desktop', width: 1280, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
  for (const scenario of ['no session', 'invalid session']) {
    test('protected preview redirects ' + scenario + ' on ' + viewport.name, async () => {
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
        await page.addInitScript((invalid) => {
          window.supabase = { createClient: () => ({ auth: {
            getUser: async () => ({ data: { user: null }, error: invalid ? { message: 'Invalid synthetic session' } : null })
          } }) };
        }, scenario === 'invalid session');
        await page.route('https://cdn.jsdelivr.net/**', route => route.abort());
        await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
        await page.waitForURL(homeUrl);
        assert.equal(page.url(), homeUrl);
        assert.equal(await page.locator('html.budget-authenticated').count(), 0);
      } finally { await browser.close(); }
    });
  }
}
