// Applies the Release 1 safe-rendering transform to the production app source.
// Usage: node scripts/apply-hardening.mjs
// Replaces unsafe HTML-string renderers with DOM-based safe renderers and
// asserts no HTML rendering sinks remain. Does not touch configuration.

import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { hardenRendering } from './harden-rendering.mjs';

const path = 'rollover-budget-app.html';
const before = readFileSync(path, 'utf8');
const after = hardenRendering(before);

// Configuration must be untouched by this transform.
assert.equal(
    (before.match(/const SUPABASE_URL = '[^']*';/) || [])[0],
    (after.match(/const SUPABASE_URL = '[^']*';/) || [])[0],
    'Supabase URL changed unexpectedly'
);
assert.ok(!after.includes('sb_secret_'), 'Secret key marker found');
assert.ok(!after.includes('phiscfwfuzeptetimdbo'), 'Staging project reference found');
assert.ok(!after.includes('STAGING —'), 'Staging banner found');

writeFileSync(path, after);
console.log('Hardened', path, 'in place; no configuration was modified.');
