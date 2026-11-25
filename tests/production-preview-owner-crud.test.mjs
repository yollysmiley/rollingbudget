import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccount, loadOrSeedAccounts, updateAccount, deleteAccount } from '../production-next/scripts/account-storage.mjs';
import { createRecurringRule, loadRecurringPreviewRules, removeRecurringRule, editRecurringRule, setRecurringRuleActive } from '../production-next/scripts/recurring-app-service.mjs';

// Isolated owner-scoped mock: every test starts with no accounts, rules or budget records.
function syntheticClient() {
  const rows = { budget_accounts: [], budget_recurring_rules: [], budget_expense_categories: [] };
  const calls = [];
  return {
    rows, calls,
    from(table) {
      let owner = null;
      let id = null;
      let updatedAt = null;
      let versions = null;
      let action = null;
      let payload = null;
      const query = {
        select() { return this; },
        eq(field, value) {
          if (field === 'user_id') { owner = value; calls.push({ table, owner }); }
          if (field === 'id') id = value;
          if (field === 'updated_at') updatedAt = value;
          if (field === 'versions') versions = value;
          return this;
        },
        insert(value) { action = 'insert'; payload = value; return this; },
        update(value) { action = 'update'; payload = value; return this; },
        delete() { action = 'delete'; return this; },
        then(resolve, reject) {
          let data;
          if (action === 'insert') {
            assert.equal(payload.user_id, owner ?? payload.user_id);
            rows[table].push({ ...structuredClone(payload), updated_at: payload.updated_at || '2026-01-01T00:00:00Z' });
            data = null;
          } else if (action === 'update') {
            const matches = rows[table].filter(row => row.user_id === owner && row.id === id &&
              (updatedAt === null || row.updated_at === updatedAt) &&
              (versions === null || JSON.stringify(row.versions) === versions));
            for (const row of matches) Object.assign(row, structuredClone(payload));
            data = matches.map(row => ({ id: row.id }));
          } else if (action === 'delete') {
            const matches = rows[table].filter(row => row.user_id === owner && (id === null || row.id === id) &&
              (updatedAt === null || row.updated_at === updatedAt) &&
              (versions === null || JSON.stringify(row.versions) === versions));
            rows[table] = rows[table].filter(row => !matches.includes(row));
            data = matches.map(row => ({ id: row.id }));
          } else {
            data = rows[table].filter(row => row.user_id === owner && (id === null || row.id === id)).map(row => structuredClone(row));
          }
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        }
      };
      return query;
    }
  };
}

for (const viewport of ['desktop', 'mobile']) {
  test('Phase 2D.5 owner-scoped account and recurring CRUD contract (' + viewport + ')', async () => {
    const client = syntheticClient();
    const a = 'synthetic-owner-a';
    const b = 'synthetic-owner-b';
    assert.deepEqual(await loadOrSeedAccounts(client, a), []);
    assert.deepEqual(await loadOrSeedAccounts(client, b), []);
    await createAccount(client, a, [], 'Checking A', 'checking-a');
    await createAccount(client, b, [], 'Checking B', 'checking-b');
    assert.deepEqual((await loadOrSeedAccounts(client, a)).map(row => row.id), ['checking-a']);
    assert.deepEqual((await loadOrSeedAccounts(client, b)).map(row => row.id), ['checking-b']);

    let accountsA = await loadOrSeedAccounts(client, a);
    await updateAccount(client, a, accountsA, 'checking-a', { name: 'Renamed A', included: false });
    accountsA = await loadOrSeedAccounts(client, a);
    assert.equal(accountsA[0].name, 'Renamed A');
    assert.equal(accountsA[0].included, false);
    assert.deepEqual((await loadOrSeedAccounts(client, b)).map(row => row.name), ['Checking B']);

    const rule = {
      id: 'rent-a', name: 'Rent A', category: 'fixed', amount: 500,
      dueDay: 1, accountId: 'checking-a', frequency: 'monthly',
      startDate: '2026-01-01', endDate: null, active: true
    };
    await createRecurringRule(client, a, rule);
    const ownerA = await loadRecurringPreviewRules(client, a);
    const ownerB = await loadRecurringPreviewRules(client, b);
    assert.deepEqual(ownerA.rules.map(item => item.id), ['rent-a']);
    assert.deepEqual(ownerB.rules, []);
    await editRecurringRule(client, a, 'rent-a', { amount: 750 }, '2026-02-01');
    let updatedRules = await loadRecurringPreviewRules(client, a);
    assert.equal(updatedRules.rules[0].versions.find(version => version.effectiveFrom === '2026-01-01').amount, 500);
    assert.equal(updatedRules.rules[0].versions.find(version => version.effectiveFrom === '2026-02-01').amount, 750);
    await setRecurringRuleActive(client, a, 'rent-a', false, '2026-03-01');
    updatedRules = await loadRecurringPreviewRules(client, a);
    assert.equal(updatedRules.rules[0].versions.find(version => version.effectiveFrom === '2026-03-01').enabled, false);
    await setRecurringRuleActive(client, a, 'rent-a', true, '2026-04-01');
    updatedRules = await loadRecurringPreviewRules(client, a);
    assert.equal(updatedRules.rules[0].versions.find(version => version.effectiveFrom === '2026-04-01').enabled, true);
    await assert.rejects(deleteAccount(client, a, await loadOrSeedAccounts(client, a), 'checking-a', {}), /recurring rules/i);
    await removeRecurringRule(client, a, 'rent-a');
    await deleteAccount(client, a, await loadOrSeedAccounts(client, a), 'checking-a', {});
    assert.deepEqual(await loadOrSeedAccounts(client, a), []);
    assert.deepEqual((await loadRecurringPreviewRules(client, a)).rules, []);
    assert.deepEqual((await loadOrSeedAccounts(client, b)).map(item => item.name), ['Checking B']);
    assert.ok(client.calls.some(call => call.table === 'budget_recurring_rules' && call.owner === a));
    assert.ok(client.calls.some(call => call.table === 'budget_recurring_rules' && call.owner === b));
  });
}

