## Unreleased — Authorized production backup preparation

- Add protected manual Supabase logical export with Age encryption and contract tests. No application changes or production execution.
- Validate encryption recipient before export, publish completed ciphertext only, and add synthetic runtime regression with mocked CLI and real Age. Production CI #91 passed on b635e99; actual CLI compatibility, artifact access and owner key recovery remain separate gates.

- Added a pinned Supabase CLI 2.79.0 export and encrypted restoration rehearsal against disposable PostgreSQL 17 fixtures with simplified Auth schema, migration history and two-owner RLS checks. CI #95 passed on 1028dc6; managed Supabase compatibility and real recovery remain unverified.

- Synchronize with merged PR #3, preserve all security and backup regressions; combined CI pending.

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
