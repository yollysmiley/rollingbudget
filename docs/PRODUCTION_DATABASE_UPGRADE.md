# Phase 2D.1 — Production database compatibility

## Scope and safety
This PR **only stages SQL migration files and a disposable-database regression test**. No migration is applied to production, no user record is copied, and no production frontend is deployed. Production currently has `budget_data` and `budget_ui_years` with two saved year documents. The eight additional SQL files are adapted unchanged from the validated staging schema.

## Upgrade sequence
The existing production year-table migration `20261114010000_create_budget_ui_years.sql` must **not** be replayed. The eight new migrations, sorted by timestamp, are:
1. `20261114192802_harden_public_default_privileges.sql`
2. `20261114221703_create_budget_accounts.sql`
3. `20261115043822_create_budget_recurring_rules.sql`
4. `20261116172229_add_recurring_due_day_and_full_dates.sql`
5. `20261117024033_protect_global_recurring_account_refs.sql`
6. `20261117071635_create_budget_expense_categories.sql`
7. `20261117071637_remove_expense_category_kind.sql`
8. `20261117071639_allow_custom_recurring_categories.sql`

They add three owner-scoped tables, constraints and foreign keys, explicit client grants and RLS, and default privilege hardening. The existing production budget tables are not modified by these migrations.

## Regression impact and verification
Reviewed `tests/ci-contract.test.js`, the existing production desktop/mobile smoke suite, and staging `scripts/verify-clean-migration-replay.sh` and `scripts/verify-b3-upgrade.sh`. Existing production UI tests are unaffected by this schema-only PR; they remain required.

New `scripts/verify-production-upgrade.sh` creates an isolated local Postgres 17 database fixture matching the two production budget tables, seeds two synthetic owners and their budget-year/legacy documents, applies only the eight additive migrations, and checks:
- Exact preservation of both original tables' seeded records
- Five RLS-enabled application tables and twelve new-table ownership policies
- Validated owner-scoped recurring-account foreign key
- Authenticated user A reads only A's budget year
- New accounts, custom categories and recurring rules work
- Authenticated user B cannot read A's new records
- Cross-owner recurring account references are rejected

The test **refuses any remote PGHOST** or database name other than `production_upgrade_test`. The new `production-schema-upgrade` CI job runs it in a disposable PostgreSQL 17 service. CI is not a production backup or live migration rehearsal.

## Required before any production deployment
- Review the production migration ledger for version collisions, actual database privileges and grants, and the exact migration ordering
- Verify a usable backup/restore path and establish a recovery point before any DDL
- Verify production Supabase Auth redirect allowlists and the separate production frontend build
- Require passing PR CI and branch-protected checks, then a separate explicit approval to merge
- Require another explicit approval before applying any migration to production
- Post-migration verify schemas, RLS, account isolation and unchanged budget-year records without reading or exposing private user data

Database migrations are forward-only; a frontend rollback does not undo schema changes. Do not reset or delete production records to recover.
