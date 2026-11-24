# Production release runbook

Status: preparation only. No production migration or deployment is authorized by this document.

## Approval gates

Obtain explicit owner approval separately for production write freeze, backup handling, migration execution, merge/deployment, and any restoration. Keep PR #5 draft until release approval. Do not use real production accounts in the preview.

## Preflight and backup

- Confirm the production project and repository commit, actual schema, migration history, table grants and RLS. Resolve unexpected differences before proceeding.
- Review the eight-file manifest in scripts/verify-production-upgrade.sh. Production migration history currently records the original RLS and year-table migrations under different timestamps from the repository fixture; reconcile history deliberately rather than blindly pushing all files.
- Establish an enforceable write freeze covering existing clients and API writes, not merely a maintenance banner. Verify it before taking the final backup.
- Use an approved encrypted logical backup procedure compatible with the actual Supabase plan and database connection. Include application schema/data, required Auth data and configuration inventory; verify coverage of managed schemas, roles and any storage separately. Never commit dumps, credentials or user records.
- Restore into a disposable isolated environment and verify schema, owner isolation, counts and document equality. Do not consider a backup usable until restoration succeeds. Record backup location, checksum, timestamp and authorized custodian without exposing secrets.

## Migration

Use the exact eight-file manifest in the upgrade regression, in order. Confirm execution role and migration-history recording method before release. Each file has its own transaction; the entire sequence is not atomic. Stop on the first failure, record completed migrations and investigate before resuming. Do not blindly rerun non-idempotent files or repair history to conceal failures.

Verify preservation of legacy and year records, RLS and grants on all five application tables, owner-scoped CRUD, the validated recurring account FK, and new table API accessibility. Verify account/category references in budget JSON and recurring versions; application preflight checks alone do not guarantee atomic reference integrity. Resolve or explicitly disposition these risks before release.

## Deployment and rollback

Retain the previous frontend artifact and commit. Verify old frontend compatibility with the upgraded schema in isolation. Deploy only after database verification and explicit approval. Check desktop/mobile navigation, authentication callbacks, empty new-user state, budget persistence and recurring rules using approved isolated test accounts. Staging recovery expiration retest remains outstanding; password validation UX is deferred and leaked-password protection is an accepted Free-plan limitation.

If deployment fails, prefer reverting the frontend if schema compatibility and preservation of new writes are established. Do not automatically drop new tables or restore an old snapshot. If database restoration is necessary, freeze writes again, preserve the current state, assess intervening writes and obtain explicit approval for the recovery plan. Reconcile migration history and validate before reopening access.

## Evidence required

Record exact commit, CI run, backup/restore rehearsal results, migration preflight and postflight results, approvals, deployment artifact and rollback rehearsal. Latest reviewed CI #66 passed; this does not establish live migration or restoration readiness. No production backup or restore has yet been performed.
