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
        // Persist auth across document loads; otherwise the homepage resurrects a signed-out user.
        const sessionKey = 'synthetic-preview-session-owner';
        const saved = sessionStorage.getItem(sessionKey);
        let selected = saved === 'signed-out' ? null : users.find(user => user.id === saved) || users[0];
        let listener;
        const requestedOwners = [];
        const accountRows = {
          'synthetic-owner-a': [{ id: 'a-account', name: 'Owner A checking', included: true, updated_at: '2026-01-01T00:00:00Z' }],
          'synthetic-owner-b': [{ id: 'b-account', name: 'Owner B savings', included: true, updated_at: '2026-01-01T00:00:00Z' }]
        };
        const budgetRows = Object.fromEntries(users.map((user, index) => [user.id, [{
          year: new Date().getFullYear(),
          budget_data: {
            autoCascade: true, recurringRules: [],
            months: Array.from({ length: 12 }, (_, month) => ({
              code: String(month + 1), name: 'Synthetic month ' + month, recordedLeftover: 0,
              income: [], fixed: [{ id: user.id + '-expense', name: user.id + '-private-expense', amount: (index + 1) * 100, due: 1 }],
              variable: [], creditCards: [], loans: []
            }))
          },
          updated_at: '2026-01-01T00:00:00Z'
        }]]));
        const queryFor = table => {
          let owner = null;
          const query = {
            select() { return this; },
            eq(field, value) { if (field === 'user_id') { owner = value; requestedOwners.push(value); } return this; },
            in() { return this; }, order() { return this; }, limit() { return this; },
            single() { return Promise.resolve({ data: null, error: null }); },
            maybeSingle() { return Promise.resolve({ data: null, error: null }); },
            then(resolve, reject) {
              const rows = table === 'budget_accounts' ? accountRows[owner] || []
                : table === 'budget_ui_years' ? budgetRows[owner] || [] : [];
              return Promise.resolve({ data: rows.map(row => ({ ...row })), error: null }).then(resolve, reject);
            }
          };
          return query;
        };
        window.__syntheticSession = {
          requestedOwners,
          switchToB() {
            selected = users[1];
            sessionStorage.setItem(sessionKey, selected.id);
            listener('SIGNED_IN', { user: selected });
          }
        };
        window.supabase = { createClient: () => ({
          auth: {
            getUser: async () => ({ data: { user: selected }, error: null }),
            signOut: async () => {
              selected = null;
              sessionStorage.setItem(sessionKey, 'signed-out');
              listener?.('SIGNED_OUT', null);
              return { error: null };
            },
            onAuthStateChange: callback => {
              listener = callback;
              return { data: { subscription: { unsubscribe() {} } } };
            }
          },
          from: table => queryFor(table)
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
      assert.equal(await page.evaluate(() => Object.values(db).some(year => year.months?.some(month => month.fixed?.some(item => item.name === 'synthetic-owner-b-private-expense')))), true);
      assert.equal(await page.evaluate(() => Object.values(db).some(year => year.months?.some(month => month.fixed?.some(item => item.name === 'synthetic-owner-a-private-expense')))), false);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.locator('html.budget-authenticated').waitFor({ timeout: 12000 });
      assert.equal(await page.evaluate(() => currentUser?.id), 'synthetic-owner-b');
      assert.equal(await page.evaluate(() => Object.values(db).some(year => year.months?.some(month => month.fixed?.some(item => item.name === 'synthetic-owner-b-private-expense')))), true);
      assert.equal(await page.evaluate(() => Object.values(db).some(year => year.months?.some(month => month.fixed?.some(item => item.name === 'synthetic-owner-a-private-expense')))), false);
      assert.equal(await page.evaluate(() => budgetAccounts.some(account => account.id === 'b-account' && account.name === 'Owner B savings')), true);
      assert.equal(await page.evaluate(() => budgetAccounts.some(account => account.id === 'a-account')), false);
      // Exercise the real application sign-out handler and confirmation UI.
      // The sign-out action must be reachable from each distinct viewport.
      const signOutControl = page.locator(viewport.name === 'desktop' ? '#authBtn' : '#mobileAuthBtn');
      await signOutControl.evaluate(button => button.click());
      await page.locator('#rbDialogAccept').click();
      await page.waitForURL(baseUrl + '/', { waitUntil: 'load', timeout: 10000 });
      assert.equal(page.url(), baseUrl + '/');
      assert.equal(await page.locator('html.budget-authenticated').count(), 0);
      assert.equal(await page.evaluate(() => sessionStorage.getItem('synthetic-preview-session-owner')), 'signed-out');
      await page.goto(baseUrl + '/app/', { waitUntil: 'domcontentloaded' });
      await page.waitForURL(baseUrl + '/', { timeout: 10000 });
      assert.equal(await page.locator('html.budget-authenticated').count(), 0);
    } finally { await browser.close(); }
  });
}

