# Spec: Workbench Test Architecture Read Model Unit Domain Split

## Goal

Split the residual Workbench read-model/projection unit-test cluster out of `tests/unit/workbench.test.ts` into an explicit unit suite.

This continues Workbench test architecture convergence with a larger coherent capability-domain slice. It must preserve product runtime behavior and keep read-model/projection coverage in the explicit Workbench test contract.

## Users

- AHO maintainers and future agents working on Workbench read-model/projection behavior.
- Product developers who need targeted regression coverage for topic lists, snapshots, transcript projection, thread streams, stream replay, roles, approvals, close decisions, forged metadata safety, and task graph projection without searching the residual Workbench monolith.

## Acceptance Criteria

- AC-001: The complete selected Workbench read-model/projection unit cluster is moved from `tests/unit/workbench.test.ts` into `tests/unit/workbench-read-model.test.ts`.
- AC-002: The extracted suite reuses existing Workbench fixture lifecycle from `tests/unit/workbench/fixtures.ts` and does not create a new broad shared fixture framework.
- AC-003: The moved cluster stops before TaskRun/TaskQueue runtime action-validation tests and does not include scheduler, Goal Loop, maintenance, apply/IntegrationCheck, remote landing, or DemandWorker domains.
- AC-004: `npm run test:workbench` explicitly includes the new read-model suite, and `npm run test:fast` excludes it as Workbench-specific coverage.
- AC-005: Product runtime behavior, Workbench behavior, read-model semantics, transcript boundaries, approval semantics, task graph semantics, ToolPolicyGate, human gates, source/canonical apply authority, and Harness evolution behavior are unchanged.

## Non-Goals

- Product runtime changes.
- Workbench projection/action/server/frontend behavior changes.
- Harness rule/template changes.
- Moving TaskRun/TaskQueue runtime action validation tests, scheduler tests, Goal Loop tests, maintenance tests, apply/IntegrationCheck tests, remote landing tests, or DemandWorker tests in this change.
- New test framework or broad fixture rewrite.
- Reference project source inspection or updates.

## Constraints

- Treat this as Architecture Growth Control / test architecture convergence, not feature implementation.
- Keep the moved scope to the read-model/projection cluster identified in planning.
- Reuse existing shared Workbench fixtures where their hook lifecycle fits.
- Keep read-model/projection-only helpers local unless there is existing shared ownership.
- Keep `README.md` unrelated and untracked.
- Preserve explicit Workbench test script composition.

## Risks

- Import drift while moving a larger multi-test cluster.
- Accidentally moving adjacent TaskRun/TaskQueue runtime action-validation tests and broadening the stage.
- Dropping the new suite from the explicit Workbench test contract.
- Over-sharing helper code and creating another mini fixture framework.
