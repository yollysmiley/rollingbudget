# Phase 2D.2 — Production preview (not deployed)

This branch stages the approved redesigned staging frontend under `production-next/` without replacing the live production `index.html`, `rollover-budget-app.html`, or existing GitHub Pages content. Production still runs the legacy frontend until a separately authorized release.

## Preview build
Run `node scripts/build-production-preview.mjs` from the repository root (Node.js 22+). Output goes only to `production-preview-dist/`. The preview uses production Supabase project `awalptqpsjflrahkrjzk`, the existing browser-safe production anon key, and an isolated `rollingbudget_production_next_awalptqpsjflrahkrjzk` browser namespace. This prevents preview browser records from overwriting the existing production app's local keys; it does **not** make a preview safe to use with live accounts or production data.

The preview copies staging's public homepage, authenticated app, confirmation and recovery pages, shared account/recurring/category modules, and separate desktop/mobile views. It preserves the current production frontend untouched. The new CI job builds and validates preview output but **does not publish or deploy it**.

## Release blockers
1. **Database:** Apply the eight Phase 2D.1 migrations in the approved order only after independent backup/restore and deployment approval. GitHub merging did not deploy them.
2. **Auth redirect configuration:** Confirm production Supabase Authentication URL Configuration includes the final production `/auth-confirmation.html` and `/reset-password.html` callbacks, and check the Site URL. These dashboard settings cannot be verified by the current connector.
3. **Session compatibility:** Test sign-in, sign-out, email confirmation and password recovery against synthetic production-like users without changing live accounts. The preview uses a new auth storage key and may require existing users to sign in again.
4. **Regression:** Public homepage, login and recovery-dialog browser acceptance tests now run at desktop and mobile viewport sizes. Synthetic desktop/mobile sign-in and recovery callback tests now exercise the public auth UI with an in-browser mock client. Synthetic desktop/mobile acceptance tests now cover route restoration, history, refresh, two distinct owner-scoped budget documents, account switching, account catalog isolation, session restoration and the real application sign-out handler using a mocked authentication client. Isolated service regression tests cover owner-scoped account create/update/delete, recurring-rule create/read/edit/disable/re-enable/delete, effective-date version preservation, and account deletion blocked by dependent rules. Browser sign-out tests use the desktop/mobile sign-out controls. Desktop/mobile browser tests exercise account creation, renaming, inclusion changes and confirmed deletion, plus recurring-rule future-dated edits, disable/re-enable, cancellation and confirmed deletion through the real UI using synthetic in-memory services. These checks do not prove live Supabase RLS, account persistence against a real database, real-database recurring-rule UI persistence, or actual recovery callbacks; those remain release blockers. Existing legacy browser smoke tests are not sufficient.
5. **Deployment:** Introduce production GitHub Pages deployment only after separate approval and release readiness review. This PR has no deployment job.

## Tests
`node scripts/build-production-preview.mjs`
`node --test tests/production-preview.test.mjs tests/production-preview-owner-crud.test.mjs`
Run `node --test tests/production-preview-browser.test.mjs tests/production-preview-synthetic-auth.test.mjs tests/production-preview-session-navigation-browser.test.mjs` after installing Playwright and Chromium; these tests use no live credentials. The synthetic tests mock Supabase and do not validate the live authentication service. Existing `node --test tests/*.test.js` and production desktop/mobile smoke tests remain required in CI.

## Notes
The preview source is intentionally a separate copy of staging's approved application for controlled promotion. Future fixes should preserve staging's shared business logic and separate desktop/mobile UI; avoid a permanent two-codebase divergence.
