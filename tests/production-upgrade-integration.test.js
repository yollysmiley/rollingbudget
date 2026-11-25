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

test("standalone SQL fixtures retain matching DO block delimiters", () => {
  const { readdirSync } = require("node:fs");
  for (const name of readdirSync("tests").filter(name => name.endsWith(".sql"))) {
    const sql = readFileSync("tests/" + name, "utf8");
    assert.doesNotMatch(sql, /(?:^\s*DO\s+\$(?![\w$])|\bEND\s+\$;)/m, name);
    const opens = [...sql.matchAll(/^\s*DO\s+(\$(?:[A-Za-z_]\w*)?\$)/gm)].map(m => m[1]);
    const closes = [...sql.matchAll(/\bEND\s+(\$(?:[A-Za-z_]\w*)?\$);/g)].map(m => m[1]);
    assert.deepEqual(opens, closes, name);
  }
});

test("administrative access contract runs in shared upgrade and restore fixture", () => {
 const sql = readFileSync("tests/default-privileges-runtime.sql", "utf8");
 assert.ok(sql.includes("DO $administrative_contract$"));
 for (const runner of [upgrade, restore]) assert.ok(runner.includes("-f tests/default-privileges-runtime.sql"));
});

test("recurring category migration is explicit and owner scoped", () => {
 const path = "supabase/migrations/20261125120000_enforce_recurring_category_owner.sql";
 assert.ok(upgrade.includes(path));
 assert.match(readFileSync(path,"utf8"), /FOREIGN KEY \(user_id,custom_category_id\)/);
 assert.ok(readFileSync("tests/default-privileges-runtime.sql","utf8").includes("DO $category_cross_owner$"));
});

test("embedded category migration is explicit and private", () => {
 const path="supabase/migrations/20261125121000_protect_embedded_category_refs.sql";
 assert.ok(upgrade.includes(path));
 const sql=readFileSync(path,"utf8");
 assert.match(sql,/FOREIGN KEY \(user_id,category_id\)/);
 assert.match(sql,/AFTER INSERT OR UPDATE/);
 assert.match(sql,/SET search_path = pg_catalog/);
 assert.ok(readFileSync("tests/default-privileges-runtime.sql","utf8").includes("DO $embedded_refs$"));
});

test("historical category integrity migration is included",()=>{
 const path="supabase/migrations/20261125122000_complete_category_references.sql";
 assert.ok(upgrade.includes(path));
 assert.match(readFileSync(path,"utf8"),/FOREIGN KEY\(user_id,category_id\)/);
 assert.ok(readFileSync("tests/default-privileges-runtime.sql","utf8").includes("DO $historical_refs$"));
});
