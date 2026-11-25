const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const upgrade = readFileSync("scripts/verify-production-upgrade.sh", "utf8");
const restore = readFileSync("scripts/verify-production-restore.sh", "utf8");

test("embedded SQL DO blocks retain matching dollar delimiters", () => {
  for (const script of [upgrade, restore]) {
    const openings = [...script.matchAll(/^DO (\$\w*\$)\s*$/gm)].map(m => m[1]);
    const closings = [...script.matchAll(/^END (\$\w*\$);\s*$/gm)].map(m => m[1]);
    assert.doesNotMatch(script, /^(?:DO \$|END \$;)\s*$/m);
    assert.deepEqual(openings, closings);
    assert.ok(openings.length > 0);
  }
  for (const tag of ["owner_isolation", "missing_jwt", "data_preservation"]) {
    assert.ok(upgrade.includes("DO $" + tag + "$"));
    assert.ok(upgrade.includes("END $" + tag + "$;"));
  }
});

test("legacy restoration compares all four columns in both directions", () => {
  const columns = "id,user_id,state,updated_at";
  assert.ok(restore.includes("SELECT " + columns + " FROM public.budget_data EXCEPT SELECT * FROM audit_snapshot.before_legacy"));
  assert.ok(restore.includes("SELECT " + columns + " FROM audit_snapshot.before_legacy EXCEPT SELECT " + columns + " FROM public.budget_data"));
  assert.doesNotMatch(restore, /SELECT user_id,state,updated_at FROM (?:audit_snapshot\.before_legacy|public\.budget_data)/);
});
