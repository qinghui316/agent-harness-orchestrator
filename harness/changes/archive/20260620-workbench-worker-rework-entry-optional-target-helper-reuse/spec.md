# Spec: workbench-worker-rework-entry-optional-target-helper-reuse

## Goal

Adopt the existing shared Workbench optional string target helper for the scheduler worker rework entry actions so scoped action target validation uses one owner vocabulary instead of repeated local comparison branches.

## Users

- Future AHO agents extending Workbench scheduler actions.
- Developers reviewing Workbench action boundary behavior.
- Users indirectly, because stale or forged scheduler rework confirmations should continue to fail closed without accumulating divergent validation branches.

## Acceptance Criteria

- AC-001: `planning.scheduler.worker.rework-plan.compile` uses `assertWorkbenchActionOptionalStringTarget` for equivalent optional request target checks against the current WorkerValidation and, after branch validation, WorkerAudit evidence.
- AC-002: `planning.scheduler.worker.rework-start-first` uses `assertWorkbenchActionOptionalStringTarget` for equivalent optional request target checks against the current WorkerReworkPlan, using `?? ""` for optional latest audit fields so truthy forged requests still fail closed.
- AC-003: Explicit non-equivalent checks remain direct: required ids, latest SchedulerRun/runtime state, WorkerValidation/ReworkPlan staleness, failed-validation forbids WorkerAudit, passed-validation requires WorkerAudit, existing WorkerReworkPlan, and existing ReworkStart.
- AC-004: Tests include focused boundary assertions that the two rework entry paths adopt the shared helper and do not introduce a new local validator.
- AC-005: Verification records targeted coverage and explains why full `npm run test` is not required if the scope remains helper adoption only.

## Non-Goals

- Do not alter scheduler-runtime artifact schemas, action payload schemas, Workbench read-model JSON, server routes, frontend behavior, ToolPolicyGate, IntegrationCheck, apply/close gates, or scheduler execution semantics.
- Do not extend this phase into later rework result, validation, or audit action paths.
- Do not add another helper or local target validation framework.

## Constraints

- Workflow truth remains Change/ECL, accepted artifacts, Run, Validation, Audit, IntegrationCheck, Apply/Close human gates, and Harness evolution.
- Workbench action boundary code may revalidate scoped targets but must not become scheduler runtime authority.
- `src/workbench/actions/active-target.ts` remains the owner for shared Workbench action target helper vocabulary.
- Subagent plan review approved with adjustments: keep WorkerAudit branch presence rules explicit and use `?? ""` for optional latest audit fields.

## Risks

- Helper wording normalizes some mismatch errors to `target scope mismatch`; this is acceptable if fail-closed semantics and scoped target ids are preserved.
- Optional latest fields can silently change behavior if passed directly to a helper expecting `string`; use `?? ""` where latest values are optional.

