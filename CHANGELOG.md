## Unreleased — Legacy budget access hardening

- CI #96 passed on 799fbe7; add rollback and isolated browser cloud compatibility regression (fresh CI pending).

- Restrict legacy table grants and policies, verify effective privileges transactionally, and exercise synthetic owner CRUD before and after the eight additive migrations. Production application pending separate approval.

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

- Correct legacy rollback regression SQL delimiters and strengthen ACL, record identity, year preservation and service-role checks after CI #97. Validation pending.
