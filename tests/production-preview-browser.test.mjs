import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const url = (path) => pathToFileURL(resolve('production-preview-dist', path)).href;

for (const viewport of [{ name: 'desktop', width: 1280, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
  test('production preview public homepage and recovery dialog on ' + viewport.name, async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
      await page.route('https://cdn.jsdelivr.net/**', route => route.abort());
      await page.goto(url('index.html'), { waitUntil: 'domcontentloaded' });
      assert.match(await page.title(), /Rolling Budget/);
      assert.equal(await page.getByRole('heading', { name: /make room for what matters/i }).count(), 1);
      await page.getByRole('button', { name: /forgot password/i }).count().then(count => assert.equal(count, 1));
      await page.getByRole('link', { name: 'Login' }).click();
      assert.equal(await page.locator('#accountDialog').evaluate(el => el.open), true);
      await page.getByRole('button', { name: /forgot password/i }).click();
      assert.equal(await page.locator('#accountPasswordField').isHidden(), true);
      assert.equal(await page.getByRole('button', { name: /send reset link/i }).count(), 1);
      await page.getByRole('button', { name: /back to sign in/i }).click();
      assert.equal(await page.locator('#accountPasswordField').isVisible(), true);
    } finally { await browser.close(); }
  });
}

