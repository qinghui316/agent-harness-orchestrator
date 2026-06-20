# Spec: workbench-scheduler-integration-outcome-handoff-target-helper-reuse

## Goal

Continue Architecture Growth Control by reusing the shared Workbench action latest-target helper in the scheduler integration outcome handoff boundary path.

## Users

- Future agents maintaining Workbench scheduler action gates.
- Users relying on scheduler integration outcome reconciliation to remain stale-target guarded and human-gated through existing IntegrationCheck/apply paths.

## Acceptance Criteria

- AC-001: `planning.scheduler.integration-outcome.reconcile` uses `assertLatestWorkbenchActionTarget` for the latest SchedulerIntegrationCheckHandoff id check.
- AC-002: Existing scheduler runtime, IntegrationCheck, apply/discard, Goal Loop, UI/projection, and action handler semantics remain unchanged.
- AC-003: Tests or static boundary assertions prove helper adoption and module-boundary compatibility.
- AC-004: Review records Module Boundary and Core Mechanism Reuse coverage, including targeted verification rationale and full-test skip rationale if full tests are not run.

## Non-Goals

- Do not add a new helper, local validation framework, scheduler runtime guard, IntegrationCheck engine, apply/discard action, UI payload, or Workbench projection.
- Do not touch reference projects or restructure the Workbench test suite.

## Constraints

- Workflow truth remains Change/ECL, accepted artifacts, Run, Validation, Audit, IntegrationCheck, Apply/Close gates, and Harness evolution records.
- `src/workbench/actions/active-target.ts` owns shared Workbench action target helper vocabulary.
- `src/scheduler-runtime/integration-outcome.ts` remains the scheduler runtime owner for outcome reconciliation.
- `README.md` remains unrelated and untracked unless explicitly requested.

## Risks

- Over-broadening the slice could mix runtime behavior changes into a helper reuse change.
- Under-testing could miss accidental loss of the existing fail-closed latest handoff guard.
