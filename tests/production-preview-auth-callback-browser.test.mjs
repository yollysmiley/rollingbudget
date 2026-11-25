import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const pageUrl = (file, suffix = '') => pathToFileURL(resolve('production-preview-dist', file)).href + suffix;
const viewports = [{ name: 'desktop', width: 1280, height: 900 }, { name: 'mobile', width: 390, height: 844 }];

async function scenario(viewport, file, suffix, mode, check) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport });
    await page.addInitScript((selected) => {
      window.__authCalls = [];
      window.supabase = { createClient: (_url, _key, options) => {
        window.__authCalls.push({ method: 'client', storageKey: options.auth.storageKey });
        return { auth: {
          getSession: async () => ({
            data: { session: selected === 'confirmed' ? { user: { id: 'synthetic-confirmed' } } : null },
            error: null
          }),
          onAuthStateChange: callback => {
            if (selected === 'event') queueMicrotask(() => callback('PASSWORD_RECOVERY', { user: { id: 'synthetic-recovery' } }));
            return { data: { subscription: { unsubscribe() { window.__authCalls.push({ method: 'unsubscribe' }); } } } };
          },
          verifyOtp: async ({ token_hash, type }) => {
            window.__authCalls.push({ method: 'verify', token_hash, type });
            return selected === 'invalid'
              ? { data: null, error: { message: 'Expired synthetic token' } }
              : { data: { session: { user: { id: 'synthetic-recovery' } } }, error: null };
          },
          updateUser: async ({ password }) => {
            window.__authCalls.push({ method: 'update', passwordLength: password.length });
            return { error: selected === 'write-error' ? { message: 'Synthetic failure' } : null };
          }
        } };
      } };
    }, mode);
    await page.route('https://cdn.jsdelivr.net/**', route => route.abort());
    await page.goto(pageUrl(file, suffix), { waitUntil: 'domcontentloaded' });
    await check(page);
  } finally {
    await browser.close();
  }
}

for (const viewport of viewports) {
  test('email confirmation requires session; rejects missing and expired callbacks (' + viewport.name + ')', async () => {
    await scenario(viewport, 'auth-confirmation.html', '?error_code=otp_expired', 'confirmed', async page => {
      await page.getByRole('heading', { name: /invalid or has expired/i }).waitFor();
      assert.equal(await page.locator('#continueLink').isVisible(), false);
      assert.deepEqual(await page.evaluate(() => window.__authCalls), []);
    });
    await scenario(viewport, 'auth-confirmation.html', '', 'missing', async page => {
      await page.getByRole('heading', { name: /invalid or has expired/i }).waitFor();
      assert.equal(await page.locator('#continueLink').isVisible(), false);
    });
    await scenario(viewport, 'auth-confirmation.html', '', 'confirmed', async page => {
      await page.getByRole('heading', { name: /email is confirmed/i }).waitFor();
      assert.equal(await page.locator('#continueLink').isVisible(), true);
    });
  });

  test('password recovery rejects absent and expired callbacks without updating user (' + viewport.name + ')', async () => {
    for (const [suffix, mode] of [['', 'valid'], ['?token_hash=expired&type=recovery', 'invalid']]) {
      await scenario(viewport, 'reset-password.html', suffix, mode, async page => {
        await page.getByRole('heading', { name: /invalid or has expired/i }).waitFor();
        assert.equal(await page.locator('#resetForm').isVisible(), false);
        assert.equal((await page.evaluate(() => window.__authCalls)).some(call => call.method === 'update'), false);
      });
    }
  });

  test('verified recovery enforces password validation and permits one successful update (' + viewport.name + ')', async () => {
    await scenario(viewport, 'reset-password.html', '?token_hash=synthetic-token&type=recovery', 'valid', async page => {
      await page.getByRole('heading', { name: /create a new password/i }).waitFor();
      await page.locator('#newPassword').fill('short');
      await page.locator('#confirmPassword').fill('short');
      await page.locator('#submitButton').click();
      await page.getByText(/at least 8 characters/i).last().waitFor();
      await page.locator('#newPassword').fill('synthetic-password');
      await page.locator('#confirmPassword').fill('mismatch-value');
      await page.locator('#submitButton').click();
      await page.getByText(/passwords do not match/i).waitFor();
      assert.equal((await page.evaluate(() => window.__authCalls)).some(call => call.method === 'update'), false);
      await page.locator('#confirmPassword').fill('synthetic-password');
      await page.locator('#submitButton').click();
      await page.getByRole('heading', { name: /password has been updated/i }).waitFor();
      const calls = await page.evaluate(() => window.__authCalls);
      assert.deepEqual(calls.filter(call => call.method === 'verify').map(call => call.type), ['recovery']);
      assert.equal(calls.filter(call => call.method === 'update').length, 1);
      assert.ok(calls.some(call => call.method === 'unsubscribe'));
    });
  });

  test('failed password update does not show success or expose form after callback failure (' + viewport.name + ')', async () => {
    await scenario(viewport, 'reset-password.html', '?token_hash=synthetic-token&type=recovery', 'write-error', async page => {
      await page.getByRole('heading', { name: /create a new password/i }).waitFor();
      await page.locator('#newPassword').fill('synthetic-password');
      await page.locator('#confirmPassword').fill('synthetic-password');
      await page.locator('#submitButton').click();
      await page.getByText(/couldn't update your password/i).waitFor();
      assert.equal(await page.locator('#continueLink').isVisible(), false);
      assert.equal((await page.evaluate(() => window.__authCalls)).filter(call => call.method === 'update').length, 1);
    });
  });
}

for (const viewport of viewports) {
  test('rejected reused email links fail closed even with a restored session (' + viewport.name + ')', async () => {
    for (const file of ['auth-confirmation.html', 'reset-password.html']) {
      await scenario(viewport, file, '#error=access_denied&error_code=otp_expired&error_description=Link+already+used', 'confirmed', async page => {
        await page.getByRole('heading', { name: /invalid or has expired/i }).waitFor();
        assert.equal(await page.locator('#continueLink').isVisible(), false);
        if (file === 'reset-password.html') assert.equal(await page.locator('#resetForm').isVisible(), false);
        assert.deepEqual(await page.evaluate(() => window.__authCalls), []);
      });
    }
  });

  test('standard recovery redirect waits for PASSWORD_RECOVERY event (' + viewport.name + ')', async () => {
    await scenario(viewport, 'reset-password.html', '#access_token=synthetic&type=recovery', 'event', async page => {
      await page.getByRole('heading', { name: /create a new password/i }).waitFor();
      await page.locator('#newPassword').fill('synthetic-password');
      await page.locator('#confirmPassword').fill('synthetic-password');
      await page.locator('#submitButton').click();
      await page.getByRole('heading', { name: /password has been updated/i }).waitFor();
      const calls = await page.evaluate(() => window.__authCalls);
      assert.equal(calls.filter(call => call.method === 'verify').length, 0);
      assert.equal(calls.filter(call => call.method === 'update').length, 1);
    });
  });
}
