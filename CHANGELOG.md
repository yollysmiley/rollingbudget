## Unreleased — Authorized production backup preparation

- Report credential-safe connection validation reasons before production export; preserve existing connection restrictions and add negative regression coverage.
- Phase R1.1 compresses the tar stream with gzip before Age encryption. The workflow publishes `backup.tar.gz.age` and its SHA-256 sidecar. The synthetic export and PostgreSQL restoration checks verify the new format.
- Add protected manual Supabase logical export with Age encryption and contract tests. No application changes or production execution.
- Validate encryption recipient before export, publish completed ciphertext only, and add synthetic runtime regression with mocked CLI and real Age. Production CI #91 passed on b635e99; actual CLI compatibility, artifact access and owner key recovery remain separate gates.

- Added a pinned Supabase CLI 2.79.0 export and encrypted restoration rehearsal against disposable PostgreSQL 17 fixtures with simplified Auth schema, migration history and two-owner RLS checks. CI #95 passed on 1028dc6; managed Supabase compatibility and real recovery remain unverified.

- Synchronized with merged PR #3. Production CI #110 passed all four jobs on R1.1 commit `5747478`, including the synthetic Age round trip and pinned CLI restoration rehearsal. [Production CI #110](https://github.com/yollysmiley/rollingbudget/actions/runs/45550963906)
- Retain the seven-day GitHub Actions encrypted artifact workflow. The [backup guide](docs/PRODUCTION_BACKUP.md) documents secure manual download, offline retention, manual recovery-point protection and owner-controlled private key recovery.
- The [database upgrade guide](docs/PRODUCTION_DATABASE_UPGRADE.md) requires pre-release backup verification and blocks release and DDL until a failed backup gate is resolved and the release owner records clearance. Isolated managed Supabase recovery, including Auth and Storage coverage, and a production write-freeze rehearsal remain outstanding.
- Defer Cloudflare R2 integration, storage quotas, operation limits, automated retention, purge and automated recovery-point management.

## Unreleased — PR #5 preview and validation (not deployed)

### Unreleased — PR #5 CI #107 regression corrections

- Repair three corrupted SQL dollar delimiters and the reverse legacy restoration comparison; add static regression contracts. All migration files and security assertions unchanged. Fresh CI required.

### Unreleased — PR #5 synchronization

- Inherit merged PR #3 security baseline, retain pre/post restoration checkpoints and expanded owner/JWT tests, copy legacy runtime SQL into Docker CI, compare legacy primary keys on restore. Combined CI pending.

### Unreleased — Encrypted backup recovery regression

- Phase 2D.9B.3 adds a required synthetic encrypted backup regression job to PR CI and shares the verifier with the manual workflow. It checks ciphertext and payload checksums, wrong-key and truncated-ciphertext rejection, restores the fixture role and database into a fresh network-isolated PostgreSQL 17 container, and asserts exact financial and identity fixtures, migration history, FK, grants and two-owner RLS. Fixture identity and RLS are simplified, not managed Auth or full production role recovery. No production secrets, connections or records. Existing migration and browser regressions retained. Runtime validation pending CI.

### Unreleased — Synthetic backup infrastructure

- Phase 2D.9B.2 introduces a manual synthetic-only backup workflow and contract tests. The script creates a network-isolated PostgreSQL 17 fixture, exports database and roles (without role passwords), encrypts using age, and verifies encrypted and decrypted checksums and dump readability. Disposable key is destroyed; uploaded synthetic artifact is intentionally not recoverable after the run. No production connection or secrets supported. Full encrypted restore and managed Supabase coverage remain pending; existing synthetic restoration regression remains unchanged. GitHub manual dispatch may require workflow presence on default branch; do not merge to enable it. Validate through a separately approved PR CI integration if needed.

### 2026-11-24 — Phase 2D.9A release readiness documentation (not deployed)

- Verified all four CI #80 jobs at candidate 1de5a5b, including pre/post synthetic backup restoration using native PostgreSQL 17 service-container tools; removed unavailable runner package dependency.
- Reconciled current release status and documented remaining backup, migration history, write freeze, rollback, integrity disposition and Pages approval gates in the production runbook and preview documentation.
- Documentation only; no application, regression assertion, migration or production configuration changes. Actual production recovery remains unverified.

### 2026-11-23 — Production preview authentication validation

- Recorded owner-confirmed email template placeholder corrections and 1800-second OTP expiry; independent live verification remains pending.
- Added desktop/mobile synthetic reused-link rejection and standard recovery redirect coverage. No application or production configuration changes.

### Unreleased — Phase 2D.6 production Auth configuration read-only audit
- Reviewed live production Supabase project metadata and security advisor, plus preview signup/recovery callback generation. Documented disabled leaked-password protection and unverified production Site URL, redirect allowlist, email settings, and JWT/session configuration as release blockers. No production settings or data modified.

### Unreleased — Phase 2D.6 expired-session restoration guard (not deployed)
- Extended existing desktop/mobile protected-route regression to reject expired restored sessions despite stale owner-scoped local budget cache, with no cloud table reads; documented unverified live Auth redirect allowlist.

### Unreleased — Phase 2D.6 authentication callback regression (not deployed)
- Added CI-required synthetic desktop/mobile browser tests for email confirmation session gating, expired callbacks, verified recovery tokens, password validation and update failures. Live production Auth redirect settings and real token delivery remain unverified.

