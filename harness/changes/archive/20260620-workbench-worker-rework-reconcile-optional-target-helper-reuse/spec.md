# Spec: workbench-worker-rework-reconcile-optional-target-helper-reuse

## Goal

Reduce Workbench action boundary duplication by routing the scheduler worker `rework-reconcile-result` optional request target checks through the existing shared optional string helper.

## Users

Developers and future agents extending scheduler worker rework actions. The user-visible behavior should remain unchanged: stale or forged target ids are still rejected before the action mutates workflow state.

## Acceptance Criteria

- AC-001: Equivalent optional target checks in `planning.scheduler.worker.rework-reconcile-result` use `assertWorkbenchActionOptionalStringTarget`.
- AC-002: Non-equivalent checks, especially the optional already-created rework result id check, remain direct and semantically unchanged.
- AC-003: Focused tests verify helper adoption and the retained direct-check boundary.
- AC-004: Verification records targeted product checks plus Harness checks, with rationale for skipping full aggregate tests if the scope remains helper-only.

## Non-Goals

- Do not change scheduler runtime behavior, event policy, stored artifacts, Workbench UI payload shape, or gate authority.
- Do not include adjacent `rework-validate-first` or `rework-audit-first` paths in this change.

## Constraints

- AHO workflow truth remains Change/ECL files, accepted artifacts, Run/Validation/Audit/IntegrationCheck, Apply/Close human gates, and Harness evolution.
- Workbench action boundary may validate action targets but must not become scheduler runtime truth.
- New cross-cutting validation mechanisms are out of scope; reuse the existing owner helper in `src/workbench/actions/active-target.ts`.

## Risks

- Helper-label changes could slightly alter error text. Keep labels specific enough to preserve operator meaning.
- `reworkRunId` is optional. Helper adoption must preserve the current behavior where absent requested `runId` is ignored and a non-empty requested id mismatches when no rework run exists.

