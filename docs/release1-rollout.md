# Release 1 production rollout plan

Baseline: production main b0866b063dfa24043c6bb4addd3a7b78f58c789a. Preparation was approved on 2026-10-30. This release ports the staging-validated safe-rendering fix to production and tightens production database grants.

Production is not modified until each phase below is explicitly approved and verified.

## Phase 1 — Safe rendering (this branch)

1. Apply the hardening transform (`scripts/apply-hardening.mjs`) to `rollover-budget-app.html`. This replaces the unsafe HTML-string renderers with the DOM-based safe renderers already validated in staging (PR yollysmiley/rollingbudget-staging#1), including hostile-payload regression coverage.
2. Add `tests/security-rendering.test.mjs` and a CI workflow that fails if any HTML rendering sink is committed.
3. Open a pull request to `main`, review the diff, and merge with approval.
4. Deploy: production serves GitHub Pages from `main`. Verify the live site serves the hardened app (no legacy sinks in served HTML; app loads and behaves normally).
5. Rollback: `git revert` the release commit and redeploy. No data or schema change is involved in this phase.

## Phase 2 — Production grant tightening (separate approval)

Draft migration: `supabase/migrations/draft-tighten-budget-data-grants.sql`. Must be reviewed and explicitly approved before being applied to `awalptqpsjflrahkrjzk`:

- Remove all table privileges from `anon`.
- Remove `TRUNCATE`, `REFERENCES`, and `TRIGGER` from `authenticated` (keep the four row operations).
- Retarget the four RLS policies from `PUBLIC` to `authenticated` and replace the redundant `ALL` policy with an explicit `DELETE` policy, matching the staging configuration.
- Verify with the staging repository's read-only verification queries, then run ordinary-client access tests against production using a test account.

Rollback: restore the previous grants/policies from the 2026-10-30 backup record (`backups/prod-db-backup-20261030.json` in the preparation workspace). The migration changes no data.

## Phase 3 — Post-deploy verification

- Browser console check on the live production site: no HTML sinks in served HTML; hostile-name budget rows render as text; existing budget loads correctly from Supabase.
- Confirm the user's saved budget state is intact before and after (read-only check; the backup from 2026-10-30 is the recovery point).

## Out of scope for Release 1

- Mobile horizontal overflow (deferred; 289px at 390px viewport).
- Revision column / concurrency protection for `budget_data`.
- Any schema or data migration.