for (const viewport of [{ name: 'desktop', width: 1280, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
  test('synthetic account manager UI create, rename, inclusion, and confirmed removal on ' + viewport.name, async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
      await page.addInitScript(() => {
        const user = { id: 'synthetic-ui-owner', email: 'ui@example.invalid' };
        const query = {
          select() { return this; }, eq() { return this; }, in() { return this; },
          order() { return this; }, limit() { return this; },
          single() { return Promise.resolve({ data: null, error: null }); },
          maybeSingle() { return Promise.resolve({ data: null, error: null }); },
          then(resolve, reject) { return Promise.resolve({ data: [], error: null }).then(resolve, reject); }
        };
        window.supabase = { createClient: () => ({
          auth: { getUser: async () => ({ data: { user }, error: null }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
          from: () => Object.create(query)
        }) };
      });
      await page.route('https://cdn.jsdelivr.net/**', route => route.abort());
      await page.goto(baseUrl + '/app/?page=settings', { waitUntil: 'domcontentloaded' });
      await page.locator('html.budget-authenticated').waitFor({ timeout: 12000 });
      const rootSelector = viewport.name === 'desktop' ? '#desktopAccountsManager' : '#mobileSettingsAccounts';
      await page.evaluate(() => {
        const records = [];
        accountService = {
          createAccount: async (_client, owner, _accounts, name, id, included) => {
            if (owner !== currentUser.id) throw new Error('Owner changed');
            records.push({ id, name, included, updatedAt: '2026-01-01T00:00:00Z' });
          },
          updateAccount: async (_client, owner, _accounts, id, patch) => {
            if (owner !== currentUser.id) throw new Error('Owner changed');
            const record = records.find(row => row.id === id);
            if (!record) throw new Error('Account missing');
            Object.assign(record, patch);
          },
          deleteAccount: async (_client, owner, _accounts, id) => {
            if (owner !== currentUser.id) throw new Error('Owner changed');
            const index = records.findIndex(row => row.id === id);
            if (index < 0) throw new Error('Account missing');
            records.splice(index, 1);
          },
          loadOrSeedAccounts: async (_client, owner) => {
            if (owner !== currentUser.id) throw new Error('Owner changed');
            return records.map(row => ({ ...row }));
          }
        };
        budgetAccounts = [];
        renderAccounts();
        if (window.innerWidth < 700) showMobileSettingsSection('accounts');
      });
      const root = page.locator(rootSelector);
      await root.locator('[data-account-action="start-create"]').click();
      await root.locator('[data-account-form] input[name="accountName"]').fill('Synthetic Checking');
      await root.locator('[data-account-form] button[type="submit"]').click();
      await root.locator('.account-manager-row[data-account-id]').filter({ hasText: 'Synthetic Checking' }).waitFor();
      await root.locator('[data-account-action="rename"]').click();
      await root.locator('[data-account-rename-form] input[name="accountName"]').fill('Renamed Checking');
      await root.locator('[data-account-rename-form] button[type="submit"]').click();
      await root.locator('.account-manager-row[data-account-id]').filter({ hasText: 'Renamed Checking' }).waitFor();
      await root.locator('[data-account-action="included"]').uncheck();
      await page.waitForFunction(() => budgetAccounts.length === 1 && budgetAccounts[0].included === false);
      await root.locator('[data-account-action="remove"]').click();
      await page.locator('#rbDialogAccept').waitFor();
      await page.locator('#rbDialogAccept').click();
      await page.waitForFunction(() => budgetAccounts.length === 0);
      assert.equal(await root.locator('.account-manager-row[data-account-id]').count(), 0);
      assert.equal(await page.evaluate(() => currentUser.id), 'synthetic-ui-owner');
    } finally { await browser.close(); }
  });
}

for (const viewport of [{ name: 'desktop', width: 1280, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
  test('synthetic recurring manager UI edit, disable, enable and confirmed delete on ' + viewport.name, async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
      await page.addInitScript(() => {
        const user = { id: 'synthetic-recurring-owner', email: 'recurring@example.invalid' };
        const query = {
          select() { return this; }, eq() { return this; }, in() { return this; },
          order() { return this; }, limit() { return this; },
          single() { return Promise.resolve({ data: null, error: null }); },
          maybeSingle() { return Promise.resolve({ data: null, error: null }); },
          then(resolve, reject) { return Promise.resolve({ data: [], error: null }).then(resolve, reject); }
        };
        window.supabase = { createClient: () => ({
          auth: { getUser: async () => ({ data: { user }, error: null }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
          from: () => Object.create(query)
        }) };
      });
      await page.route('https://cdn.jsdelivr.net/**', route => route.abort());
      await page.goto(baseUrl + '/app/?page=recurring', { waitUntil: 'domcontentloaded' });
      await page.locator('html.budget-authenticated').waitFor({ timeout: 12000 });
      await page.evaluate(() => {
        const rules = [{
          id: 'synthetic-rent', name: 'Synthetic Rent', category: 'fixed', amount: 500,
          displayAmount: 500, upcomingAmount: 500, frequency: 'monthly',
          displayFrequency: 'monthly', upcomingFrequency: 'monthly',
          displayActive: true, upcomingActive: true, startDate: '2026-01-01',
          endDate: null, versions: [{ effectiveFrom: '2026-01-01', amount: 500, enabled: true }]
        }];
        window.__recurringFixture = { rules, backfills: [] };
        recurringAppService = {
          editRecurringRule: async (_client, owner, id, changes, date) => {
            if (owner !== currentUser.id) throw new Error('Owner changed');
            const rule = rules.find(row => row.id === id);
            if (!rule) throw new Error('Rule missing');
            rule.versions.push({ effectiveFrom: date, amount: changes.amount, enabled: rule.upcomingActive });
            rule.upcomingAmount = changes.amount;
            rule.upcomingFrequency = changes.frequency;
          },
          setRecurringRuleActive: async (_client, owner, id, enabled, date) => {
            if (owner !== currentUser.id) throw new Error('Owner changed');
            const rule = rules.find(row => row.id === id);
            if (!rule) throw new Error('Rule missing');
            rule.versions.push({ effectiveFrom: date, amount: rule.upcomingAmount, enabled });
            rule.upcomingActive = enabled;
          },
          removeRecurringRule: async (_client, owner, id) => {
            if (owner !== currentUser.id) throw new Error('Owner changed');
            const index = rules.findIndex(row => row.id === id);
            if (index < 0) throw new Error('Rule missing');
            rules.splice(index, 1);
          }
        };
        refreshRecurringPreview = async () => {
          loadedRecurringPreview = { rules: rules.map(row => ({ ...row, versions: row.versions.map(v => ({ ...v })) })), held: 0 };
        };
        backfillSavedRecurringYears = async (_owner, start, end) => {
          window.__recurringFixture.backfills.push({ start, end });
        };
        loadedRecurringPreview = { rules: rules.map(row => ({ ...row })), held: 0 };
        renderRulesList();
      });
      const list = page.locator(viewport.name === 'desktop' ? '#desktopRulesList' : '#mobileRulesList');
      await list.getByText('Synthetic Rent').waitFor();
      await list.getByRole('button', { name: 'Edit' }).click();
      await page.locator('#rbDialogInput').fill('750');
      await page.locator('#rbDialogAccept').click();
      await page.locator('#rbDialogInput').fill('monthly');
      await page.locator('#rbDialogAccept').click();
      await page.waitForFunction(() => window.__recurringFixture.rules[0].upcomingAmount === 750);
      await list.getByRole('button', { name: /Disable from/ }).click();
      await page.waitForFunction(() => window.__recurringFixture.rules[0].upcomingActive === false);
      await list.getByRole('button', { name: /Enable from/ }).click();
      await page.waitForFunction(() => window.__recurringFixture.rules[0].upcomingActive === true);
      const beforeDelete = await page.evaluate(() => structuredClone(window.__recurringFixture.rules[0].versions));
      assert.equal(beforeDelete[0].amount, 500, 'historical version remains unchanged');
      assert.ok(beforeDelete.some(version => version.amount === 750), 'future edit creates a new version');
      await list.getByRole('button', { name: /Delete/ }).click();
      await page.locator('#rbDialogCancel').click();
      assert.equal(await page.evaluate(() => window.__recurringFixture.rules.length), 1, 'cancel preserves the rule');
      await list.getByRole('button', { name: /Delete/ }).click();
      await page.locator('#rbDialogAccept').click();
      await page.waitForFunction(() => window.__recurringFixture.rules.length === 0);
      assert.match(await list.innerText(), /No recurring rules yet/);
      assert.equal(await page.evaluate(() => currentUser.id), 'synthetic-recurring-owner');
    } finally { await browser.close(); }
  });
}
