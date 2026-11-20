import test from 'node:test';
import assert from 'node:assert/strict';
import { backfillRecurringYear, commitRecurringYear, requireRecurringCloudSnapshot } from '../production-next/scripts/recurring-app-service.mjs';

// Every test starts with a fresh synthetic owner, empty account catalog and no legacy budget records.
const owner = 'synthetic-hardening-owner';
const other = 'synthetic-other-owner';
const revision = '2026-01-01T00:00:00.000Z';
function emptyYear() {
  return { months: Array.from({ length: 12 }, () => ({
    income: [], fixed: [], variable: [], loans: [], creditCards: []
  })) };
}
function clientFixture({ withRule = true, withYear = true } = {}) {
  const rows = {
    budget_recurring_rules: withRule ? [{
      user_id: owner, id: 'rent', name: 'Rent', category: 'fixed', amount: 500,
      due_day: 1, account_id: null, frequency: 'monthly',
      start_date: '2026-01-01', end_date: null, active: true, source_year: null,
      versions: [{ effectiveFrom: '2026-01-01', name: 'Rent', amount: 500,
        dueDay: 1, accountId: null, frequency: 'monthly', enabled: true }]
    }] : [],
    budget_ui_years: withYear ? [{
      user_id: owner, year: 2026, budget_data: emptyYear(), updated_at: revision
    }] : [],
    budget_expense_categories: []
  };
  const state = { writes: 0, failWrite: false, beforeWrite: null };
  const client = {
    from(table) {
      let action = 'read', payload, filters = [];
      const query = {
        select() { return this; },
        eq(key, value) { filters.push([key, value]); return this; },
        update(value) { action = 'update'; payload = value; return this; },
        insert(value) { action = 'insert'; payload = value; return this; },
        then(resolve, reject) {
          const run = () => {
            const matches = row => filters.every(([key, value]) =>
              key === 'versions' ? JSON.stringify(row[key]) === value : row[key] === value);
            if (action === 'read') return { data: rows[table].filter(matches).map(row => structuredClone(row)), error: null };
            if (state.failWrite) return { data: null, error: new Error('Synthetic cloud write unavailable') };
            state.beforeWrite?.(rows);
            if (action === 'insert') {
              if (rows[table].some(row => row.user_id === payload.user_id && row.year === payload.year)) {
                return { data: null, error: new Error('Duplicate year') };
              }
              rows[table].push(structuredClone(payload));
              state.writes++;
              return { data: null, error: null };
            }
            const selected = rows[table].filter(matches);
            for (const row of selected) Object.assign(row, structuredClone(payload));
            state.writes += selected.length;
            return { data: selected.map(row => ({ year: row.year })), error: null };
          };
          return Promise.resolve().then(run).then(resolve, reject);
        }
      };
      return query;
    }
  };
  return { client, rows, state };
}
function countOccurrences(document) {
  return document.months.flatMap(month => month.fixed).filter(item => item.recurringRuleId === 'rent').length;
}

test('backfill appends missing months once and preserves existing manual and historical entries', async () => {
  const { client, rows, state } = clientFixture();
  const existing = { name: 'Manual electricity', amount: 80 };
  const historical = { name: 'Rent', amount: 425, recurringRuleId: 'rent',
    occurrenceId: JSON.stringify(['rent', '2026-01-01']) };
  rows.budget_ui_years[0].budget_data.months[0].fixed.push(existing, historical);
  const first = await backfillRecurringYear(client, owner, 2026);
  assert.equal(first.added, 11);
  assert.equal(first.saved, true);
  assert.equal(countOccurrences(rows.budget_ui_years[0].budget_data), 12);
  assert.deepEqual(rows.budget_ui_years[0].budget_data.months[0].fixed, [existing, historical]);
  const second = await backfillRecurringYear(client, owner, 2026);
  assert.equal(second.added, 0);
  assert.equal(second.saved, false);
  assert.equal(state.writes, 1, 'idempotent rerun must not issue a cloud write');
  assert.deepEqual(rows.budget_ui_years[0].budget_data.months[0].fixed, [existing, historical]);
  assert.equal((await backfillRecurringYear(client, other, 2026)).added, 0, 'other owner has no rules');
});

test('ambiguous manual duplicates are held without overwriting or silently duplicating', async () => {
  const { client, rows } = clientFixture();
  const manual = { name: 'Rent', amount: 500 };
  rows.budget_ui_years[0].budget_data.months[1].fixed.push(manual);
  const result = await backfillRecurringYear(client, owner, 2026);
  assert.equal(result.added, 11);
  assert.equal(result.ambiguous.length, 1);
  assert.deepEqual(rows.budget_ui_years[0].budget_data.months[1].fixed, [manual]);
  const again = await backfillRecurringYear(client, owner, 2026);
  assert.equal(again.added, 0);
  assert.equal(again.ambiguous.length, 1);
});

test('cloud write failure leaves authoritative budget unchanged and reports error', async () => {
  const { client, rows, state } = clientFixture();
  const before = structuredClone(rows.budget_ui_years[0]);
  state.failWrite = true;
  await assert.rejects(backfillRecurringYear(client, owner, 2026), /cloud write unavailable/);
  assert.deepEqual(rows.budget_ui_years[0], before);
  assert.equal(state.writes, 0);
  state.failWrite = false;
  assert.equal((await backfillRecurringYear(client, owner, 2026)).added, 12);
  assert.equal(state.writes, 1);
});

test('stale expected revision and concurrent cloud writes reject without overwriting newer data', async () => {
  const { client, rows, state } = clientFixture();
  await assert.rejects(
    backfillRecurringYear(client, owner, 2026, { expectedUpdatedAt: '2025-12-01T00:00:00.000Z' }),
    /changed since recurring synchronization/);
  assert.equal(state.writes, 0);
  state.beforeWrite = db => {
    db.budget_ui_years[0].updated_at = '2026-01-02T00:00:00.000Z';
    db.budget_ui_years[0].budget_data.months[0].fixed.push({ name: 'Other device entry', amount: 99 });
    state.beforeWrite = null;
  };
  await assert.rejects(backfillRecurringYear(client, owner, 2026), /changed on another device/);
  assert.equal(state.writes, 0);
  assert.deepEqual(rows.budget_ui_years[0].budget_data.months[0].fixed,
    [{ name: 'Other device entry', amount: 99 }]);
  const recovered = await backfillRecurringYear(client, owner, 2026,
    { expectedUpdatedAt: '2026-01-02T00:00:00.000Z' });
  assert.equal(recovered.added, 12);
  assert.deepEqual(rows.budget_ui_years[0].budget_data.months[0].fixed[0],
    { name: 'Other device entry', amount: 99 });
});

test('owner changes, local conflicts and cancelled commits reject without writes', async () => {
  const { client, rows, state } = clientFixture();
  assert.throws(() => requireRecurringCloudSnapshot({
    owner, activeOwner: other, cloudRow: rows.budget_ui_years[0],
    knownRevision: revision, inMemoryBudget: rows.budget_ui_years[0].budget_data
  }), /owner changed/);
  assert.throws(() => requireRecurringCloudSnapshot({
    owner, activeOwner: owner, cloudRow: rows.budget_ui_years[0],
    knownRevision: revision, inMemoryBudget: rows.budget_ui_years[0].budget_data,
    conflicted: true
  }), /reconciliation/);
  await assert.rejects(commitRecurringYear(client, owner, 2026,
    document => ({ document, added: 1 }), { canCommit: () => false }), /cancelled/);
  assert.equal(state.writes, 0);
});
