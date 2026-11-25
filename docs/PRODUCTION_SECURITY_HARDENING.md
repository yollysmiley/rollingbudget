# Legacy security hardening

PR #3 is preparation only. No production migration or merge is authorized. Verify PostgreSQL 17, exact policy and effective grants, service role access, migration ledger and approved recovery point before execution. Capture existing ACL and policy definitions for reviewed rollback; do not automatically restore anonymous access. Apply only the named legacy migration after separate approval, then verify effective grants, RLS, owner CRUD and unchanged records. Stop on unexpected permissions or lock timeout. CI uses synthetic users and rolls back test writes; no production credentials. Existing browser smoke tests are retained; live Auth and managed API behavior require separate staging validation.

CI #96 passed all three jobs on 799fbe7. Added a deliberate policy-guard failure with ACL, policy and row rollback assertions, plus mocked browser cloud migration/save/reload at both viewports. These are not live API tests; new-user database isolation is covered by SQL regression. Fresh CI pending.

CI #97 failed in rollback verification because the SQL dollar delimiters were malformed; the intentional migration failure guard fired correctly. Corrected named delimiters, bidirectional ACL comparisons, legacy primary-key and year snapshots, and synthetic BYPASSRLS service-role read/update checks. Fresh CI required.

## Phase 3D staging verification

Production CI #98 (915b5e8) passed all three jobs. Staging PostgreSQL 17.11 already has the four authenticated owner policies and intended effective table and column permissions; service_role retains all eight table privileges and BYPASSRLS. All eight redesign migrations are present. Do not replay the non-idempotent legacy policy migration against staging: the named policies already exist. No staging DDL was executed. Live transactional synthetic-user SQL checks passed for empty legacy records, owner insert/update/delete, spoof rejection, cross-owner read/update/delete denial, service-role read and anonymous read denial. Independent post-rollback query confirmed both synthetic users and budget records absent. SQL role simulation is not managed Auth or browser verification. Live desktop/mobile acceptance remains pending; no production changes or merge authorized.

### Phase 3D completion
Owner confirmed all six live staging acceptance checks passed: sign-in, empty new-user budget, entry creation, refresh persistence, desktop/mobile consistency, and sign-out protection. This is owner-reported browser acceptance, not agent-executed browser testing. Phase 3D staging verification complete.

### Phase 3E proposed read-only production preflight
Pending separate approval. Inspect PostgreSQL version, migration ledger, table and column grants, role membership and RLS bypass, owner and service privileges, policy definitions, schema dependencies and lock contention using catalog-only queries. Compare with the exact PR migration and synthetic CI baseline. Review backup/recovery readiness and prepare a narrow rollback plan without executing it. No financial records, credentials, DDL, DML, migration application, merge or deployment. Report discrepancies and go/no-go; unresolved effective column grants or role escalation risks must be addressed before release.
