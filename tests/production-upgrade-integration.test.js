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


test("default privilege probes run after upgrade and restoration", () => {
  const fs = require("node:fs");
  for (const path of ["scripts/verify-production-upgrade.sh", "scripts/verify-production-restore.sh"]) {
    require("node:assert/strict").match(fs.readFileSync(path, "utf8"), /-f tests\/default-privileges-runtime\.sql/);
  }
});

test("upgrade checks fixtures before database execution", () => {
 assert.ok(upgrade.indexOf('test -r "$fixture"') >= 0);
 assert.ok(upgrade.indexOf('test -r "$fixture"') < upgrade.indexOf("psql -X"));
 assert.ok(restore.includes('test -r "$fixture"'));
});
