const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");

const migration = readFileSync(
  "supabase/migrations/20261114190000_tighten_legacy_budget_data_access.sql",
  "utf8"
);

test("legacy budget hardening removes anonymous and elevated table grants", () => {
  assert.match(migration, /REVOKE ALL PRIVILEGES[\s\S]*FROM PUBLIC, anon/i);
  assert.match(migration, /REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN[\s\S]*FROM authenticated/i);
  assert.match(migration, /GRANT SELECT, INSERT, UPDATE, DELETE[\s\S]*TO authenticated/i);
});

test("legacy budget hardening replaces broad policies with four authenticated owner policies", () => {
  for (const operation of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
    assert.match(
      migration,
      new RegExp("FOR " + operation + "[\\s\\S]*?TO authenticated", "i")
    );
  }
  assert.match(migration, /USING \(user_id = \(SELECT auth\.uid\(\)\)\)/i);
  assert.match(migration, /WITH CHECK \(user_id = \(SELECT auth\.uid\(\)\)\)/i);
  assert.match(migration, /DROP POLICY IF EXISTS "Users own their data"/i);
});

test("legacy budget hardening never changes or deletes financial records", () => {
  assert.doesNotMatch(migration, /\b(TRUNCATE TABLE|DELETE FROM|DROP TABLE|ALTER TABLE)\b/i);
  assert.doesNotMatch(migration, /(?:FROM|ON|TABLE)\s+public\.budget_ui_years/i);
});

test("migration checks effective grants before commit",()=>{assert.match(migration,/has_table_privilege/);assert.match(migration,/SET LOCAL lock_timeout/);assert.match(migration,/relrowsecurity/);});

test('migration rejects unexpected column grants, delegation and role escalation',()=>{for(const guard of ['has_any_column_privilege','WITH GRANT OPTION','pg_has_role','rolbypassrls','Missing service privilege']) assert.ok(migration.includes(guard),guard);});
