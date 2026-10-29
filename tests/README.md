# Regression-test foundation

Status: test specification only. No automated tests, browser checks, database checks, or CI runs are provided or claimed by this commit.

## Proposed test structure

- fixtures/: synthetic legacy and migrated budget states.
- unit/: parsing, normalization, migrations, assignment identity, ordinals, and calculations.
- integration/: persistence, account isolation, and revision-aware save behavior.
- e2e/: browser editing, authentication transitions, rendering, and recovery.

## Coverage mapped to the 13 issues

1. Rendering: quotes, angle brackets, and executable-looking values remain inert in text, attributes, dropdowns, summaries, recurring templates, and profile UI.
2. RLS: two ordinary authenticated clients and an anonymous client verify read, insert, update, delete, and ownership-change restrictions. Never use privileged credentials for access-denial assertions.
3. Cloud loads: preserve local edits on sign-in, repeated auth events, slow responses, and load failures.
4. Account isolation: logout removes active account data from the UI; account B with no cloud record never inherits account A state; late responses from A are ignored.
5. Cloud saves: two clients starting at one revision cannot both overwrite successfully; rejected saves retain local edits.
6. Paycheck deletion: first, middle, and last removal cannot silently transfer expense ownership.
7. Excluded-bucket deletion: preserve intended assignment or explicitly unassign; test dangling legacy references.
8. Year rollover: positive and negative December balances carry to January under the approved timeline rule; test year ordering and duplicates.
9. Excluded accounting: specify expected results only after the reservation/transfer rule is approved; cover unused, partially spent, and overspent buckets without double deduction.
10. Recovery: malformed JSON, unavailable storage, missing arrays, invalid indices, and unsupported schema versions do not silently destroy data. Migration is idempotent and preserves amounts.
11. New years: no assumed income; existing user entries survive migration.
12. Ordinals: verify every day from 1 through 31.
13. Documentation: compare documented persistence, recurring, cloud, offline, and recovery behavior with verified implementation.

## Baseline characterization

Capture current behavior separately from desired behavior. Existing bugs may be documented as known failures, but do not encode incorrect financial results as future acceptance criteria. Preserve representative totals before migration and explain every intended change.

## Completion evidence

For each run record the source commit, environment, command or manual procedure, expected outcome, actual outcome, and pass/fail status. Use synthetic data and redact identifiers.
