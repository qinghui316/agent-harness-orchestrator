# Plan: Phase 8S Parallel TaskGraph Readiness Scheduler Contract

## Approach

Implement in thin vertical slices: handoff docs, scheduler artifact/domain module, readiness semantics, action boundary, projection/UI, then tests and verification. Keep all main SchedulerContract logic in `src/workflow-scheduler/`.

## Steps

1. Record Phase 8R archived / Phase 8S active in docs and ECL artifacts.
2. Add SchedulerContract types, schema, paths, rendering, repository, and compiler in `src/workflow-scheduler/`.
3. Update DecompositionReadiness semantics so parallel candidates produce `ready-for-scheduler-contract` / `scheduler.contract`.
4. Add Workbench action `planning.scheduler.contract.compile` through registry, required target rules, stale revalidation, server/live actions, and handler dispatch.
5. Add SchedulerContract summary/lazy projection and Workpad/confirmation UI affordance.
6. Add tests for parallel readiness, DAG/wave compile, fail-closed stale/forged targets, no execution side effects, and module boundaries.
7. Run full product and Harness verification.

## Decisions

- Use a new `SchedulerContract` artifact instead of extending `WorkflowGraphPlan`; `WorkflowGraphPlan` remains sequential execution input.
- Use Kahn topological levels for `waves`; cycle is invalid.
- Treat conflict edges without explicit dependency ordering as blocked, not as automatic ordering.
- Do not copy ODWF `parallel()` failure-to-null semantics.
- Keep `schedulerEligible` for compatibility but make text describe non-executing contract readiness.

## Module Boundary Plan

- Owner module: `src/workflow-scheduler/`.
- New / moved responsibilities: SchedulerContract schema/types, artifact paths, repository, scope guards, DAG validation, wave generation, source/conflict readiness, Markdown rendering, and compile service.
- Facade touch points: Workbench action handler, projection facade, server lazy projection, frontend panel/payload helper, and workflow action registry call into owned modules only.
- Forbidden write-back locations: `src/workbench/chat.ts`, `src/workbench/manager.ts`, `src/workbench/projections/read-model.ts`, `src/server/workbench-server.ts`, `src/web/src/App.tsx`, `src/workflow-runtime/code-workflow.ts`, `src/workflow-artifacts/manager.ts`, and existing domain `manager.ts` facades.
- Compatibility surface: existing sequential TaskQueue / WorkflowGraphPlan / WorkflowRun paths, existing Workbench action payloads, lazy projection routes, and frontend API shape.
- Boundary tests: module dependency test for `src/workflow-scheduler/*`, action registry consistency, and no-execution side-effect tests.
- Follow-up split candidates: real parallel scheduler execution phase after SchedulerContract is accepted as input.
- If not applicable, reason: applicable.

## Planning-Discovered Gaps

None yet.

