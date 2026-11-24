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

Retain the previous frontend artifact and commit. Verify old frontend compatibility with the upgraded schema in isolation. Deploy only after database verification and explicit approval. Check desktop/mobile navigation, authentication callbacks, empty new-user state, budget persistence and recurring rules using approved isolated test accounts. Staging recovery expiration retest passed by owner report; exact elapsed time was not independently verified; password validation UX is deferred and leaked-password protection is an accepted Free-plan limitation.

If deployment fails, prefer reverting the frontend if schema compatibility and preservation of new writes are established. Do not automatically drop new tables or restore an old snapshot. If database restoration is necessary, freeze writes again, preserve the current state, assess intervening writes and obtain explicit approval for the recovery plan. Reconcile migration history and validate before reopening access.

## Evidence required

Record exact commit, CI run, backup/restore rehearsal results, migration preflight and postflight results, approvals, deployment artifact and rollback rehearsal. CI #80 (45504570472), candidate 1de5a5b0128964c69a2da18716f92598691842ff: all four jobs passed, including native PostgreSQL 17 pre/post migration restoration. Documentation-only follow-up commits require fresh CI.  this does not establish live migration or restoration readiness. No production backup or restore has yet been performed.

## Manual Pages cutover

Current Pages source is main / root (owner confirmed). Do not merge or switch publishing source until separately approved. At cutover switch to GitHub Actions before merging, configure github-pages environment approval where supported, and verify the exact main commit has successful push CI. Dispatch Production release with DEPLOY only after database verification and owner approval. The workflow retains a release artifact for 90 days; preserve the pre-cutover frontend separately. The workflow does not execute migrations. Additional reference-integrity tests are deferred; synthetic restoration rehearsal passed in CI #80. CI-first validation is authorized for this increment.

## Synthetic restoration regression

CI runs scripts/verify-production-restore.sh against the disposable PostgreSQL service. It preserves the existing eight-migration regression, captures pre/post-upgrade custom-format dumps, restores each into a fresh database, compares schema and data dumps, checks legacy record equality, owner isolation and the restored account FK. Dumps are temporary and not uploaded. Roles are shared within the synthetic PostgreSQL cluster; this is not a managed Supabase disaster recovery test. Legacy database contracts are checked, not a live old-frontend rollback. Production backup coverage and actual restoration remain separately gated.

## Phase 2D.9A — Current release decision (2026-11-24)

**NO-GO for production cutover.** CI #80 (45504570472), candidate 1de5a5b0128964c69a2da18716f92598691842ff: all four jobs passed, including native PostgreSQL 17 pre/post migration restoration. Documentation-only follow-up commits require fresh CI.

### Completed evidence
- [x] Candidate CI, desktop/mobile regressions, release artifact contracts.
- [x] Eight-migration synthetic upgrade and pre/post backup restoration; schema/data equivalence, owner isolation and FK checks.
- [x] Owner-reported staging desktop/mobile authentication, recovery and expiry validation; exact expiry elapsed time not independently logged.
- [x] Read-only production catalog: budget_data and budget_ui_years exist with RLS enabled and four policies each; three new tables absent.

### Required before cutover
- [ ] Owner disposition of embedded JSON/version account references, custom category ownership/existence, concurrent deletion races and unpinned CDN dependency. Additional integrity hardening deferred, not silently accepted.
- [ ] Approve backup method and custodian; verify actual production backup coverage and isolated restoration, including managed Auth/configuration limitations.
- [ ] Reconcile live migration history (20260502135627 enable_rls_budget_data; 20261114170248 create_production_budget_ui_years) with repository year fixture 20261114010000. Do not blindly push or mark migrations applied.
- [ ] Verify old frontend compatibility with upgraded schema and retain previous frontend artifact.
- [ ] Approve and verify enforceable write freeze; capture final consistent backup and verify recoverability before migrations.
- [ ] Confirm production Auth settings and delivery readiness from dashboard; owner reports exact callbacks and ConfirmationURL templates, 1800-second OTP; live production callback smoke remains pending.
- [ ] Approve and execute eight migrations in order; record each result and verify data preservation, grants, RLS, API exposure and owner CRUD.
- [ ] Separately approve Pages source switch from main/root to GitHub Actions before merge; verify environment approval where supported and exact main push CI. DEPLOY input is operator acknowledgment, not database verification.
- [ ] Separately approve release dispatch; validate production desktop/mobile and Auth with dedicated approved test accounts before reopening access. Plan controlled test access during freeze without allowing ordinary writes.

No production mutations, backup, restore, merge or deployment authorized by this documentation update. Phase 2D.9B is backup preparation, not execution approval.
