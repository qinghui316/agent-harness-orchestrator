# Plan: Phase 9A Scheduler Claim Reconcile Plan Foundation

## Approach

Implement Phase 9A as an additive scheduler evidence layer. Keep `src/workflow-scheduler/` as owner for schema, paths, repository, compiler, and rendering. Workbench action/projection/UI changes remain thin integration points and must not contain claim/reconcile compile logic.

## Steps

1. Repair docs/handoff drift for post-8Z archive state and Phase 9A active state.
2. Add `SchedulerClaimReconcilePlan` types, schema, paths, repository helpers, compiler, and Markdown renderer.
3. Wire `planning.scheduler.claim-reconcile.compile` through Workbench action handlers, registry sets, required-target checks, high-impact/stale-target revalidation, scope payload/target id, result text, and confirmation queue.
4. Add read-model summary and lazy projection for claim/reconcile evidence.
5. Add frontend types and Workpad card for claim/reconcile summary while keeping parallel start controls hidden.
6. Add focused tests for artifact scope, stale target rejection, source-lock inconsistency, no-execution guarantees, registry consistency, UI/projection behavior, and module boundaries.
7. Run focused tests, full product verification, and Harness verification.

## Decisions

- Artifact name is `SchedulerClaimReconcilePlan`, not `SchedulerLeasePlan`, to avoid confusion with real `WorkerLease`.
- Compiler input is `changeId + schedulerWorkerPlanId`; it reads the matching worker plan, dry-run, and contract rather than accepting raw UI objects.
- Claim entries use `claimIntentId` and `plannedWorkerKey`; they must not create or predict real runtime object ids.
- Planned slot demand is descriptive evidence only. It is not actual available capacity or allocation.
- Same-wave overlapping source lock intent is a fail-closed artifact inconsistency because the upstream contract should already have ordered overlapping source scopes.

## Module Boundary Plan

- Owner module: `src/workflow-scheduler/`.
- New / moved responsibilities: `SchedulerClaimReconcilePlan` schemas/types, paths, repository, compiler, rendering, source-hash/stale guards, source-lock intent consistency.
- Facade touch points: `src/workflow-scheduler/manager.ts` re-exports the new internal modules.
- Forbidden write-back locations: Workbench action handlers, server routes, web UI, runtime-continuity modules, runtime kernels, TaskQueue/TaskRun managers, and WorkerLease code must not own claim/reconcile compile logic.
- Compatibility surface: existing SchedulerContract, SchedulerDispatchDryRun, SchedulerWorkerSessionPlan, Workbench snapshot/lazy projection, action result, SSE, and thread storage shapes remain compatible except for additive claim/reconcile fields/action.
- Boundary tests: module-boundary test for workflow-scheduler independence and facade exports; action registry tests for the new action.
- Follow-up split candidates: none for moduleization; future product phase may implement a gated scheduler executor using this contract.

## Planning-Discovered Gaps

- No active change existed before Phase 9A, and `README.md` was the only unrelated untracked file.
