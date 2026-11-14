# Changelog

## 2026-11-14 — Legacy budget database access hardening
- Added a production migration proposal that removes anonymous access and unnecessary TRUNCATE, REFERENCES, and TRIGGER privileges from the retained legacy budget table.
- Replaced broad PUBLIC-targeted policies with explicit authenticated owner-scoped CRUD policies.
- Added CI regression contracts verifying least-privilege grants and confirming that the migration does not alter or delete budget records.
- The migration is proposed for review only and has not been applied to production.

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
