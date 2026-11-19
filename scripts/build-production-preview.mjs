import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

const config = { environment: 'production', projectRef: 'awalptqpsjflrahkrjzk', supabaseUrl: 'https://awalptqpsjflrahkrjzk.supabase.co', publishableKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF3YWxwdHFwc2pmbHJhaGtyanprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNzEyMDgsImV4cCI6MjA5MTg0NzIwOH0.Ls-OkgNeABakndkR4Omk5EKSRyU7X2BXDSDoXW4SL40", storagePrefix: 'rollingbudget_production_next_awalptqpsjflrahkrjzk' };
assert.equal(config.environment, 'production');
assert.equal(config.projectRef, 'awalptqpsjflrahkrjzk');
assert.equal(config.supabaseUrl, 'https://awalptqpsjflrahkrjzk.supabase.co');
assert.match(config.publishableKey, /^(sb_publishable_|eyJ)[A-Za-z0-9_.-]+$/);
assert.equal(config.storagePrefix, 'rollingbudget_production_next_awalptqpsjflrahkrjzk');

let html = readFileSync(new URL('../production-next/rollover-budget-app.html', import.meta.url), 'utf8');
function replaceOnce(oldValue, replacement, label) {
  assert.equal(html.split(oldValue).length, 2, label + ': expected one source match');
  html = html.replace(oldValue, replacement);
}
replaceOnce('const SUPABASE_URL = "YOUR_SUPABASE_URL";', 'const SUPABASE_URL = ' + JSON.stringify(config.supabaseUrl) + ';', 'Supabase URL');
replaceOnce('const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";', 'const SUPABASE_ANON_KEY = ' + JSON.stringify(config.publishableKey) + ';', 'Supabase publishable key');
replaceOnce('const STAGING_STORAGE_PREFIX = "YOUR_STAGING_STORAGE_PREFIX";', 'const STAGING_STORAGE_PREFIX = ' + JSON.stringify(config.storagePrefix) + ';', 'Storage namespace');
replaceOnce('<title>Rolling Budget</title>', '<title>Rolling Budget</title>', 'Page title');
replaceOnce('<body>', '<body>\n  <aside role="note" style="padding:10px;text-align:center;background:#fff3cd;color:#332701;border-bottom:2px solid #946200;font-weight:700">PRODUCTION PREVIEW — NOT DEPLOYED — ' + config.projectRef + '</aside>', 'Staging banner');

assert.ok(html.includes('function storageKey(year)'), 'Account-scoped storage is missing');
assert.ok(html.includes('from("budget_ui_years").select("year,budget_data,updated_at")'), 'Cloud data loading is missing');
// Cloud writes are centralized in the shared revision module, not embedded in HTML.
const revisionSource = readFileSync(new URL('./budget-revision.mjs', import.meta.url), 'utf8');
assert.ok(html.includes("import('./scripts/budget-revision.mjs')"), 'Shared revision module must be loaded by the app');
assert.ok(html.includes('writeBudgetRevision('), 'Budget saves must use the shared revision guard');
assert.match(revisionSource, /\.insert\(\{/, 'New cloud year insert is missing from revision module');
assert.match(revisionSource, /\.eq\('updated_at', knownRevision\)\.select\('year'\)/,
  'Conditional cloud revision saving is missing from revision module');
// Guard both distinct recurring-manager forms in the deployed HTML, not only source tests.
for (const view of ['desktop', 'mobile']) {
  const form = html.match(new RegExp('data-recurring-form="' + view + '"[^>]*>([\\s\\S]*?)(?:</div>\\s*<div class="recurring-form-actions"|</div>\\s*<button class="primary recurring-mobile-add-button")'));
  assert.ok(form, view + ' recurring form missing from staging build');
  assert.match(form[1], /data-rec-field="startDate"[^>]*type="date"/, view + ' Start date missing');
  assert.match(form[1], /data-rec-field="endDate"[^>]*type="date"/, view + ' optional End date missing');
  assert.doesNotMatch(form[1], /data-rec-field="(?:due|startMonth)"|>\\s*(?:Due day|Start month)\\s*</i,
    view + ' legacy recurring date fields must not be deployed');
}

assert.ok(!html.includes('YOUR_SUPABASE_'), 'Unconfigured Supabase placeholder remains');
assert.ok(!html.includes('YOUR_STAGING_STORAGE_PREFIX'), 'Unconfigured storage placeholder remains');
assert.ok(!html.includes('phiscfwfuzeptetimdbo'), 'Staging project reference remains');
assert.ok(!html.includes('sb_secret_'), 'Secret key marker found');
assert.ok(!html.includes('localStorage.removeItem(storageKey('), 'Build must not delete budget records');
assert.ok(html.includes('budget-year-toolbar'), 'Budget year selector must be present outside Settings');
assert.ok(html.includes('id="desktopCopyPreviousYear"') && html.includes('id="mobileCopyPreviousYear"'), 'Both budget plan copy controls must be present');
assert.ok(!html.includes('data-settings-section="years"') &&
  !html.includes('data-mobile-settings-section="years"'), 'Year submenu must be removed from both Settings views');
assert.ok(!html.includes('onclick="createNewYear()"'), 'Manual year creation must not return');
assert.ok(html.includes("localStorage.removeItem(conflictStorageKey(year, owner))") &&
  html.includes("localStorage.setItem(conflictStorageKey(year, owner), '1')") &&
  html.includes("key !== owner + ':' + year"),
  'Conflict marker creation and cleanup must remain scoped to the original owner and year');
assert.ok(html.includes('function esc(str)') && html.includes('&lt;'), 'HTML text escaping is missing');

let confirmationHtml = readFileSync(new URL('../production-next/auth-confirmation.html', import.meta.url), 'utf8');
function replaceConfirmationOnce(oldValue, replacement, label) {
  assert.equal(confirmationHtml.split(oldValue).length, 2, label + ': expected one source match');
  confirmationHtml = confirmationHtml.replace(oldValue, replacement);
}
replaceConfirmationOnce('const SUPABASE_URL = "YOUR_SUPABASE_URL";', 'const SUPABASE_URL = ' + JSON.stringify(config.supabaseUrl) + ';', 'Confirmation Supabase URL');
replaceConfirmationOnce('const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";', 'const SUPABASE_ANON_KEY = ' + JSON.stringify(config.publishableKey) + ';', 'Confirmation publishable key');
replaceConfirmationOnce('const STAGING_STORAGE_PREFIX = "YOUR_STAGING_STORAGE_PREFIX";', 'const STAGING_STORAGE_PREFIX = ' + JSON.stringify(config.storagePrefix) + ';', 'Confirmation storage namespace');
replaceConfirmationOnce('<title>Confirm your Rolling Budget email</title>', '<title>Confirm your Rolling Budget email</title>', 'Confirmation page title');
replaceConfirmationOnce('<body>', '<body>\n  <aside role="note" style="padding:10px;text-align:center;background:#fff3cd;color:#332701;border-bottom:2px solid #946200;font-weight:700">PRODUCTION PREVIEW — NOT DEPLOYED — ' + config.projectRef + '</aside>', 'Confirmation staging banner');
assert.ok(!confirmationHtml.includes('YOUR_SUPABASE_'), 'Confirmation page has an unconfigured Supabase placeholder');
assert.ok(!confirmationHtml.includes('YOUR_STAGING_STORAGE_PREFIX'), 'Confirmation page has an unconfigured storage placeholder');

let resetHtml = readFileSync(new URL('../production-next/reset-password.html', import.meta.url), 'utf8');
function replaceResetOnce(oldValue, replacement, label) {
  assert.equal(resetHtml.split(oldValue).length, 2, label + ': expected one source match');
  resetHtml = resetHtml.replace(oldValue, replacement);
}
replaceResetOnce('const SUPABASE_URL = "YOUR_SUPABASE_URL";', 'const SUPABASE_URL = ' + JSON.stringify(config.supabaseUrl) + ';', 'Reset Supabase URL');
replaceResetOnce('const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";', 'const SUPABASE_ANON_KEY = ' + JSON.stringify(config.publishableKey) + ';', 'Reset publishable key');
replaceResetOnce('const STAGING_STORAGE_PREFIX = "YOUR_STAGING_STORAGE_PREFIX";', 'const STAGING_STORAGE_PREFIX = ' + JSON.stringify(config.storagePrefix) + ';', 'Reset storage namespace');
replaceResetOnce('<title>Reset your Rolling Budget password</title>', '<title>Reset your Rolling Budget password</title>', 'Reset page title');
replaceResetOnce('<body>', '<body>\n  <aside role="note" style="padding:10px;text-align:center;background:#fff3cd;color:#332701;border-bottom:2px solid #946200;font-weight:700">PRODUCTION PREVIEW — NOT DEPLOYED — ' + config.projectRef + '</aside>', 'Reset staging banner');
assert.ok(!resetHtml.includes('YOUR_SUPABASE_'), 'Reset page has an unconfigured Supabase placeholder');
assert.ok(!resetHtml.includes('YOUR_STAGING_STORAGE_PREFIX'), 'Reset page has an unconfigured storage placeholder');
assert.ok(!resetHtml.includes('phiscfwfuzeptetimdbo'), 'Staging project reference remains in reset page');
assert.ok(!resetHtml.includes('sb_secret_'), 'Secret key marker found in reset page');
assert.ok(resetHtml.includes('auth.updateUser({ password })'), 'Reset page does not update the authenticated password');
mkdirSync('production-preview-dist', { recursive: true });
writeFileSync('production-preview-dist/rollover-budget-app.html', html);
writeFileSync('production-preview-dist/auth-confirmation.html', confirmationHtml);
writeFileSync('production-preview-dist/reset-password.html', resetHtml);
let homeHtml = readFileSync(new URL('../production-next/index.html', import.meta.url), 'utf8');
homeHtml = homeHtml.replace('YOUR_SUPABASE_URL', config.supabaseUrl).replace('YOUR_SUPABASE_ANON_KEY', config.publishableKey).replace('YOUR_STAGING_STORAGE_PREFIX', config.storagePrefix);
assert.ok(!homeHtml.includes('YOUR_SUPABASE_') && !homeHtml.includes('YOUR_STAGING_STORAGE_PREFIX'));
writeFileSync('production-preview-dist/index.html', homeHtml);
mkdirSync('production-preview-dist/app', { recursive: true });
writeFileSync('production-preview-dist/app/index.html', html);
const brandCss = readFileSync(new URL('../production-next/styles/brand.css', import.meta.url), 'utf8');
mkdirSync('production-preview-dist/styles', { recursive: true });
mkdirSync('production-preview-dist/app/styles', { recursive: true });
writeFileSync('production-preview-dist/styles/brand.css', brandCss);
writeFileSync('production-preview-dist/styles/settings.css', readFileSync(new URL('../production-next/styles/settings.css', import.meta.url), 'utf8'));
writeFileSync('production-preview-dist/app/styles/settings.css', readFileSync(new URL('../production-next/styles/settings.css', import.meta.url), 'utf8'));
writeFileSync('production-preview-dist/styles/homepage.css', readFileSync(new URL('../production-next/styles/homepage.css', import.meta.url), 'utf8'));
writeFileSync('production-preview-dist/app/styles/brand.css', brandCss);
for (const path of [
  'account-model.mjs', 'account-storage.mjs', 'account-budget.mjs',
  'expense-category-model.mjs', 'expense-category-storage.mjs', 'expense-entry-migration.mjs', 'year-discovery.mjs', 'year-plan.mjs', 'due-day.mjs', 'budget-revision.mjs',
  'recurring-foundation.mjs', 'recurring-scheduler.mjs',
  'recurring-budget-preview.mjs', 'recurring-app-service.mjs'
]) {
  const source = readFileSync(new URL('./' + path, import.meta.url));
  mkdirSync('production-preview-dist/scripts', { recursive: true });
  mkdirSync('production-preview-dist/app/scripts', { recursive: true });
  writeFileSync('production-preview-dist/scripts/' + path, source);
  writeFileSync('production-preview-dist/app/scripts/' + path, source);
}
writeFileSync('production-preview-dist/.nojekyll', '');
console.log('Built the redesigned production preview UI from rollover-budget-app.html for', config.projectRef);
