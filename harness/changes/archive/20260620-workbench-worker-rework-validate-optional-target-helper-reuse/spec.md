# Spec: workbench-worker-rework-validate-optional-target-helper-reuse

## Goal

Reduce repeated Workbench action boundary validation by routing the scheduler worker `rework-validate-first` optional request target checks through the existing shared optional string helper.

## Users

Developers and future agents extending scheduler worker rework actions. User-visible behavior remains unchanged: stale or forged target ids still fail before the action can write validation evidence.

## Acceptance Criteria

- AC-001: Equivalent optional target checks in `planning.scheduler.worker.rework-validate-first` use `assertWorkbenchActionOptionalStringTarget`.
- AC-002: Non-equivalent checks, especially already-created validation artifact checks, remain direct and semantically unchanged.
- AC-003: Focused tests verify helper adoption and retained direct-check boundaries.
- AC-004: Verification records targeted product checks plus Harness checks, with rationale for skipping full aggregate tests if the scope remains helper-only.

## Non-Goals

- Do not change scheduler runtime behavior, event policy, stored artifacts, Workbench UI payload shape, ToolPolicyGate behavior, or human gates.
- Do not include adjacent `rework-audit-first` in this change.

## Constraints

- AHO workflow truth remains Change/ECL files, accepted artifacts, Run/Validation/Audit/IntegrationCheck, Apply/Close human gates, and Harness evolution.
- Workbench action boundary may validate scoped action targets but must not become scheduler runtime truth.
- New cross-cutting validation mechanisms are out of scope; reuse the existing owner helper in `src/workbench/actions/active-target.ts`.

## Risks

- Helper-label changes could slightly alter error text. Keep labels specific enough to preserve operator meaning.
- `schedulerWorkerAuditId` and `reworkRunId` are optional on `SchedulerRuntimeWorkerReworkResult`; helper adoption must preserve current behavior where absent requested ids are ignored and non-empty requested ids mismatch when the current target is absent or different.

