# Authorized production backup

The manual workflow runs from `main` with the `production-backup` environment and
requires the `BACKUP` confirmation. Configuration and dispatch each require
separate approval. The workflow uses a public Age recipient in `BACKUP_RECIPIENT`
and the exact production tenant's session pooler URL (port 5432 with
`sslmode=require`) in the `PRODUCTION_DB_URL` secret. The encrypted GitHub
Actions artifact expires after seven days.

## Download and protect the recovery point

1. From a trusted workstation, sign in to GitHub and confirm repository
   visibility and who can download artifacts before authorizing an export.
   Treat ciphertext as sensitive even when repository readers can access it.
2. Open the successful **Authorized production backup** run for `main` in
   Actions and download `encrypted-production-backup` before it expires.
   Confirm the run belongs to the approved export window and contains both
   `backup.tar.gz.age` and `backup.tar.gz.age.sha256`. Verify both checksums
   using the procedure below.
3. Copy the encrypted file and its sidecar together to owner-controlled,
   access-restricted offline storage. Recheck the outer checksum from the
   offline copy, then disconnect the media. Keep plaintext SQL confined to
   the isolated verification environment.
4. Record the run URL, commit, UTC export window, ciphertext checksum,
   verification result, and offline copy location in the owner's private
   recovery inventory. Mark the pre-release recovery point as protected.
   Keep it and the previous known-good point until the owner explicitly
   releases the hold after post-release verification and the rollback
   window. GitHub artifact expiration does not preserve a recovery point.

## Owner-controlled private key recovery

The owner keeps the Age private identity and its protected recovery copy in
separate owner-controlled locations, apart from the artifacts. Keep the
identity out of GitHub, CI, logs, and shared storage. The owner must demonstrate
that they can retrieve the recovery copy and decrypt the selected artifact in
an isolated environment. Keep the matching identity available for every
protected recovery point, including after recipient rotation.

## Verify and unpack a backup

The export compresses the tar stream with gzip before encrypting it with Age.
Download `backup.tar.gz.age` and `backup.tar.gz.age.sha256` together. In an
isolated recovery environment, run these commands from the directory containing
both files. Set `AGE_IDENTITY_FILE` to the owner's local Age identity file.

```bash
set -euo pipefail
umask 077
sha256sum -c backup.tar.gz.age.sha256
mkdir restored
age -d -i "$AGE_IDENTITY_FILE" backup.tar.gz.age | gzip -dc | tar -xf - -C restored
(cd restored && sha256sum -c SHA256SUMS)
```

The outer checksum covers the encrypted artifact. The inner manifest covers
the SQL exports and coverage notes. Proceed with an isolated restore only
after both checks pass.

## Required release gate

Before any production release or database change, the release owner must
confirm a fresh, verified and protected recovery point. For a database cutover,
hold production writes across the separate roles, schema, data and migration
history exports through verification and until the authorized cutover begins.
If writes resume before cutover, establish and verify a fresh recovery point
under a renewed freeze. The separate exports do not share a single snapshot.

Block the release and any production DDL if the required run fails, skips,
expires before verified download, produces missing files, fails either
checksum or decryption, or lacks a recoverable owner identity, confirmed
write freeze when required, or protected offline copy. Record the blocking
reason and notify the release owner. Preserve existing recovery points.
After resolving the cause, obtain authorization for any replacement export,
repeat verification and offline protection, and have the release owner
record clearance before resuming. Passing CI cannot clear this gate.

## Managed Supabase recovery limitations

A full restore to an isolated managed Supabase project and a production
write-freeze rehearsal remain outstanding. Verify actual managed Auth and
Storage schema customizations, Auth settings and redirect configuration, API
keys, Storage objects and settings, and any separately managed credentials
or project settings as part of that rehearsal. SQL exports can contain
Storage metadata without the underlying files. Use a disposable recovery
target isolated from production and staging.
[Supabase backup and restore guide](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)

## R1.1 regression evidence and deferred work

Production CI #110 passed on `5747478087403c8dddafc8cbc0cc75a6fb2f9e0d`.
All four jobs passed, covering unit, syntax and security contracts,
desktop/mobile browser smoke tests, production-shaped PostgreSQL upgrade,
and synthetic backup runtime. The backup job exercised mocked export failures
and real Age with SHA-256 checks, plus a pinned Supabase CLI 2.79.0 export and
restore on disposable PostgreSQL 17 fixtures with simplified Auth, migration
history and two-owner RLS checks.
[Production CI #110](https://github.com/yollysmiley/rollingbudget/actions/runs/45550963906)

Cloudflare R2 integration, storage quotas, operation limits, automated
retention, purge and automated recovery-point management are deferred.
Use manual offline protection alongside the existing seven-day artifact window.
