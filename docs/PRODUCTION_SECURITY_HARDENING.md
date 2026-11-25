# Legacy security hardening — PR #3

## Current status and scope

Phase 3F.1 review complete; Phase 3F.2 documentation preparation. Core migration and regression code unchanged from validated commit `5eaf024f42e0ad797b901f43bcbbb8f9d900e60d`. [Production CI #103](https://github.com/yollysmiley/rollingbudget/actions/runs/45541939452) passed unit/syntax/security contracts, desktop/mobile browser smoke, and PostgreSQL 17 upgrade regression. Fresh CI is required for this documentation increment. No merge or production execution authorized. Production execution remains NO-GO pending verified recovery and separate approval.

The one-time migration `20261114190000_tighten_legacy_budget_data_access.sql` changes only legacy table grants and policies. It uses a transaction and five-second lock timeout, removes anonymous access, retains authenticated owner CRUD, rejects unexpected effective privileges, delegation and role escalation, and checks administrative access. It does not modify financial rows or the year table. It is not idempotent.

## Validation evidence

- Phase 3D: staging PostgreSQL 17.11 already had the four intended owner policies, effective client grants and service_role privileges/BYPASSRLS; eight redesign migrations present. No staging DDL executed. Transactional synthetic SQL checks passed for empty legacy records, owner CRUD, spoof rejection, cross-owner read/update/delete denial, service read and anonymous read denial. Post-rollback absence of synthetic users and records confirmed.
- Owner reported six successful live staging acceptance checks: sign-in, empty new-user budget, entry creation, refresh persistence, desktop/mobile consistency and sign-out protection. This is owner-reported, not agent-executed browser testing.
- Phase 3E catalog-only production inspection: PostgreSQL 17.11, postgres table owner, RLS enabled, four expected PUBLIC policies, eight effective table privileges for each client role, no grant options, separate column ACLs, other role memberships, superuser or BYPASSRLS for clients. Service role retained all eight privileges and BYPASSRLS. UUID primary key and unique owner FK with ON DELETE CASCADE; fixture corrected to match. No locks observed at inspection time. No financial records queried.
- Live ledger: 20260502135627 enable_rls_budget_data and 20261114170248 create_production_budget_ui_years. Repository year fixture 20261114010000 is not the live ledger version. Do not replay it or bulk-push migrations.
- CI #103 validates direct column grant remediation, inherited privilege rejection, delegation, membership, BYPASSRLS, missing service grants, unexpected policies, transactional rollback snapshots and preservation of synthetic records through the eight additive migrations. Browser tests simulate legacy conversion/save/reload using mocked Supabase at both viewports. Local execution was unavailable; CI is not managed Auth/API or actual recovery verification.

## Historical corrections

CI #96 passed before rollback/browser extensions. CI #97 exposed malformed dollar delimiters; corrected and strengthened snapshots and service-role checks, with CI #98 passing. CI #100 passed before final privilege guards. CI #102 exposed incorrect expectation that direct column grants survive table REVOKE; corrected to successful remediation, added inherited column-only and independent membership rejection, full rollback snapshots and distinct diagnostics. CI #103 passed the corrected suite.

## Merge checklist

- [x] Core code review and CI #103 evidence.
- [x] Staging acceptance and catalog-only production preflight.
- [ ] Fresh CI on documentation commit; verify exact head and required branch checks.
- [ ] Confirm no unexpected diff or conflicts; obtain separate explicit merge approval.
- [ ] Do not dispatch deployment or apply SQL as part of merge.

## Production execution checklist (separate approval)

- [ ] Verify private recovery destination, owner key recovery, backup coverage and isolated restore; approve consistent recovery point and write-freeze procedure.
- [ ] Refresh catalog preflight immediately before execution: server version, exact policies, table/column ACLs, role membership/attributes, owner/service grants, dependencies, lock contention and migration ledger. Capture ACL/policy definitions for reviewed rollback.
- [ ] Confirm exact migration file, execution role and ledger recording method. Apply only the named legacy migration after explicit approval; do not replay staging or bulk-push.
- [ ] Stop on error or lock timeout; verify unchanged catalog after rollback. After commit prefer forward correction; any narrow policy restoration requires separate approval. Never automatically restore excessive client access.
- [ ] Verify effective grants, RLS, owner CRUD, administrative access and record preservation using approved isolated checks without exposing financial records. Verify managed API and desktop/mobile behavior. Record evidence before reopening writes.

## Downstream synchronization

PR #5 (redesign) and PR #6 (backup) remain drafts on the earlier main baseline. No changes to either branch in Phase 3F.2.

PR #5: combine upgrade scripts without losing restoration checkpoints, expanded owner/JWT tests or PR #3 guards. Its Docker CI must create a tests directory and copy tests/legacy-budget-access-runtime.sql into the container. Preserve browser tests, all five CI jobs, and update release runbook to identify the preceding legacy migration separately from the eight additive migrations. Rehearse combined restore and upgrade; resolve manifest/ledger and old frontend compatibility gates.

PR #6: inherit PR #3 tests and preserve all four CI jobs including backup runtime. Administrative export compatibility is expected but combined CI not yet run. Public-repository encrypted artifact destination, owner key recovery, managed Auth/config coverage and actual isolated restore remain unresolved. Prefer approved private storage before real export. No credentials, backup dispatch or production writes authorized.

## Residual review limitations

Policy count guard relies on explicit policy creation in the same transaction; exact definition assertions, total statement timeout, additional administrative ACL comparisons and explicit anonymous mutation/missing-JWT mutation tests are optional defensive improvements, not implemented here. Combined-branch compatibility is source-reviewed only. No fresh live inspection or local execution in Phase 3F.2.
