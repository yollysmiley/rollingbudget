import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';

const read = (name) => readFileSync('production-preview-dist/' + name, 'utf8');
test('preview output is separate from live production entry point', () => {
  assert.ok(existsSync('production-preview-dist/index.html'));
  assert.ok(existsSync('production-preview-dist/app/index.html'));
  assert.ok(existsSync('production-preview-dist/auth-confirmation.html'));
  assert.ok(existsSync('production-preview-dist/reset-password.html'));
  assert.ok(existsSync('production-preview-dist/scripts/budget-revision.mjs'));
});
test('all public preview auth pages use production project and isolated storage', () => {
  for (const page of ['index.html','app/index.html','auth-confirmation.html','reset-password.html']) {
    const html = read(page);
    assert.match(html, /awalptqpsjflrahkrjzk/);
    assert.match(html, /rollingbudget_production_next_awalptqpsjflrahkrjzk/);
    assert.doesNotMatch(html, /phiscfwfuzeptetimdbo|YOUR_SUPABASE_|YOUR_STAGING_STORAGE_PREFIX|sb_secret_/);
  }
});
test('preview homepage requests explicit production recovery and confirmation callbacks', () => {
  const home = read('index.html');
  assert.match(home, /resetPasswordForEmail\(email,\{redirectTo\}\)/);
  assert.match(home, /new URL\("reset-password.html",location.href\)/);
  assert.match(home, /emailRedirectTo:new URL\("auth-confirmation.html",location.href\)/);
});
test('preview password recovery verifies callback before password update', () => {
  const reset = read('reset-password.html');
  assert.match(reset, /PASSWORD_RECOVERY/);
  assert.match(reset, /auth\.verifyOtp/);
  assert.match(reset, /auth\.updateUser\(\{ password \}\)/);
});
test('desktop and mobile recurring views are both present', () => {
  const app = read('app/index.html');
  assert.match(app, /recurringDesktopView/);
  assert.match(app, /recurringMobileView/);
});

test('all shipped text assets exclude privileged credentials', () => {
  const root = "production-preview-dist";
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
