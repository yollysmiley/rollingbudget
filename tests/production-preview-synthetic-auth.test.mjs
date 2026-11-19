import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const preview = (path) => pathToFileURL(resolve('production-preview-dist', path)).href;
const viewports = [{ name: 'desktop', width: 1280, height: 900 }, { name: 'mobile', width: 390, height: 844 }];

for (const viewport of viewports) {
  test('preview synthetic auth and recovery callback on ' + viewport.name, async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
      await page.addInitScript(() => {
        window.__authCalls = [];
        window.supabase = { createClient: (_url, _key, options) => {
          window.__authCalls.push({ type: 'client', storageKey: options.auth.storageKey });
          return { auth: {
            getUser: async () => ({ data: { user: null }, error: null }),
            signInWithPassword: async ({ email, password }) => {
              window.__authCalls.push({ type: 'signin', email, password });
              return { data: { session: null }, error: null };
            },
            resetPasswordForEmail: async (email, { redirectTo }) => {
              window.__authCalls.push({ type: 'recovery', email, redirectTo });
              return { error: null };
            }
          } };
        } };
      });
      await page.route('https://cdn.jsdelivr.net/**', route => route.abort());
      await page.goto(preview('index.html'), { waitUntil: 'domcontentloaded' });
      await page.getByRole('link', { name: 'Login' }).click();
      await page.locator('#accountEmail').fill('synthetic@example.invalid');
      await page.locator('#accountPassword').fill('test-password-only');
      await page.locator('#accountSubmit').click();
      await page.getByRole('status').filter({ hasText: /check your email/i }).waitFor();
      await page.getByRole('button', { name: /forgot password/i }).click();
      await page.locator('#accountEmail').fill('synthetic@example.invalid');
      await page.locator('#accountSubmit').click();
      await page.getByRole('status').filter({ hasText: /reset link/i }).waitFor();
      const calls = await page.evaluate(() => window.__authCalls);
      assert.equal(calls[0].storageKey, 'rollingbudget_production_next_awalptqpsjflrahkrjzk_auth');
      assert.equal(calls[1].type, 'signin');
      assert.equal(calls[1].email, 'synthetic@example.invalid');
      assert.equal(calls[2].type, 'recovery');
      assert.equal(calls[2].email, 'synthetic@example.invalid');
      assert.equal(new URL(calls[2].redirectTo).pathname.endsWith('/reset-password.html'), true);
    } finally { await browser.close(); }
  });
}
