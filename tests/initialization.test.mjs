import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../rollover-budget-app.html', import.meta.url), 'utf8');
const start = html.indexOf('const SUPABASE_URL =');
const end = html.indexOf('let modalSelections', start);
assert.ok(start >= 0 && end > start, 'Initialization boundaries changed: review the harness');
const source = html.slice(start, end);
assert.ok(!source.includes('</script>'), 'Unexpected script boundary');

function fixture(year = '2030') {
  return { activeYearIndex: 0, recurring: [], years: [{ year, activeMonth: 0, months: [{ name: 'January', paychecks: [], expenses: [], excludedBuckets: [] }] }] };
}

function boot(values = {}, options = {}) {
  const reads = [];
  const writes = [];
  const errors = [];
  let clients = 0;
  const client = {};
  const context = vm.createContext({
    console: { error: (...args) => errors.push(args) },
    localStorage: {
      getItem(key) {
        reads.push(key);
        if (options.storageDenied) throw new Error('Storage denied');
        return Object.hasOwn(values, key) ? values[key] : null;
      },
      setItem(...args) { writes.push(args); throw new Error('Initialization must not write storage'); }
    }
  });
  if (!options.sdkMissing) context.supabase = {
    createClient() { clients++; return client; }
  };
  vm.runInContext(source, context, { timeout: 1000 });
  return {
    state: JSON.parse(vm.runInContext('JSON.stringify(state)', context)),
    reads, writes, errors, clients,
    clientReady: vm.runInContext('supabaseClient !== null', context)
  };
}

test('empty storage creates the current default year and income', () => {
  const result = boot();
  assert.equal(result.state.years[0].year, '2026');
  assert.equal(result.state.years[0].months.length, 12);
  assert.equal(result.state.years[0].months.reduce((sum, m) => sum + m.paychecks[0].amount, 0), 30000);
  assert.deepEqual(result.reads, ['rollover_pro_v5', 'rollover_pro_v4']);
  assert.deepEqual(result.writes, []);
});

test('valid v5 takes precedence without reading v4', () => {
  const expected = fixture('2031');
  const result = boot({ rollover_pro_v5: JSON.stringify(expected), rollover_pro_v4: '{broken' });
  assert.deepEqual(result.state, expected);
  assert.deepEqual(result.reads, ['rollover_pro_v5']);
});

test('missing v5 falls back to valid v4 without persisting a migration', () => {
  const expected = fixture('2032');
  const result = boot({ rollover_pro_v4: JSON.stringify(expected) });
  assert.deepEqual(result.state, expected);
  assert.deepEqual(result.writes, []);
});

test('JSON null v5 also falls back to v4', () => {
  const result = boot({ rollover_pro_v5: 'null', rollover_pro_v4: JSON.stringify(fixture('2033')) });
  assert.equal(result.state.years[0].year, '2033');
});

test('KNOWN DEFECT: malformed v5 prevents valid v4 recovery', () => {
  assert.throws(() => boot({ rollover_pro_v5: '{broken', rollover_pro_v4: JSON.stringify(fixture()) }), error => error.name === 'SyntaxError');
});

test('KNOWN DEFECT: malformed v4 prevents default initialization', () => {
  assert.throws(() => boot({ rollover_pro_v4: '{broken' }), error => error.name === 'SyntaxError');
});

test('KNOWN DEFECT: denied storage aborts initialization', () => {
  assert.throws(() => boot({}, { storageDenied: true }), /Storage denied/);
});

test('missing SDK is caught and local state can initialize', () => {
  const result = boot({}, { sdkMissing: true });
  assert.equal(result.clientReady, false);
  assert.equal(result.errors.length, 1);
  assert.equal(result.state.years.length, 1);
});

test('SDK client creation uses the mock only', () => {
  const result = boot();
  assert.equal(result.clients, 1);
  assert.equal(result.clientReady, true);
});

test('normalization supplies expense and excluded arrays', () => {
  const raw = fixture();
  delete raw.years[0].months[0].expenses;
  delete raw.years[0].months[0].excludedBuckets;
  const result = boot({ rollover_pro_v5: JSON.stringify(raw) });
  assert.deepEqual(result.state.years[0].months[0].expenses, []);
  assert.deepEqual(result.state.years[0].months[0].excludedBuckets, []);
});

test('KNOWN DEFECT: missing paycheck arrays remain unrepaired', () => {
  const raw = fixture();
  delete raw.years[0].months[0].paychecks;
  const result = boot({ rollover_pro_v5: JSON.stringify(raw) });
  assert.equal(result.state.years[0].months[0].paychecks, undefined);
});

test('KNOWN DEFECT: invalid active indices remain unrepaired', () => {
  const raw = fixture();
  raw.activeYearIndex = 99;
  raw.years[0].activeMonth = 99;
  const result = boot({ rollover_pro_v5: JSON.stringify(raw) });
  assert.equal(result.state.activeYearIndex, 99);
  assert.equal(result.state.years[0].activeMonth, 99);
});

test('KNOWN DEFECT: non-array years throws during normalization', () => {
  assert.throws(() => boot({ rollover_pro_v5: JSON.stringify({ years: {} }) }), error => error.name === 'TypeError');
});
