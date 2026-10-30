# Deployment preparation

## Scope and baseline

Preparation only. Do not deploy security fixes, migrate financial data, or modify production database policies in this stage.

Source baseline: b0866b063dfa24043c6bb4addd3a7b78f58c789a.
Working branch: preparation/deployment-foundation.

A Git branch preserves source code, not database records, browser storage, or unsaved edits. No backup or staging setup is established by this document.

## Status

- [x] Create isolated preparation branch.
- [x] Record hosting configuration, deployed commit, and Supabase project identity.
- [x] Export production database data, schema, grants, policies, and relevant function definitions using authorized administrative tooling.
- [x] Verify backup contents and store backups privately outside the repository.
- [x] Preserve browser-local data and unsaved in-memory edits before refresh, sign-in, or migration.
- [x] Create isolated staging with synthetic data and separate test accounts.
- [x] Demonstrate recovery in an isolated environment (local PostgreSQL 16 restore from the exported backup; see evidence below).
- [x] Establish executable regression tests and CI.
- [ ] Approve preparation completion before Release 1.

## Preparation evidence (2026-10-29/30)

- Production identity: `Rolling Budget` project `awalptqpsjflrahkrjzk`; deployed code baseline b0866b063dfa24043c6bb4addd3a7b78f58c789a.
- Staging: separate Supabase project `phiscfwfuzeptetimdbo` and separate frontend repository `rollingbudget-staging`, deployed via GitHub Pages. Applied migration `20261029194718_create_staging_budget_data` is recorded in the staging repository under `supabase/migrations/`, with verification queries under `supabase/verification/`.
- Production database backup: exported read-only on 2026-10-30 as a private JSON file (schema DDL, four RLS policies, grants, and the single budget row) outside GitHub. The budget state SHA-256 was verified identical between source and backup.
- Recovery demonstration: the backup was restored into an isolated local PostgreSQL 16 instance (schema, policies, and data). Verified: 1 row, matching id/user_id, identical state SHA-256, identical updated_at, 4 policies, 12 months and 18 recurring items intact. `auth.uid()` was stubbed for the restore environment only; production was not modified.
- Browser-local data: the user's local browser export was downloaded and verified by the user before staging work began.
- Security validation: safe-rendering browser regression run and cross-account RLS isolation matrix both passed in staging; evidence recorded in the staging repository `docs/release1-validation.md`.
- Known deferred defect: mobile horizontal overflow (289px at 390px viewport), deferred by the user; documented in the staging validation record.
- Outstanding: production client-grant tightening (including `TRUNCATE`) requires a separately reviewed production migration. Staging GitHub OAuth sign-in was not exercised during validation; the two staging test accounts use password authentication.

## Backup and recovery procedure

1. Record the current production deployment and database configuration without committing credentials.
2. Export database data and schema through authorized administrative tooling. Verify that RLS policies, grants, functions, and required configuration are captured separately where the export does not include them.
3. Preserve both rollover_pro_v5 and rollover_pro_v4 localStorage values where present. These do not necessarily contain unsaved edits.
4. Before navigation, authentication, or reload, implement and test a user-triggered export of the current in-memory budget. This export is not implemented by this documentation commit.
5. Keep financial exports and credentials private and outside GitHub. Use synthetic fixtures in source control.
6. Restore backups into an isolated staging environment and compare record counts, ownership, representative values, and budget totals. Record results without exposing financial data.

## Staging requirements

- Separate Supabase project and non-production frontend configuration.
- Separate authentication redirect URLs and two test accounts.
- Synthetic budgets only; no production tokens or service-role keys in frontend code or CI artifacts.
- Verify actual request destinations before any write. A different branch alone does not isolate a hardcoded production endpoint.
- Confirm hosting settings before creating a preview; do not assume branch creation deploys anything.

## Release gates

Do not begin production rollout until backup restoration is demonstrated, staging cannot write production data, regression tests are executable, and failures have an owner and recovery procedure. RLS inspection can be read-only during preparation; policy modifications require a separately reviewed migration.

## Rollback constraints

Code rollback does not restore data. Preserve raw records and immutable pre-migration snapshots. Future schema changes require compatible rollback builds; never restore an index-based client against migrated ID-based assignments. Never recover availability by broadly disabling RLS.
