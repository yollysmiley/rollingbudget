# Deployment preparation

## Scope and baseline

Preparation only. Do not deploy security fixes, migrate financial data, or modify production database policies in this stage.

Source baseline: b0866b063dfa24043c6bb4addd3a7b78f58c789a.
Working branch: preparation/deployment-foundation.

A Git branch preserves source code, not database records, browser storage, or unsaved edits. No backup or staging setup is established by this document.

## Status

- [x] Create isolated preparation branch.
- [ ] Record hosting configuration, deployed commit, and Supabase project identity.
- [ ] Export production database data, schema, grants, policies, and relevant function definitions using authorized administrative tooling.
- [ ] Verify backup contents and store backups privately outside the repository.
- [ ] Preserve browser-local data and unsaved in-memory edits before refresh, sign-in, or migration.
- [ ] Create isolated staging with synthetic data and separate test accounts.
- [ ] Demonstrate recovery in staging.
- [ ] Establish executable regression tests and CI.
- [ ] Approve preparation completion before Release 1.

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
