# Plan: Phase 9K Scheduler First Worker Bounded Rework Plan Contract

## Approach

Implement Phase 9K as a narrow scheduler-runtime extension. Add a `worker-rework-plan.ts` service that mirrors the Phase 9I/9J lineage guard style, but only writes a non-executing plan artifact. The action is exposed through existing Workbench action plumbing and projection surfaces without moving core logic into Workbench/server/frontend files.

## Steps

1. Repair docs handoff from Phase 9J to Phase 9K.
2. Add `SchedulerRuntimeWorkerReworkPlan` type/schema/path/repository/rendering support.
3. Implement `compileSchedulerFirstWorkerReworkPlan()` in `src/scheduler-runtime/worker-rework-plan.ts`.
4. Add Workbench action `planning.scheduler.worker.rework-plan.compile` through registry, boundary revalidation, handler, result summary, confirmation queue, read-model, lazy projection, and frontend payload types.
5. Add focused tests for valid validation-failed and audit-blocked paths, fail-closed lineage cases, idempotency, non-execution, module boundaries, and action-surface consistency.
6. Run focused tests and full verification.

## Decisions

- Phase 9K compiles a plan only. It must not execute rework because `startCodeRun()` currently creates a fresh worktree and does not support scoped continuation in the 9G worker worktree.
- The accepted blocking sources are validation failed, or audit blocked/failed after validation passed.
- The same blocking evidence must dedupe to one rework plan.
- Phase 9L can add scoped existing-worktree continuation execution after this contract is in place.

## Module Boundary Plan

- Owner module: `src/scheduler-runtime/`.
- New / moved responsibilities: scheduler first-worker rework-plan schema, artifact path, repository read/write, Markdown rendering, lineage guard, compile service.
- Facade touch points: `src/scheduler-runtime/manager.ts` re-exports the new service/types; Workbench action modules call the scheduler-runtime service.
- Forbidden write-back locations: `src/workbench/chat.ts`, Workbench projection facade, server route facade, frontend shell, `src/code/manager.ts`, and broad manager facades must not receive main implementation logic.
- Compatibility surface: no CLI/API/route changes; Workbench adds one action and lazy projection; existing artifact shapes remain compatible.
- Boundary tests: module-boundary test must confirm scheduler-runtime ownership and no dependency on Workbench/server/web/CLI broad facades.
- Follow-up split candidates: none.
- If not applicable, reason: not applicable because this phase has an owner module.

## Planning-Discovered Gaps

- Current `startCodeRun()` always creates a fresh worktree. This phase therefore plans rework only; scoped existing-worktree rework execution must be a later phase.
