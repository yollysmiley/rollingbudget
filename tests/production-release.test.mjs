import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const read = path => readFileSync('production-release-dist/' + path, 'utf8');
test('release retains all routes, configuration and shared assets', () => {
  for (const page of ['index.html','app/index.html','rollover-budget-app.html','auth-confirmation.html','reset-password.html']) {
    const html = read(page);
    assert.match(html, /awalptqpsjflrahkrjzk/);
    assert.match(html, /rollingbudget_production_next_awalptqpsjflrahkrjzk/);
    assert.doesNotMatch(html, /PRODUCTION PREVIEW — NOT DEPLOYED|YOUR_SUPABASE_|YOUR_STAGING_STORAGE_PREFIX|phiscfwfuzeptetimdbo|sb_secret_/);
  }
  assert.equal(read('app/index.html'), read('rollover-budget-app.html'));
  for (const prefix of ['', 'app/']) {
    for (const path of ['scripts/budget-revision.mjs','styles/brand.css','styles/settings.css']) {
      assert.ok(existsSync('production-release-dist/' + prefix + path));
    }
  }
  assert.ok(existsSync('production-release-dist/.nojekyll'));
  assert.match(read('app/index.html'), /recurringDesktopView/);
  assert.match(read('app/index.html'), /recurringMobileView/);
  assert.match(read('index.html'), /new URL\("reset-password.html",location.href\)/);
  assert.match(read('index.html'), /new URL\("auth-confirmation.html",location.href\)/);
});
test('release preserves preview source and changes only preview banners', () => {
  for (const page of ['app/index.html','rollover-budget-app.html','auth-confirmation.html','reset-password.html']) {
    const preview = readFileSync('production-preview-dist/' + page, 'utf8');
    assert.match(preview, /PRODUCTION PREVIEW — NOT DEPLOYED/);
    assert.equal(read(page), preview.replace(/\n  <aside role="note"[^>]*>PRODUCTION PREVIEW — NOT DEPLOYED — awalptqpsjflrahkrjzk<\/aside>/g, ''));
  }
  assert.equal(read('index.html'), readFileSync('production-preview-dist/index.html','utf8'));
});
