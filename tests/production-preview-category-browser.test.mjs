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
  test('category CRUD through real storage service on ' + viewport.name, async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
      await page.addInitScript(() => {
        const owners = [{ id:'synthetic-category-owner', email:'category@example.invalid' }, { id:'synthetic-category-owner-b', email:'category-b@example.invalid' }];
        let user = owners.find(owner => owner.id === sessionStorage.getItem('category-owner')) || owners[0];
        let listener;
        const key = 'synthetic-category-rows';
        const rows = JSON.parse(sessionStorage.getItem(key) || '[]');
        const years = JSON.parse(sessionStorage.getItem(key + '-years') || '[]');
        const rules = JSON.parse(sessionStorage.getItem(key + '-rules') || '[]');
        const state = window.__categoryFixture = { rows, years, rules, deletes: 0, blocked: false,
          switchOwner(index) { user = owners[index]; sessionStorage.setItem('category-owner',user.id); listener('SIGNED_IN',{user}); },
          persistRules() { sessionStorage.setItem(key + '-rules',JSON.stringify(rules)); }
        };
        const persist = () => { sessionStorage.setItem(key, JSON.stringify(rows)); sessionStorage.setItem(key + '-years', JSON.stringify(years)); };
        const queryFor = table => {
          let operation = 'select', payload, filters = [];
          const run = () => {
            if (!['budget_expense_categories','budget_ui_years'].includes(table)) return { data: [], error: null };
            const records = table === 'budget_ui_years' ? years : rows;
            const matches = records.filter(row => filters.every(([field, value]) => row[field] === value));
            if (operation === 'insert') {
              if (payload.user_id !== user.id) throw new Error('Wrong owner');
              records.push({ ...structuredClone(payload), updated_at: payload.updated_at || new Date().toISOString() }); persist();
              return { data: null, error: null };
            }
            if (!filters.some(([field,value]) => field === 'user_id' && value === user.id)) throw new Error('Missing owner filter');
            if (operation === 'update') { matches.forEach(row => Object.assign(row,payload)); persist(); }
            if (operation === 'delete') {
              state.deletes++;
              if (state.blocked || rules.some(rule => matches.some(row => row.user_id === rule.user_id && row.id === rule.category)) || years.some(year => year.budget_data.months?.some(month => month.expenses?.some(entry => matches.some(row => row.id === entry.categoryId))))) return { data: null, error: { code: '23503' } };
              matches.forEach(row => records.splice(records.indexOf(row),1)); persist();
            }
            return { data: matches.map(row => ({ ...row })), error: null };
          };
          return {
            select() { return this; }, eq(field,value) { filters.push([field,value]); return this; },
            in() { return this; }, order() { return this; }, limit() { return this; },
            insert(value) { operation='insert'; payload=value; return this; },
            update(value) { operation='update'; payload=value; return this; },
            delete() { operation='delete'; return this; },
            single() { return Promise.resolve({ data:null,error:null }); },
            maybeSingle() { return Promise.resolve({ data:null,error:null }); },
            then(resolve,reject) { return Promise.resolve().then(run).then(resolve,reject); }
          };
        };
        window.supabase = { createClient: () => ({
          auth: { getUser: async () => ({ data:{user},error:null }), onAuthStateChange: callback => { listener=callback; return { data:{subscription:{unsubscribe(){}}} }; } },
          from: queryFor
        }) };
      });
      await page.route('https://cdn.jsdelivr.net/**', route => route.abort());
      const open = async () => {
        await page.locator('html.budget-authenticated').waitFor({ timeout:12000 });
        await page.waitForFunction(() => expenseCategoryOwner === currentUser?.id && !!expenseCategoryService);
        await page.locator(viewport.name === 'desktop' ? '[data-settings-section="categories"]' : 'button[onclick="showMobileSettingsSection(\'categories\')"]').click();
      };
      await page.goto(baseUrl + '/app/?page=settings', { waitUntil:'domcontentloaded' });
      await open();
      const root = page.locator(viewport.name === 'desktop' ? '#desktopExpenseCategoriesManager' : '#mobileExpenseCategoriesManager');
      const row = root.locator('[data-expense-category-id]');
      const form = root.locator('[data-expense-category-create]');
      assert.equal(await row.count(),0);
      await form.locator('input').fill('Synthetic Travel');
      await form.locator('button').click();
      await row.filter({hasText:'Synthetic Travel'}).waitFor();
      const id = await row.getAttribute('data-expense-category-id');
      const goBudget = async () => {
        if (viewport.name === 'mobile') { await page.locator('#mobileMenuButton').click(); await page.locator('[data-mobile-tab="plan"]').click(); }
        else await page.locator('#desktopBudgetButton').click();
      };
      const goSettings = async () => {
        if (viewport.name === 'mobile') { await page.locator('#mobileMenuButton').click(); await page.locator('[data-mobile-tab="settings"]').click(); }
        else await page.locator('#desktopSettingsButton').click();
        await open();
      };
      await goBudget();
      const card = page.locator('[data-custom-expense-card="' + id + '"]');
      await card.waitFor();
      await page.waitForFunction(() => accountReadyOwner === currentUser?.id);
      await card.getByLabel('New expense name').fill('Synthetic Train');
      await card.getByLabel('New expense amount').fill('42.50');
      await card.locator('form button[type="submit"]').click();
      await page.waitForFunction(id => window.__categoryFixture.years.some(year => year.budget_data.months.some(month => month.expenses?.some(entry => entry.categoryId === id && entry.name === 'Synthetic Train' && entry.amount === 42.5))), id);
      await card.getByLabel('Expense name', {exact:true}).waitFor();
      await goSettings();
      await row.locator('[data-expense-category-action="rename"]').click();
      await row.locator('input').fill('Renamed Travel');
      await row.locator('button[type="submit"]').click();
      await row.filter({hasText:'Renamed Travel'}).waitFor();
      assert.equal(await row.getAttribute('data-expense-category-id'),id);
      await page.reload({waitUntil:'domcontentloaded'});
      await open();
      await row.filter({hasText:'Renamed Travel'}).waitFor();
      assert.equal(await row.getAttribute('data-expense-category-id'),id);
      // Validation must reject invalid names before any new row is stored.
      await form.locator('input').fill('Renamed Travel');
      await form.locator('button').click();
      await root.getByRole('status').filter({hasText:'nonblank and unique'}).waitFor();
      await form.locator('input').fill('   ');
      await form.locator('button').click();
      await root.getByRole('status').filter({hasText:'nonblank and unique'}).waitFor();
      assert.equal(await page.evaluate(() => window.__categoryFixture.rows.length),1);
      // Simulate another device updating the authoritative revision.
      await page.evaluate(() => { const record=window.__categoryFixture.rows[0]; record.updated_at=new Date(Date.parse(record.updated_at)+1000).toISOString(); });
      await row.locator('[data-expense-category-action="rename"]').click();
      await row.locator('input').fill('Stale overwrite');
      await row.locator('button[type="submit"]').click();
      await root.getByRole('status').filter({hasText:'Category changed on another device; reload'}).waitFor();
      assert.equal(await page.evaluate(() => window.__categoryFixture.rows[0].name),'Renamed Travel');
      await page.evaluate(() => sessionStorage.setItem('synthetic-category-rows',JSON.stringify(window.__categoryFixture.rows)));
      await page.reload({waitUntil:'domcontentloaded'});
      await open();
      await row.filter({hasText:'Renamed Travel'}).waitFor();
      await row.locator('[data-expense-category-action="delete"]').click();
      await page.locator('#rbDialogCancel').click();
      assert.equal(await page.evaluate(() => window.__categoryFixture.deletes),0);
      // The persisted budget reference now supplies the mock foreign key rejection.
      await row.locator('[data-expense-category-action="delete"]').click();
      await page.locator('#rbDialogAccept').click();
      await root.getByRole('status').filter({hasText:'Category is in use by a saved budget or recurring rule'}).waitFor();
      assert.equal(await row.count(),1);
      await goBudget();
      await card.getByLabel('Expense name', {exact:true}).waitFor();
      assert.equal(await card.getByLabel('Expense name', {exact:true}).inputValue(),'Synthetic Train');
      assert.equal(await card.getByLabel('Expense amount', {exact:true}).inputValue(),'42.5');
      assert.match(await card.locator('h2').innerText(),/Renamed Travel/);
      await card.getByRole('button',{name:'Delete expense'}).click();
      await page.waitForFunction(id => window.__categoryFixture.years.every(year => year.budget_data.months.every(month => !month.expenses?.some(entry => entry.categoryId === id))),id);
      await goSettings();
      await page.evaluate(id => { const f=window.__categoryFixture; f.rules.push({user_id:currentUser.id,category:id}); f.persistRules(); },id);
      await row.locator('[data-expense-category-action="delete"]').click();
      await page.locator('#rbDialogAccept').click();
      await root.getByRole('status').filter({hasText:'Category is in use by a saved budget or recurring rule'}).waitFor();
      assert.equal(await row.count(),1);
      await page.evaluate(() => { const f=window.__categoryFixture; f.rules.splice(0); f.persistRules(); });
      await page.evaluate(() => window.__categoryFixture.switchOwner(1));
      await page.waitForFunction(() => currentUser?.id === 'synthetic-category-owner-b' && expenseCategoryOwner === currentUser.id && accountReadyOwner === currentUser.id);
      assert.equal(await row.count(),0);
      assert.equal(await card.count(),0);
      await page.reload({waitUntil:'domcontentloaded'});
      await open();
      assert.equal(await row.count(),0);
      assert.equal(await card.count(),0);
      await page.evaluate(() => window.__categoryFixture.switchOwner(0));
      await page.waitForFunction(() => currentUser?.id === 'synthetic-category-owner' && expenseCategoryOwner === currentUser.id && accountReadyOwner === currentUser.id);
      await row.filter({hasText:'Renamed Travel'}).waitFor();
      await row.locator('[data-expense-category-action="delete"]').click();
      await page.locator('#rbDialogAccept').click();
      await row.waitFor({state:'detached'});
      assert.equal(await page.evaluate(() => window.__categoryFixture.rows.length),0);
      await goBudget();
      assert.equal(await card.count(),0, 'deleted category card must be removed without reload');
      await page.reload({waitUntil:'domcontentloaded'});
      await page.locator('html.budget-authenticated').waitFor({timeout:12000});
      await page.waitForFunction(() => expenseCategoryOwner === currentUser?.id && accountReadyOwner === currentUser?.id);
      assert.equal(await card.count(),0, 'deleted category card must remain absent after reload');
    } finally { await browser.close(); }
  });
}
