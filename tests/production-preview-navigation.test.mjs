import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync('production-preview-dist/app/index.html', 'utf8');
const home = readFileSync('production-preview-dist/index.html', 'utf8');

test('preview routes use query-based history navigation and restore page on back/refresh', () => {
  assert.match(app, /const APP_PAGES = \["overview", "budget", "recurring-rules", "settings"\]/);
  assert.match(app, /searchParams\.get\("page"\)/);
  assert.match(app, /searchParams\.set\("page", page\)/);
  assert.match(app, /history\.pushState\(/);
  assert.match(app, /history\.replaceState\(/);
  assert.match(app, /addEventListener\("popstate", \(\) => applyPage\(pageFromLocation\(\)\)\)/);
  assert.match(app, /button\.setAttribute\("aria-current", "page"\)/);
  assert.match(app, /button\.removeAttribute\("aria-current"\)/);
});

test('desktop and mobile menus map to the same protected pages', () => {
  for (const id of ['desktopOverviewButton', 'desktopBudgetButton', 'desktopRecurringButton', 'desktopSettingsButton', 'mobileMenuButton', 'mobileSidebar']) {
    assert.ok(app.includes('id="' + id + '"'), 'Missing navigation element: ' + id);
  }
  for (const route of ['overview', 'plan', 'settings']) {
    assert.ok(app.includes('data-mobile-tab="' + route + '"'), 'Missing mobile tab: ' + route);
  }
  assert.match(app, /data-mobile-action="recurring"/);
  assert.match(app, /const target = button\.dataset\.mobileTab === "plan" \? "budget"/);
  assert.match(app, /toggleMobileSidebar\(false\)/);
});

test('preview app gates cloud loading behind a verified user and clears owner state on sign-out', () => {
  assert.match(app, /await supabaseClient\.auth\.getUser\(\)/);
  assert.match(app, /if \(error \|\| !user\) \{\s*window\.location\.replace\(home\)/);
  assert.match(app, /if \(event === "SIGNED_OUT" \|\| !session\?\.user\)/);
  assert.match(app, /currentUser = null/);
  assert.match(app, /budgetAccounts = \[\]/);
  assert.match(app, /db = \{\}/);
  assert.match(app, /classList\.remove\("budget-authenticated"\)/);
  assert.match(app, /STAGING_STORAGE_PREFIX \+ "_" \+ \(currentUser\?\.id \|\| "guest"\)/);
  assert.match(home, /rollingbudget_production_next_awalptqpsjflrahkrjzk/);
  assert.doesNotMatch(home + app, /phiscfwfuzeptetimdbo|YOUR_SUPABASE_URL|YOUR_SUPABASE_ANON_KEY/);
});
