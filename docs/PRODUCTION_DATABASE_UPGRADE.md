# Phase 2D.1 — Production database compatibility

## Scope and safety
This PR **only stages SQL migration files and a disposable-database regression test**. No migration is applied to production, no user record is copied, and no production frontend is deployed. Production currently has `budget_data` and `budget_ui_years`. The eight additional SQL files are adapted unchanged from the validated staging schema.

## Upgrade sequence
The repository year-table fixture `20261114010000_create_budget_ui_years.sql` must **not** be replayed in production; the live ledger records `20261114170248_create_production_budget_ui_years`. PR #3's standalone legacy security migration `20261114190000_tighten_legacy_budget_data_access.sql` precedes the eight additive migrations and requires separate approval. The eight new migrations, sorted by timestamp, are:
1. `20261114192802_harden_public_default_privileges.sql`
2. `20261114221703_create_budget_accounts.sql`
3. `20261115043822_create_budget_recurring_rules.sql`
4. `20261116172229_add_recurring_due_day_and_full_dates.sql`
5. `20261117024033_protect_global_recurring_account_refs.sql`
6. `20261117071635_create_budget_expense_categories.sql`
7. `20261117071637_remove_expense_category_kind.sql`
8. `20261117071639_allow_custom_recurring_categories.sql`

The regression runner applies the standalone legacy security migration, then an explicit eight-file additive manifest. The former draft grant migration has been replaced by the named security migration. A missing manifest file fails the test before executing that file.

The eight additive migrations add three owner-scoped tables, constraints and foreign keys, explicit client grants and RLS, and default privilege hardening. The eight additive migrations do not modify existing budget tables; the preceding legacy migration changes grants and policies only.

## Regression impact and verification
Reviewed `tests/ci-contract.test.js`, the existing production desktop/mobile smoke suite, and staging `scripts/verify-clean-migration-replay.sh` and `scripts/verify-b3-upgrade.sh`. Existing production UI tests are unaffected by this schema-only PR; they remain required.

New `scripts/verify-production-upgrade.sh` creates an isolated local Postgres 17 database fixture matching the two production budget tables, seeds two synthetic owners and their budget-year/legacy documents, tests security guard rejection and rollback, applies the standalone legacy migration followed by the eight additive migrations, and checks:
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
- Complete the mandatory pre-release backup gate below before deployment or any DDL
- Verify production Supabase Auth redirect allowlists and the separate production frontend build
- Require passing PR CI and branch-protected checks, then a separate explicit approval to merge
- Require another explicit approval before applying any migration to production
- Post-migration verify schemas, RLS, account isolation and unchanged budget-year records without reading or exposing private user data

Database migrations are forward-only; a frontend rollback does not undo schema changes. Do not reset or delete production records to recover.

## Mandatory pre-release backup gate

Follow the [production backup guide](PRODUCTION_BACKUP.md) for the approved
manual workflow. Freeze production writes across the separate logical exports
and verification for a consistent cutover. Confirm the successful `main` run,
securely download the Age-encrypted archive and SHA-256 sidecar within seven
days, and verify the outer checksum, decryption with the owner-recovered
private identity, and the inner SHA-256 manifest. Record the run and
verification in the private recovery inventory, copy both encrypted artifact
files to owner-controlled offline storage, recheck the copy and manually
protect the recovery point through the rollback window. Keep the identity and
its recovery copy separate from artifacts and outside GitHub.

Stop the release and all production DDL if the backup is failed, skipped,
missing, expired before verified download, unverifiable, or unavailable for
recovery, or if the write freeze or offline protection cannot be confirmed.
Record the blocker, notify the release owner, and preserve prior recovery
points. Resume only after remediation, verification and protection of a
fresh authorized backup and documented release-owner clearance. If writes
resume before cutover, repeat the gate under a renewed freeze.

Managed Supabase recovery still requires an isolated rehearsal. Verify
managed Auth and Storage schema customizations, Auth and project settings,
and actual Storage objects separately. The disposable PostgreSQL rehearsal
uses simplified fixtures. Production CI #110 passed all four jobs on R1.1
commit `5747478`, including the production-shaped upgrade and synthetic
backup checks. [Production CI #110](https://github.com/yollysmiley/rollingbudget/actions/runs/45550963906)

Cloudflare R2 integration, storage quotas, operation limits, automated
retention, purge and automated recovery-point management are deferred.

## Phase 3C.1 default privilege regression
The disposable upgrade fixture seeds schema-local client and service-role default grants, then verifies newly created objects have no implicit access after hardening. Explicit authenticated access is checked with RLS. The same transactional probe runs after restoration. Managed-role defaults and managed Supabase rehearsal remain separate release gates.

The fixture also checks insecure pre-migration defaults, explicit two-owner RLS, actual application table grants and empty new-user visibility. CI copies both runtime SQL fixtures explicitly.

## Phase 3C.1D administrative access contract (PR #5)

After authorized cutover, all five application tables must be owned by postgres and RLS enabled. Anonymous access is denied; authenticated receives owner-scoped CRUD only. Preserve existing service_role privileges on budget_data and budget_ui_years for compatibility; no service_role grants on accounts, recurring rules or categories. postgres retains administrative access. Do not alter supabase_admin or managed Auth/Storage roles or their defaults. New application objects must be created by postgres with explicit grants. The global postgres function default revocation requires managed compatibility verification.

The shared disposable upgrade/restore fixture checks ownership, RLS, effective grants, client role attributes, membership and schema CREATE permissions. Preview and release tests scan shipped text assets for privileged JWTs, secret key markers and database connection URLs without printing credential values. These checks are not exhaustive secret detection or managed API validation. The authorized backup uses a protected PostgreSQL connection, not a service API key. Before production execution verify actual managed role attributes, schema permissions, Auth/API behavior, backup and recovery on an isolated managed target; preserve the write-freeze and separate approval gates.

## Phase 3C.2B candidate migration
After the existing eight redesign migrations, apply `supabase/migrations/20261125120000_enforce_recurring_category_owner.sql` only after separate cutover approval and managed rehearsal. Reserved category collisions or orphaned recurring categories cause transactional failure; do not rewrite records. The generated column excludes built-ins; the composite foreign key protects disabled rules as well. Embedded budget dependencies remain Phase 3C.2C. The generated column is read-only; clients must continue sending explicit writable fields.

## Phase 3C.2C candidate migration
Apply `supabase/migrations/20261125121000_protect_embedded_category_refs.sql` after 3C.2B only with separate production approval. The private dependency table is populated from existing year documents without changing their financial data. Missing legacy collections are tolerated; present malformed collections or invalid explicit references abort the transaction. Foreign keys protect concurrent category deletion; independent-session concurrency tests and managed rehearsal remain required.

Phase 3C.2D: category deletion maps SQLSTATE 23503 to actionable feedback. Existing browser inventories remain advisory. The disposable concurrency runner uses two independent authenticated sessions, observes lock contention, and requires SQLSTATE 23503 for the losing transaction in both write/delete orders. Managed rehearsal remains mandatory.

Phase 3C.2E: apply `supabase/migrations/20261125122000_complete_category_references.sql` after the preceding category migrations. Explicit historical version and embedded recurring references are indexed without changing scheduling semantics. Missing custom expense identifiers and malformed reference inventories abort migration; investigate rather than rewrite records.

Phase 3C.2F: apply `supabase/migrations/20261125123000_optimize_category_reference_sync.sql` after 3C.2E. Synchronize dependency deltas and preserve unchanged rows. Parent identity is immutable. Category deletion relies on owner-scoped foreign keys and revision checks, not downloaded inventories.