### Unreleased — Phase 2D.6 RLS and owner isolation audit (not deployed)
- Audited existing production RLS policies read-only; new account, recurring and expense-category tables are not yet deployed. Security advisor identified leaked-password protection disabled.
- Expanded isolated PostgreSQL migration regression with cross-owner update/delete, owner-spoofing inserts/updates, and missing-JWT checks. No live schema or production data changes.

### Unreleased — Phase 2D.5 preview acceptance (not deployed)
- Added CI-required synthetic integration tests for recurring backfill idempotency, duplicate holds, historical entry preservation, failed cloud writes, stale and concurrent revision rejection, and owner/local-conflict cancellation.
- Corrected recurring browser acceptance setup to navigate to the canonical `recurring-rules` SPA route and assert its URL before testing visible desktop/mobile rule controls (CI #46 regression).
- Added desktop/mobile recurring-rule manager browser acceptance for future-dated edits, enable/disable, cancel/delete confirmation, and historical rule version preservation using synthetic fixtures.
- Added desktop/mobile browser acceptance for account creation, renaming, budget inclusion toggling and confirmed deletion through the rendered account manager, using an isolated synthetic account service.
- Extended synthetic desktop/mobile acceptance tests with two owner-specific saved budget documents, account isolation after switching and refresh, and protected-route rejection after real application sign-out.
- Added isolated owner-scoped account create/update/delete and recurring-rule create/read/edit/disable/re-enable/delete service regressions, including future-dated version and account dependency assertions, with a required CI step.
- Updated desktop/mobile sign-out acceptance to click the corresponding visible application controls. These tests use mocked cloud data, not live Supabase.
- Updated production preview release blockers to distinguish synthetic coverage from outstanding live auth, RLS, CRUD UI and recovery verification.

### Unreleased — Phase 2D.4 preview acceptance (not deployed)
- Added synthetic authenticated desktop/mobile browser regression tests for route restoration, history navigation, and refresh; registered them in production CI. These tests use an in-memory Supabase mock and do not validate live database isolation.

### Unreleased — Phase 2D.2 production preview

- Added an isolated production-configured preview of the redesigned staging frontend under `production-next/`, without changing live entry points.
- Added a build-only CI job, auth/isolation contracts, and desktop/mobile public homepage and password-recovery dialog browser acceptance tests.
- Documented deployment blockers, callback configuration and database prerequisites; no deployment or live Supabase changes.

## Unreleased — Legacy budget access hardening

- Phase 3F.2: consolidate release documentation, record CI #103 (5eaf024, all three jobs passed), and document downstream integration and recovery gates. Documentation-only increment requires fresh CI; no migration or application changes.

- Correct CI #102 direct-column remediation expectation; add inherited-column and independent membership rejection, exact diagnostics and full rollback snapshots.

- Add fail-closed column, delegation, role and administrative guards and negative rollback regressions; match production FK cascade.

- CI #96 passed on 799fbe7; add rollback and isolated browser cloud compatibility regression (subsequently validated by CI #103).

- Restrict legacy table grants and policies, verify effective privileges transactionally, and exercise synthetic owner CRUD before and after the eight additive migrations. Production application pending separate approval.

- Correct legacy rollback SQL delimiters after CI #97 and strengthen ACL, identity, year preservation and service-role checks; subsequently validated by CI #103.

## Unreleased — Phase 2D.1 (PR preparation)

- Staged eight reviewed, additive staging-derived SQL migrations for production accounts, recurring rules, custom expense categories, RLS and privilege hardening; **not applied to production**.
- Added isolated PostgreSQL 17 production-shaped migration upgrade regression and CI job, including synthetic two-owner data preservation and access-isolation checks.
- Added production migration and recovery-gate documentation; no frontend behavior changes.

# Changelog

## 2026-11-14 — Production workflow consolidation
- Consolidated unit, migration regression, application contract, Supabase RLS, and desktop/mobile browser checks under the single Production CI workflow.
- Retired the duplicate security workflow; its executable security and RLS contract test remains in the primary CI test suite.
- Standardized CI on Ubuntu 24.04 and Node.js 22, pinned Playwright, added job timeouts, and retained read-only permissions and concurrency cancellation.
- Updated README instructions to describe the consolidated workflow and local test commands.

## 2026-11-14 — Production redesign and legacy budget migration
- Added the year-by-year `budget_ui_years` storage table with owner-scoped row-level security.
- Added a tested converter for legacy Release 2 budget records, preserving paycheck details, expense source fields, excluded buckets, recurring rules, and historical month metrics as migration metadata.
- The legacy table is retained until migrated rows are verified; no auth users or identities are deleted.

## 2026-11-14 — Production CI upgrade
- Added CI coverage for JavaScript syntax, migration regression tests, production auth/database policy contracts, and Chromium smoke tests at desktop and mobile viewport sizes.
- Replaced the brittle HTML-sink grep with executable security and RLS contract tests.
- Added least-privilege workflow permissions and concurrency cancellation.

### Phase 3C.1 — Security regression coverage
- Exercise schema-local default grants for tables, views, sequences and functions after upgrade and restoration; preserve existing migrations.

- Correct SQL delimiters and CI fixture copying; expand positive controls, ownership and new-user security checks.

- Repair standalone SQL fixture dollar quoting and validate standalone DO block delimiters in unit tests.

- Phase 3C.1D: document administrative access boundaries and add shared database and frontend artifact credential regression checks; managed rehearsal remains required.

- Phase 3C.2A: align reserved category identifiers and strengthen category reference validation; add regression coverage.
