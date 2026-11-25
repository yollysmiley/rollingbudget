const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const script = readFileSync("scripts/backup-production.sh", "utf8");
const workflow = readFileSync(".github/workflows/production-backup.yml", "utf8");
test("backup rejects every non-synthetic invocation before accessing tools", () => {
  for (const args of [[], ["production"], ["synthetic", "extra"]]) {
    const result = spawnSync("bash", ["scripts/backup-production.sh", ...args], { encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Only synthetic backup mode/);
  }
});
test("backup is manual, isolated and has no production secrets", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /pull_request:|push:|schedule:|secrets\./);
  assert.match(script, /--network none/);
  assert.match(script, /age -r "\$BACKUP_RECIPIENT"/);
  assert.doesNotMatch(script, /--db-url|PGHOST|supabase\.co/);
  assert.match(workflow, /backup\.tar\.age\.sha256/);
  assert.doesNotMatch(workflow.split("actions/upload-artifact")[1], /database\.dump|roles\.sql|keydir/);
});

test("manual and PR CI use the same isolated recovery regression", () => {
  const ci = readFileSync(".github/workflows/ci.yml", "utf8");
  const verify = readFileSync("scripts/verify-encrypted-backup.sh", "utf8");
  assert.match(ci, /bash scripts\/verify-encrypted-backup\.sh/);
  assert.match(workflow, /bash scripts\/verify-encrypted-backup\.sh/);
  assert.match(verify, /pg_restore.*--exit-on-error --single-transaction/);
  assert.match(verify, /Wrong key accepted/);
  assert.match(verify, /Truncated ciphertext accepted/);
  assert.match(verify, /--network none/);
  assert.doesNotMatch(verify, /--db-url|PGHOST|supabase\.co/);
});
