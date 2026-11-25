# Legacy security hardening

PR #3 is preparation only. No production migration or merge is authorized. Verify PostgreSQL 17, exact policy and effective grants, service role access, migration ledger and approved recovery point before execution. Capture existing ACL and policy definitions for reviewed rollback; do not automatically restore anonymous access. Apply only the named legacy migration after separate approval, then verify effective grants, RLS, owner CRUD and unchanged records. Stop on unexpected permissions or lock timeout. CI uses synthetic users and rolls back test writes; no production credentials. Existing browser smoke tests are retained; live Auth and managed API behavior require separate staging validation.

CI #96 passed all three jobs on 799fbe7. Added a deliberate policy-guard failure with ACL, policy and row rollback assertions, plus mocked browser cloud migration/save/reload at both viewports. These are not live API tests; new-user database isolation is covered by SQL regression. Fresh CI pending.

CI #97 failed in rollback verification because the SQL dollar delimiters were malformed; the intentional migration failure guard fired correctly. Corrected named delimiters, bidirectional ACL comparisons, legacy primary-key and year snapshots, and synthetic BYPASSRLS service-role read/update checks. Fresh CI required.
