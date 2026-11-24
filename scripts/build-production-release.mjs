import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

const output = 'production-release-dist';
assert.ok(!existsSync(output), 'Release output must not already exist');
execFileSync(process.execPath, ['scripts/build-production-preview.mjs'], { stdio: 'inherit' });
cpSync('production-preview-dist', output, { recursive: true, errorOnExist: true, force: false });
const banner = /\n  <aside role="note"[^>]*>PRODUCTION PREVIEW — NOT DEPLOYED — awalptqpsjflrahkrjzk<\/aside>/g;
for (const page of ['rollover-budget-app.html', 'app/index.html', 'auth-confirmation.html', 'reset-password.html']) {
  const path = output + '/' + page;
  const html = readFileSync(path, 'utf8');
  assert.equal([...html.matchAll(banner)].length, 1, page + ': expected exactly one preview banner');
  writeFileSync(path, html.replace(banner, ''));
}
console.log('Built production release artifact; no deployment performed.');
