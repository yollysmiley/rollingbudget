# Rolling Budget

A responsive, multi-year budgeting application with separate desktop and mobile experiences.

## Features
- Monthly income, fixed expenses, variable expenses, credit-card payments, and loan payments.
- Rolling balances and automatic month-to-month cascade.
- Year-by-year cloud storage with Supabase.
- Email/password account creation, sign-in, and password recovery.
- Owner-scoped Row Level Security for cloud budget records.
- Responsive desktop and mobile interfaces.

## Production data model
The redesigned application stores one row per user and budget year in `public.budget_ui_years`. Each row contains a validated 12-month budget document. The table uses `(user_id, year)` as its primary key and RLS policies restrict access to the owning authenticated user.

The old `public.budget_data` table was migrated into the year-by-year structure. The migration verified the 12-month shape, all 17 paycheck records, all 209 expense records, and all 18 recurring rules before removing the legacy row. User accounts and authentication identities were not deleted.

Legacy source fields and records that do not have a direct field in the new UI are retained under `legacyMetadata`, `legacyPaycheck`, `legacyExpense`, and `legacyRecurring` in the destination JSON so historical details are not discarded.

## Development and tests
The application is a static HTML/JavaScript project. CI validates the legacy-data converter, production authentication and database-policy contracts, and desktop/mobile browser rendering.

Run the Node.js regression and contract tests locally:

```sh
node --test tests/*.test.js
```

Run the browser smoke tests after installing Playwright and Chromium:

```sh
npm install --no-save --no-package-lock playwright@1.56.1
npx playwright install chromium
node --test tests/browser-smoke.test.mjs
```

GitHub Actions runs these checks on pull requests targeting `main` and pushes to `main`. No production credentials are required by CI.

## Supabase setup
Apply the migration in `supabase/migrations/20261114010000_create_budget_ui_years.sql` to provision the year-based table and owner-scoped RLS policies in a new environment. Production already has this migration applied.
