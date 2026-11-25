const test = require("node:test");
const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const {spawnSync} = require("node:child_process");
const script = readFileSync("scripts/export-production-backup.sh","utf8");
const workflow = readFileSync(".github/workflows/authorized-production-backup.yml","utf8");
test("production backup rejects PR and unconfirmed execution", () => {
  for (const [ref,event,confirmation] of [["refs/heads/feature","workflow_dispatch","BACKUP"],["refs/heads/main","push","BACKUP"],["refs/heads/main","workflow_dispatch","NO"]]) {
    assert.equal(spawnSync("bash",["scripts/export-production-backup.sh"],{env:{...process.env,GITHUB_REF:ref,GITHUB_EVENT_NAME:event,BACKUP_CONFIRMATION:confirmation}}).status,1);
  }
});
test("production backup is protected and uploads ciphertext only", () => {
  assert.match(workflow,/environment: production-backup/);
  assert.match(workflow,/github.ref == 'refs\/heads\/main'/);
  assert.doesNotMatch(workflow,/pull_request:|push:|schedule:/);
  assert.match(script,/age -r "\$BACKUP_RECIPIENT"/);
  assert.match(script,/--role-only/);
  assert.match(script,/--use-copy --data-only/);
  assert.match(script,/supabase_migrations/);
  assert.doesNotMatch(workflow.split("actions/upload-artifact")[1],/\.sql|tool.log/);
});

test("production backup compresses the tar stream before Age encryption", () => {
  assert.match(script, /tar [^\n]+ \| gzip -n \| age -r "\$BACKUP_RECIPIENT" -o "\$work\/encrypted\/backup\.tar\.gz\.age"/);
  assert.match(script, /sha256sum backup\.tar\.gz\.age > backup\.tar\.gz\.age\.sha256/);
  const uploadedPaths = workflow.split("path: |")[1].split("retention-days:")[0].trim().split(/\n\s*/);
  const artifactDir = "${{ runner.temp }}/encrypted-production-backup";
  assert.deepEqual(uploadedPaths, [
    artifactDir + "/backup.tar.gz.age",
    artifactDir + "/backup.tar.gz.age.sha256",
  ]);
});
