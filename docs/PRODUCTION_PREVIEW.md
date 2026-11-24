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
`node --test tests/production-preview.test.mjs tests/production-preview-owner-crud.test.mjs tests/production-preview-recurring-hardening.test.mjs`
Run `node --test tests/production-preview-browser.test.mjs tests/production-preview-synthetic-auth.test.mjs tests/production-preview-session-navigation-browser.test.mjs` after installing Playwright and Chromium; these tests use no live credentials. The synthetic tests mock Supabase and do not validate the live authentication service. Existing `node --test tests/*.test.js` and production desktop/mobile smoke tests remain required in CI.

## Notes
The preview source is intentionally a separate copy of staging's approved application for controlled promotion. Future fixes should preserve staging's shared business logic and separate desktop/mobile UI; avoid a permanent two-codebase divergence.

## Phase 2D.5 recurring browser regression correction
The recurring-rule browser acceptance test must navigate to the canonical `?page=recurring-rules` SPA route before asserting visibility of the desktop or mobile rule list. The obsolete `?page=recurring` route leaves the list hidden; CI #46 identified this test setup defect. The test now verifies the canonical route and still requires visible rule controls. This does not change application routing or production deployment.

## Phase 2D.5 final hardening (synthetic integration)
The `production-preview-recurring-hardening.test.mjs` suite exercises the real recurring scheduling, preview and conditional cloud commit modules with an isolated owner-filtering in-memory PostgREST-like client. It checks backfill of missing occurrences, repeat-run idempotency, preservation of manual and historical entries, ambiguous manual duplicate holds, cloud-write failure without partial persistence, stale expected revisions, concurrent revision conflicts, owner-change guards, local-conflict rejection and cancelled commits. CI requires this suite. These are synthetic integration regressions, not live Supabase RLS, network-failure, or real cloud durability evidence; release blockers above remain.

## Phase 2D.6 — Production RLS read-only audit and isolated mutation regression
Read-only production catalog inspection on 2026-11-20 found RLS enabled on existing public tables `budget_data` and `budget_ui_years`, with owner-bound policies. The three proposed new tables are not present in live production; their RLS cannot be live-verified before authorized migration. Production Supabase security advisors reported leaked-password protection disabled (warning); no configuration was changed. The existing disposable PostgreSQL upgrade test now exercises cross-owner SELECT, UPDATE, DELETE, owner-spoofed INSERT/UPDATE and absent-JWT access for account, expense category, recurring and budget-year tables after replaying the eight migrations. It uses only `127.0.0.1`/`production_upgrade_test` and synthetic users. These tests are not a live production RLS authorization test, and no production SQL mutations or migrations were executed.

## Phase 2D.6 — Auth callback browser regression increment
The CI-required `tests/production-preview-auth-callback-browser.test.mjs` exercises the built preview's confirmation and password-reset pages in desktop/mobile browsers using isolated synthetic Supabase auth callbacks. It verifies expired/absent confirmation handling, confirmation session gating, absent/expired recovery token rejection, recovery token verification, password validation, successful update and error handling. This does not prove actual production redirect allowlists, email delivery, live Supabase token exchange, or existing-account session compatibility; these remain release blockers. No live auth users or settings were modified.

## Phase 2D.6 — Session restoration and auth configuration review
Existing desktop/mobile browser acceptance already covers synthetic owner A/B switching, page refresh and route restoration, prior-owner in-memory data clearing and signed-out protected-route rejection. The protected-route browser suite now additionally seeds a stale owner-specific local cache, supplies an expired synthetic JWT response, and asserts that budget/settings remain inaccessible without cloud table requests. This tests frontend gating, not real JWT revocation or server-side RLS. The connected Supabase project interface does not expose the production Auth URL Configuration allowlist or Site URL, so confirmation/recovery callback allowlisting remains unverified and must be checked before release. No production settings, migrations, accounts or data were changed.

