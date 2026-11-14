const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");

const app = readFileSync("rollover-budget-app.html", "utf8");
const migration = readFileSync("supabase/migrations/20261114010000_create_budget_ui_years.sql", "utf8");

test("production app uses the production Supabase project and email authentication", () => {
  assert.match(app, /https:\/\/awalptqpsjflrahkrjzk\.supabase\.co/);
  assert.match(app, /id="authEmail"/);
  assert.match(app, /id="authPassword"/);
  assert.match(app, /submitAuth\(\)/);
  assert.match(app, /showForgotPassword\(\)/);
  assert.doesNotMatch(app, /signInWithOAuth|provider:\s*["']github["']/i);
});

test("desktop and mobile recurring-rule views remain separately represented", () => {
  assert.match(app, /id="recurringDesktopView"/);
  assert.match(app, /id="recurringMobileView"/);
  assert.match(app, /\.recurring-desktop-view/);
  assert.match(app, /\.recurring-mobile-view/);
  assert.match(app, /@media\s*\(max-width:\s*768px\)/);
});

test("production year storage migration enforces owner-scoped row security", () => {
  assert.match(migration, /CREATE TABLE public\.budget_ui_years/i);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/i);
  for (const operation of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
    assert.match(migration, new RegExp("FOR " + operation + " TO authenticated", "i"));
  }
  assert.match(migration, /user_id\s*=\s*\(SELECT auth\.uid\(\)\)/i);
  assert.doesNotMatch(migration, /TO\s+PUBLIC\s+USING/i);
});
