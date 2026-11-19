import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';

const root = resolve('production-preview-dist');
let server;
let baseUrl;
before(async () => {
  server = createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const target = resolve(root, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
    const rel = relative(root, target);
    if (rel === '..' || rel.startsWith('..' + sep)) return void res.writeHead(403).end();
    try {
      const body = await readFile(target);
      const type = target.endsWith('.mjs') ? 'text/javascript' : target.endsWith('.css') ? 'text/css' : 'text/html';
      res.writeHead(200, { 'content-type': type }).end(body);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  baseUrl = 'http://127.0.0.1:' + server.address().port;
});
after(async () => { if (server) await new Promise(done => server.close(done)); });

for (const viewport of [{ name: 'desktop', width: 1280, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
  test('synthetic authenticated route restoration and history on ' + viewport.name, async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
      await page.addInitScript(() => {
        // All fixtures are generated in-memory; no live Supabase requests or legacy accounts.
        const user = { id: 'synthetic-owner-1', email: 'owner@example.invalid' };
        const query = {
          select() { return this; }, eq() { return this; }, in() { return this; },
          order() { return this; }, limit() { return this; }, single() { return Promise.resolve({ data: null, error: null }); },
          maybeSingle() { return Promise.resolve({ data: null, error: null }); },
          then(resolve, reject) { return Promise.resolve({ data: [], error: null }).then(resolve, reject); }
        };
        window.supabase = { createClient: () => ({
          auth: { getUser: async () => ({ data: { user }, error: null }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
          from: () => Object.create(query)
        }) };
      });
      await page.route('https://cdn.jsdelivr.net/**', route => route.abort());
      await page.goto(baseUrl + '/app/?page=settings', { waitUntil: 'domcontentloaded' });
      await page.locator('html.budget-authenticated').waitFor({ timeout: 12000 });
      assert.equal(new URL(page.url()).searchParams.get('page'), 'settings');
      assert.equal(await page.locator('body.desktop-settings-open').count(), viewport.name === 'desktop' ? 1 : 0);
      await page.evaluate(() => navigatePage('overview'));
      assert.equal(new URL(page.url()).searchParams.get('page'), 'overview');
      assert.equal(await page.locator('body.route-overview').count(), 1);
      await page.evaluate(() => navigatePage('budget'));
      assert.equal(new URL(page.url()).searchParams.get('page'), 'budget');
      await page.goBack({ waitUntil: 'domcontentloaded' });
      assert.equal(new URL(page.url()).searchParams.get('page'), 'overview');
      assert.equal(await page.locator('body.route-overview').count(), 1);
      await page.goForward({ waitUntil: 'domcontentloaded' });
      assert.equal(new URL(page.url()).searchParams.get('page'), 'budget');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.locator('html.budget-authenticated').waitFor({ timeout: 12000 });
      assert.equal(new URL(page.url()).searchParams.get('page'), 'budget');
      assert.equal(await page.locator('body.route-budget').count(), 1);
    } finally { await browser.close(); }
  });
}

for (const viewport of [{ name: 'desktop', width: 1280, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
  test('synthetic account switch clears prior budget and reloads owner scope on ' + viewport.name, async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
      await page.addInitScript(() => {
        const users = [
          { id: 'synthetic-owner-a', email: 'a@example.invalid' },
          { id: 'synthetic-owner-b', email: 'b@example.invalid' }
        ];
        let selected = users[0];
        let listener;
        const requestedOwners = [];
        const query = {
          select() { return this; },
          eq(field, value) { if (field === 'user_id') requestedOwners.push(value); return this; },
          in() { return this; }, order() { return this; }, limit() { return this; },
          single() { return Promise.resolve({ data: null, error: null }); },
          maybeSingle() { return Promise.resolve({ data: null, error: null }); },
          then(resolve, reject) { return Promise.resolve({ data: [], error: null }).then(resolve, reject); }
        };
        window.__syntheticSession = {
          requestedOwners,
          switchToB() { selected = users[1]; listener('SIGNED_IN', { user: selected }); },
          signOut() { selected = null; listener('SIGNED_OUT', null); }
        };
        window.supabase = { createClient: () => ({
          auth: {
            getUser: async () => ({ data: { user: selected }, error: null }),
            onAuthStateChange: callback => {
              listener = callback;
              return { data: { subscription: { unsubscribe() {} } } };
            }
          },
          from: () => Object.create(query)
        }) };
      });
      await page.route('https://cdn.jsdelivr.net/**', route => route.abort());
      await page.goto(baseUrl + '/app/?page=budget', { waitUntil: 'domcontentloaded' });
      await page.locator('html.budget-authenticated').waitFor({ timeout: 12000 });
      await page.evaluate(() => {
        // Simulate a previous owner's in-memory financial state.
        db.__previousOwnerOnly = { marker: 'must-not-survive-switch' };
        budgetAccounts.push({ id: 'previous-owner-account', name: 'Private', included: true });
        window.__syntheticSession.switchToB();
      });
      await page.waitForFunction(() => currentUser?.id === 'synthetic-owner-b' && document.documentElement.classList.contains('budget-authenticated'), { timeout: 12000 });
      const result = await page.evaluate(() => ({
        owner: currentUser?.id,
        previousData: Object.hasOwn(db, '__previousOwnerOnly'),
        previousAccount: budgetAccounts.some(account => account.id === 'previous-owner-account'),
        requestedOwners: window.__syntheticSession.requestedOwners,
        status: document.getElementById('userStatusSub').textContent
      }));
      assert.equal(result.owner, 'synthetic-owner-b');
      assert.equal(result.previousData, false);
      assert.equal(result.previousAccount, false);
      assert.ok(result.requestedOwners.includes('synthetic-owner-b'));
      assert.match(result.status, /b@example.invalid/);
      await page.evaluate(() => window.__syntheticSession.signOut());
      await page.waitForURL(baseUrl + '/', { waitUntil: 'domcontentloaded', timeout: 10000 });
      assert.equal(page.url(), baseUrl + '/');
      assert.equal(await page.locator('html.budget-authenticated').count(), 0);
    } finally { await browser.close(); }
  });
}
