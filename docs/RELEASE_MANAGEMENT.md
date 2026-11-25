# Release management

This policy governs Rolling Budget releases in staging and production. It defines permanent engineering requirements; the active release PR description is the single authoritative release checklist. The [production release runbook](PRODUCTION_RELEASE_RUNBOOK.md) defines operational procedures and separate production approval gates.

## Required policies

| Policy | Required behavior |
| --- | --- |
| Scope freeze | Record approved requirements and acceptance criteria before implementation. Approved release requirements cannot expand silently. |
| Change control | New requirements require a documented impact assessment and explicit owner approval before implementation. |
| Defect classification | Classify each finding as critical, release-blocking, nonblocking or enhancement. |
| Release candidate | Identify a fixed staging commit SHA or version and its validation evidence. Changes invalidate the affected candidate evidence and require revalidation. |
| Dependency review | Complete dependency and compatibility review before production implementation. |
| Database readiness | Validate migrations, schema, grants, RLS, data integrity and recovery compatibility during staging development. |
| Regression review | Review affected existing regression tests before committing changes; update and run affected tests and required local checks. |
| CI | Retain required checks and meaningful coverage; avoid unnecessary duplicate execution without bypassing branch protection or required validation. |
| Status reporting | Maintain one authoritative active release checklist in the release PR description. |

## Scope and change control

Freeze the approved release scope, acceptance criteria and exclusions. For a proposed change, record its reason, affected application and database components, dependencies, security and data risks, regression impact, schedule impact and release classification. Obtain explicit owner approval before implementation. Defer unapproved requirements to a future release. A defect fix must remain within approved behavior; any expansion requires change control. Emergency fixes do not waive authorization or validation.

## Defect classification

| Class | Release treatment |
| --- | --- |
| Critical | Stop affected release activities immediately; prioritize security exposure, data loss or severe service failure. Resolve and revalidate before resuming. |
| Release-blocking | Resolve before release approval because an approved requirement, required check or safety gate is unmet. |
| Nonblocking | Record impact, mitigation, owner acceptance and follow-up; may be deferred with explicit approval. |
| Enhancement | Defer to a future release unless explicitly approved through change control. |

Record the rationale and evidence for classification. Do not downgrade a defect to bypass a release gate.

## Release lifecycle

1. Approve requirements, freeze scope and establish the release checklist.
2. Implement in small, independently testable staging increments. Review regression impact before each commit; preserve isolated synthetic fixtures and distinct desktop/mobile coverage.
3. Complete dependency review and database readiness during staging development, including migration ordering, compatibility, data preservation, permissions, backup/restore rehearsal and rollback constraints. Resolve blockers before production implementation.
4. Fix the release candidate to an exact staging SHA or immutable version; record its artifact, required CI evidence and approved scope. If a change is necessary, approve it, identify a new candidate and revalidate affected evidence. Record the mapping from staging candidate to production implementation and validate the exact production candidate independently.
5. Review defects, required checks, residual risks and operational readiness. Record any unexecuted checks and obtain explicit acceptance of permitted exceptions. Required CI and production safety gates cannot be silently waived.
6. Obtain separate approvals for production write freeze, backup handling, migration execution, merge/deployment and restoration as applicable. Follow the production runbook; this policy does not authorize any production action.
7. Verify the deployed version, desktop/mobile behavior, authentication, data preservation and operational health. Record postflight evidence and any follow-up work before closing the release.

## Regression and CI governance

Review unit, integration, regression and browser tests covering affected components, selectors, data structures and workflows before committing. Update obsolete assertions only when approved behavior changes; retain meaningful coverage. Run relevant tests, lint/type checks and the full local suite where supported. Document unavailable checks and obtain explicit approval for exceptions before committing. Never use production user data for tests. New-user fixtures begin empty and create needed records explicitly.

Keep required CI checks and branch protection intact. Consolidate overlapping workflows or use appropriate event filters only after assessing coverage and required-check behavior. Do not skip required checks for the exact candidate, including documentation-only changes when required by repository policy. Require successful checks before recommending merge. Report failures, fixes, executed tests and outstanding risks.

## Authoritative release checklist

Maintain the active checklist in the release PR description, not in parallel status documents. Record release scope and approved changes, staging candidate and production candidate mapping, dependency and database readiness, classified defects and dispositions, regression/CI evidence, backup and rollback readiness, separate approvals, deployment and postflight evidence. Include owners, blockers and links to evidence where applicable. Mark completed items only after verification; distinguish owner-reported evidence from independently verified results. Historical runbook notes and changelog entries are evidence, not current status.

The README is the documentation index; feature and architecture documents describe behavior and design; the runbook describes operational execution; the changelog records completed changes. Link to these sources rather than duplicating their responsibilities.
