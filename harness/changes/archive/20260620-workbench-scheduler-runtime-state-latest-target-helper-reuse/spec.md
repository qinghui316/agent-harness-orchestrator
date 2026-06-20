# Spec: workbench-scheduler-runtime-state-latest-target-helper-reuse

## Goal

Continue Gate/action target revalidation convergence by reusing the shared Workbench action latest-target helper for scheduler runtime-state latest id targets.

## Users

- Future agents maintaining Workbench scheduler action gates.
- Users relying on scheduler planning and reserve-claims actions to fail closed for stale runtime-state targets without adding new local gate frameworks.

## Acceptance Criteria

- AC-001: `planning.scheduler.plan.prepare` uses `assertLatestWorkbenchActionTarget` for latest SchedulerReconcileSnapshot and SchedulerRuntimeClaimReservation id checks.
- AC-002: `planning.scheduler.runtime.reserve-claims` uses `assertLatestWorkbenchActionTarget` for its latest SchedulerReconcileSnapshot id check.
- AC-003: Cross-field runtime-state lineage/stale checks and existing error text are preserved.
- AC-004: Tests or static boundary assertions prove helper adoption and that the old raw latest-id comparisons are removed.
- AC-005: Review records Module Boundary and Core Mechanism Reuse coverage, including targeted verification and full-test skip rationale if full tests are not run.

## Non-Goals

- Do not add a new helper or local validator.
- Do not move or change scheduler-runtime owner logic.
- Do not change action payloads, Workbench UI/projections, Goal Loop, IntegrationCheck, apply/discard, source mutation, or reference projects.

## Constraints

- Workflow truth remains Change/ECL, accepted artifacts, Run, Validation, Audit, IntegrationCheck, Apply/Close gates, and Harness evolution records.
- `src/workbench/actions/active-target.ts` owns shared Workbench action target helper vocabulary.
- `src/workbench/actions/boundary.ts` may call shared helpers but must not absorb scheduler runtime domain logic.
- `README.md` remains unrelated and untracked unless explicitly requested.

## Risks

- Collapsing cross-field lineage checks into the helper would lose domain-specific stale-target semantics.
- Expanding beyond the three latest-id checks could mix helper reuse with runtime behavior changes.
