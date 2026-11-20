## Unreleased — Phase 2D.5 preview acceptance (not deployed)
- Extended synthetic desktop/mobile acceptance tests with two owner-specific saved budget documents, account isolation after switching and refresh, and protected-route rejection after real application sign-out.
- Added isolated owner-scoped account create/update/delete and recurring-rule create/read/edit/disable/re-enable/delete service regressions, including future-dated version and account dependency assertions, with a required CI step.
- Updated desktop/mobile sign-out acceptance to click the corresponding visible application controls. These tests use mocked cloud data, not live Supabase.
- Updated production preview release blockers to distinguish synthetic coverage from outstanding live auth, RLS, CRUD UI and recovery verification.

## Unreleased — Phase 2D.4 preview acceptance (not deployed)
- Added synthetic authenticated desktop/mobile browser regression tests for route restoration, history navigation, and refresh; registered them in production CI. These tests use an in-memory Supabase mock and do not validate live database isolation.

## Unreleased — Phase 2D.2 production preview

- Added an isolated production-configured preview of the redesigned staging frontend under `production-next/`, without changing live entry points.
- Added a build-only CI job, auth/isolation contracts, and desktop/mobile public homepage and password-recovery dialog browser acceptance tests.
- Documented deployment blockers, callback configuration and database prerequisites; no deployment or live Supabase changes.

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
