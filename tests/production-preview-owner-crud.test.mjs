import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccount, loadOrSeedAccounts } from '../production-next/scripts/account-storage.mjs';
import { createRecurringRule, loadRecurringPreviewRules, removeRecurringRule } from '../production-next/scripts/recurring-app-service.mjs';

// Isolated owner-scoped mock: every test starts with no accounts, rules or budget records.
function syntheticClient() {
  const rows = { budget_accounts: [], budget_recurring_rules: [], budget_expense_categories: [] };
  const calls = [];
  return {
    rows, calls,
    from(table) {
      let owner = null;
      let id = null;
      let action = null;
      let payload = null;
      const query = {
        select() { return this; },
        eq(field, value) {
          if (field === 'user_id') { owner = value; calls.push({ table, owner }); }
          if (field === 'id') id = value;
          return this;
        },
        insert(value) { action = 'insert'; payload = value; return this; },
        delete() { action = 'delete'; return this; },
        then(resolve, reject) {
          let data;
          if (action === 'insert') {
            assert.equal(payload.user_id, owner ?? payload.user_id);
            rows[table].push(structuredClone(payload));
            data = null;
          } else if (action === 'delete') {
            const matches = rows[table].filter(row => row.user_id === owner && (id === null || row.id === id));
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
    await removeRecurringRule(client, a, 'rent-a');
    assert.deepEqual((await loadRecurringPreviewRules(client, a)).rules, []);
    assert.deepEqual((await loadOrSeedAccounts(client, b)).map(item => item.name), ['Checking B']);
    assert.ok(client.calls.some(call => call.table === 'budget_recurring_rules' && call.owner === a));
    assert.ok(client.calls.some(call => call.table === 'budget_recurring_rules' && call.owner === b));
  });
}