test('category reference contract reserves all built-in identifiers and preserves stable IDs', async () => {
  const { normalizeExpenseCategories, renameExpenseCategory, canDeleteExpenseCategory, RESERVED_CATEGORY_IDS } = await import('../production-next/scripts/expense-category-model.mjs');
  const { normalizeRecurringRule } = await import('../production-next/scripts/recurring-foundation.mjs');
  for (const id of RESERVED_CATEGORY_IDS) {
    assert.throws(() => normalizeExpenseCategories([{ id, name: 'Custom' }]), /IDs/);
    assert.equal(canDeleteExpenseCategory(id, {}, []), false);
    assert.equal(normalizeRecurringRule({id:'rule',name:'Bill',category:id,amount:1,startDate:'2026-01-01'}).category,id);
  }
  const categories = normalizeExpenseCategories([{id:'custom',name:'Custom'}]);
  assert.equal(renameExpenseCategory(categories,'custom','Renamed')[0].id,'custom');
  assert.equal(canDeleteExpenseCategory('custom',{},[]),true);
  assert.equal(canDeleteExpenseCategory('custom',{},[{category:'fixed',versions:[{categoryId:'custom'}]}]),false);
  assert.equal(canDeleteExpenseCategory('custom',{},[{versions:{}}]),false);
  assert.equal(canDeleteExpenseCategory('custom',{},[null]),false);
  assert.equal(canDeleteExpenseCategory('custom',{2026:{months:[{fixed:[],variable:[],expenses:[{categoryId:'custom'}]}]}},[]),false);
  assert.equal(canDeleteExpenseCategory('custom',{2026:{months:[{fixed:[{category_id:'custom'}],variable:[]}]}},[]),false);
  assert.equal(canDeleteExpenseCategory('custom',{2026:{months:[{fixed:[],variable:[],expenses:{}}]}},[]),false);
  assert.throws(()=>normalizeRecurringRule({id:'rule',name:'Bill',category:'missing',amount:1,startDate:'2026-01-01'}),/Unsupported recurring category/);
});

for (const viewport of ['desktop','mobile']) {
 test('category delete handles concurrent database rejection ('+viewport+')', async () => {
  const {deleteExpenseCategory}=await import('../production-next/scripts/expense-category-storage.mjs');
  const row={id:'custom',name:'Custom',updated_at:'2026-01-01T00:00:00Z'};
  const client={from(table){let deleting=false;return {select(){return this;},eq(){return this;},delete(){deleting=true;return this;},then(resolve,reject){return Promise.resolve(deleting?{error:{code:'23503'}}:{data:table==='budget_expense_categories'?[row]:[],error:null}).then(resolve,reject);}};}};
  await assert.rejects(deleteExpenseCategory(client,'owner',[{...row,updatedAt:row.updated_at}],'custom'),/Category is in use by a saved budget or recurring rule/);
 });
}

test('category reference extractor matches supported database shapes', async()=>{
 const {extractBudgetCategoryRefs,canDeleteExpenseCategory}=await import('../production-next/scripts/expense-category-model.mjs');
 assert.deepEqual([...extractBudgetCategoryRefs({months:[{}]})],[]);
 assert.deepEqual([...extractBudgetCategoryRefs({recurringRules:[{versions:[{category:'history'}]}],months:[{expenses:[{categoryId:'custom'}]}]})],['history','custom']);
 for(const entry of [{},{categoryId:null},{categoryId:'a',category_id:'b'}]) assert.throws(()=>extractBudgetCategoryRefs({months:[{expenses:[entry]}]}));
 assert.equal(canDeleteExpenseCategory('history',{2026:{recurringRules:[{category:'history'}]}},[]),false);
});
