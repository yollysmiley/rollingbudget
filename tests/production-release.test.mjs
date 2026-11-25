import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
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

test('all shipped text assets exclude privileged credentials', () => {
  const root = "production-release-dist";
  let publicKeys = 0;
  function scan(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = dir + '/' + entry.name;
      if (entry.isDirectory()) { scan(path); continue; }
      if (!/\.(?:html|js|mjs|css|json|map|txt|svg|xml|webmanifest)$/i.test(entry.name)) continue;
      const source = readFileSync(path, 'utf8');
      assert.ok(!/\bsb_secret_[A-Za-z0-9_-]+|\bpostgres(?:ql)?:\/\/|\bPRODUCTION_DB_URL\b/.test(source), 'Privileged credential marker in ' + path);
      for (const token of source.matchAll(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)) {
        let claims;
        try { claims = JSON.parse(Buffer.from(token[0].split('.')[1], 'base64url').toString('utf8')); }
        catch { assert.fail('Unparseable embedded JWT in ' + path); }
        assert.ok(claims.role === 'anon', 'Non-anonymous embedded JWT in ' + path);
        publicKeys++;
      }
      publicKeys += [...source.matchAll(/\bsb_publishable_[A-Za-z0-9_-]+/g)].length;
    }
  }
  scan(root);
  assert.ok(publicKeys > 0, 'Expected public client configuration');
});
