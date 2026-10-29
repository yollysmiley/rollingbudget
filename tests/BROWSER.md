# Browser validation

Runs the unmodified application HTML in headless Chromium with desktop and mobile viewports. Mobile coverage is a viewport/layout check, not a real iOS/Safari device test.

## Run locally

Use Node.js 24 from the repository root:

```sh
npm install --no-save --package-lock=false --ignore-scripts playwright@1.56.1
npx --no-install playwright install --with-deps chromium
node --test tests/browser.test.mjs
```

## Isolation and scope

Each case uses a new browser context. HTML is served by request interception at http://budget.test. The Supabase SDK request receives a signed-out mock. All other unexpected requests are blocked and fail the test. No real credentials, user budgets, cloud records, or production writes are used. Dependency/browser installation needs network access; application requests are intercepted during tests.

Coverage: index redirect, default rendering, month list, desktop/mobile navigation, paycheck editing, local save/reload, theme persistence, page-level overflow, and uncaught page errors. These are baseline smoke checks, not complete validation of all 13 issues.

Live authentication, SDK integration, cloud conflicts, RLS, backup restoration, browser-engine compatibility, and visual design review remain separate gates. The mock intentionally does not emit authentication events.

On assertion failure, a synthetic-data screenshot is saved under browser-results when possible. CI logs contain the test results; screenshots are not automatically uploaded. No successful run is claimed by adding these files.
