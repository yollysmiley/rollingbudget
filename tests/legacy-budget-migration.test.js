const test = require("node:test");
const assert = require("node:assert/strict");
const { convertLegacyStateToYearRows } = require("../scripts/legacy-budget-migration.js");

test("converts legacy year rows and all budget categories", () => {
  const legacy = {
    years: [{
      year: "2026",
      activeMonth: 4,
      months: Array.from({ length: 12 }, (_, index) => ({
        name: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][index],
        startRollover: index * 10,
        endRollover: index * 20,
        paychecks: index === 0 ? [{ name: "Paycheck", date: "2026-01-01", amount: "1000", balanceAfter: 850, bucketExpenses: 150 }] : [],
        expenses: index === 0 ? [
          { name: "Rent", amount: "800", dueDay: 1, category: "Fixed Expenses", bucketIndex: 0, fromRecurring: true },
          { name: "Power", amount: "50", dueDay: 12, category: "Variable Expenses" },
          { name: "Card", amount: "75", dueDay: 18, category: "Credit Cards" },
          { name: "Loan", amount: "125", dueDay: 20, category: "Loans" },
          { name: "Unexpected", amount: "30", dueDay: 3, category: "Unexpected" }
        ] : [],
        excludedBuckets: [{ name: "Savings", amount: 20, balance: 40, note: "reserve" }]
      }))
    }],
    recurring: [
      { name: "Rent", amount: "800", dueDay: 1, category: "Fixed Expenses" },
      { name: "Card", amount: 75, dueDay: 18, category: "Credit Cards" }
    ]
  };

  const [row] = convertLegacyStateToYearRows(legacy, "user-1", "2026-10-01T00:00:00Z");
  assert.equal(row.user_id, "user-1");
  assert.equal(row.year, 2026);
  assert.equal(row.updated_at, "2026-10-01T00:00:00Z");
  assert.equal(row.budget_data.months.length, 12);
  assert.equal(row.budget_data.autoCascade, true);
  assert.equal(row.budget_data.months[0].income[0].cpm, 1000);
  assert.equal(row.budget_data.months[0].income[0].legacyPaycheck.balanceAfter, 850);
  assert.equal(row.budget_data.months[0].fixed[0].amount, 800);
  assert.equal(row.budget_data.months[0].variable.length, 2);
  assert.equal(row.budget_data.months[0].creditCards[0].payment, 75);
  assert.equal(row.budget_data.months[0].loans[0].payment, 125);
  assert.equal(row.budget_data.months[0].legacyMetadata.excludedBuckets[0].balance, 40);
  assert.equal(row.budget_data.months[0].recordedLeftover, 0);
  assert.equal(row.budget_data.recurringRules[0].cat, "fixed");
  assert.equal(row.budget_data.recurringRules[1].cat, "cc");
  assert.equal(row.budget_data.legacyMetadata.activeMonthIndex, 4);
});

test("supports multiple years and defaults missing optional arrays safely", () => {
  const makeYear = year => ({ year, months: Array.from({ length: 12 }, () => ({})) });
  const rows = convertLegacyStateToYearRows({ years: [makeYear("2026"), makeYear("2027")] }, "u", null);
  assert.deepEqual(rows.map(row => row.year), [2026, 2027]);
  assert.equal(rows[0].budget_data.months[0].name, "January");
  assert.deepEqual(rows[0].budget_data.months[0].income, []);
});

test("rejects missing, malformed, duplicate, and invalid years", () => {
  assert.throws(() => convertLegacyStateToYearRows({}, "u"), /does not contain any years/);
  assert.throws(() => convertLegacyStateToYearRows({ years: [{ year: 2026, months: [] }] }, "u"), /exactly 12 months/);
  assert.throws(() => convertLegacyStateToYearRows({ years: [{ year: 1800, months: Array(12).fill({}) }] }, "u"), /invalid year/);
  assert.throws(() => convertLegacyStateToYearRows({ years: [{ year: 2026, months: Array(12).fill({}) }, { year: 2026, months: Array(12).fill({}) }] }, "u"), /duplicate years/);
});