## Phase 2D.6 — Production Supabase Auth configuration audit (read-only, 2026-11-20)

**Scope:** Supabase production project `awalptqpsjflrahkrjzk`, repository preview source, and public Supabase Auth guidance. No Auth settings, database records, users, migrations, or deployment were modified.

### Verified observations

- Supabase project metadata reports **ACTIVE_HEALTHY**, region `us-east-2`, PostgreSQL `17.11.0.003`.
- The current Supabase **security advisor** reports **WARN: Leaked Password Protection Disabled**. Proposed remediation: review and, with separate approval, enable [leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Recheck compatibility with password-reset and signup policies.
- Preview homepage invokes `signUp({ email, password, options: { emailRedirectTo: new URL("auth-confirmation.html", location.href).href } })` and `resetPasswordForEmail(email, { redirectTo: new URL("reset-password.html", location.href).href })`. These are **origin- and base-path-dependent**; an approved deployment URL must be known before allowlist changes.
- The preview build writes `auth-confirmation.html` and `reset-password.html` alongside the preview homepage and substitutes the production project URL, publishable key and isolated storage namespace. The confirmation page checks for an authenticated session; recovery requires a callback and handles a `token_hash` recovery verification path.
- Synthetic desktop/mobile tests cover confirmation/recovery outcomes, protected-route rejection, session restoration, owner switching, and sign-out. They do **not** verify live Auth configuration or actual email token delivery.

### Not verifiable through available read-only connector

The Supabase connector exposes project metadata and security advisors, but no read-only Auth configuration endpoint. Therefore **Site URL, redirect URL allowlist, email confirmation enablement, email template links, SMTP delivery, email rate limits, JWT/session expiry, and password policy are NOT verified**. Do not assume their values, nor infer correct configuration from passing synthetic tests.

### Proposed fixes / verification before release (separate approval for any mutation)

1. Open [production Auth URL Configuration](https://supabase.com/dashboard/project/awalptqpsjflrahkrjzk/auth/url-configuration) and record the **actual Site URL and exact redirect allowlist**, without sharing tokens or credentials. Confirm the final approved production preview base path and both expected callback URLs. Keep staging and production origins separate; prefer exact paths over permissive wildcards.
2. Review [production Auth email templates](https://supabase.com/dashboard/project/awalptqpsjflrahkrjzk/auth/templates), including confirmation and reset links, and the email-provider/rate-limit settings. Verify templates preserve intended `redirect_to` semantics. Do not send real emails or change templates during this audit.
3. Review password security settings and propose enabling leaked-password protection; separately review password length and session/JWT expiration settings. Do not change settings without explicit approval.
4. After approval for a controlled non-production test, verify sign-up, email confirmation, recovery callback, expired/used links, restored session, and sign-out with dedicated synthetic accounts and real Supabase Auth. Do not use legacy or production user accounts.
5. Before any production release, review migration backup/rollback, production RLS, callback allowlisting and required CI checks. Obtain separate explicit approvals for production Auth configuration changes, migrations, merge and deployment.

**Release decision:** BLOCKED pending actual production Auth configuration verification and approved live end-to-end tests. Read-only metadata and the security advisor alone are not evidence that the configured redirect URLs work.

### User-reported production Auth URL configuration (2026-11-21; not independently read from dashboard)

- **Site URL:** `https://yollysmiley.github.io/rollingbudget`
- **Reported redirect URL:** `https://yollysmiley.github.io/rollingbudget/rollover-budget-app.html`
- The redirect listed is a **legacy app route**, not either of the two callback paths generated by the production-next homepage. For a future deployment **at the production root** `/rollingbudget/`, the preview code would generate `https://yollysmiley.github.io/rollingbudget/auth-confirmation.html` and `https://yollysmiley.github.io/rollingbudget/reset-password.html`. If the preview is instead hosted under a subpath, its actual generated callback URLs will differ and must be verified from that deployment path.
- **Proposed change only (not applied):** retain the existing legacy redirect during transition and add the exact confirmation and reset callback URLs for the **approved final deployment path**. Avoid broad wildcard allowlisting. The Site URL as supplied is usable; a trailing slash is optional and should not be changed merely for appearance.
- The user supplied one redirect URL; **whether additional redirect entries exist remains unverified**. Supabase dashboard settings were not independently fetched.
- No production configuration changes were authorized or made. The release blocker remains until the final deployment path and complete allowlist are reviewed and real callback behavior is tested in an approved safe environment.

### User-confirmed redirect allowlist update (2026-11-21)

The project owner reports having **added** the two exact production callback URLs to Supabase Auth redirect configuration:
- `https://yollysmiley.github.io/rollingbudget/auth-confirmation.html`
- `https://yollysmiley.github.io/rollingbudget/reset-password.html`

The production marketing homepage is confirmed as `https://yollysmiley.github.io/rollingbudget/` and the protected application route as `https://yollysmiley.github.io/rollingbudget/app/`. The existing legacy `rollover-budget-app.html` redirect should remain during transition. **This is user-reported configuration, not independently verified through the Supabase connector.** No settings were changed by this PR.

Remaining checks: inspect the saved complete redirect list in the dashboard, confirm confirmation/recovery email templates honor the redirect target, inspect email delivery settings, review the leaked-password protection warning, and run approved isolated end-to-end Auth tests before release. Do not treat synthetic browser tests as proof of live callback delivery.

### Phase 2D.6 — Owner-confirmed email configuration and validation (2026-11-23)

Owner confirms both signup and recovery templates now use `{{ .ConfirmationURL }}` in HTML and Outlook VML buttons, and Email OTP Expiration is 1800 seconds. These settings are owner-reported, not independently retrieved. Legacy redirect retention remains to be verified. Existing callback, auth-gate and session/navigation browser tests reviewed. Added desktop/mobile synthetic rejected reused-link and standard PASSWORD_RECOVERY event tests to the existing callback suite. No application code changes.

Live validation remains a release gate: use an approved isolated non-production Auth environment with dedicated fresh accounts and accessible test inboxes; verify signup, delivered confirmation URL and callback, password reset, old password rejection, fresh login, reuse rejection, expiry after 1800 seconds, session restoration and sign-out. Verify desktop and mobile independently. No real production accounts, production writes or migrations. Synthetic error responses do not establish server-side token reuse or expiration enforcement. Confirm deployed callback paths, complete allowlist, SMTP and password security settings before release. CI must pass on final head; local full suite not executed in connector-only workflow.

### Owner decision — staging validation and accepted security limitation

Production CI #65 (45304076583) passed all four jobs at ce88b273b6c492a86b7a31e357094ae176cbbc97. Owner approved staging-only live authentication validation against rollingbudget-staging (phiscfwfuzeptetimdbo). Owner explicitly accepts the leaked-password protection warning because the project is on the Free plan; enabling this paid feature is not a release gate. Revisit only if subscription or owner decision changes. Staging email settings and inbox access must be verified separately; staging results do not independently verify production Auth configuration. No production writes or deployment authorized.

## Phase 2D.8 release preparation
All eight migration SQL files reviewed; production migration history contains two earlier migrations. See [release runbook](PRODUCTION_RELEASE_RUNBOOK.md) for approval gates and restoration requirements. JSON budget and recurring-version account references and custom category references still require integrity disposition. Owner reports staging desktop authentication complete; 30-minute expiry retest pending. Password validation UX deferred. No production changes or backup rehearsal performed.

### Release preparation update

Staging recovery expiration retest passed by owner report after waiting; exact elapsed time was not independently logged. Staging authentication validation is complete. Additional database integrity hardening is deferred; restoration rehearsal remains outstanding. The release build reuses preview assets and removes only preview banners, preserving storage namespace and routes. Pages cutover requires separate approval.
