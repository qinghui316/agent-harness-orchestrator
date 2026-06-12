# Plan: Phase 9J Scheduler First Worker Audit Gate

## Approach

Implement Phase 9J as a narrow scheduler-runtime owned extension. Add scheduler audit types, repository helpers, rendering, and a `worker-audit.ts` service that mirrors the Phase 9I guard style before calling the existing audit runner with an exact validation binding.

## Steps

1. Repair docs/handoff drift from Phase 9I to Phase 9J.
2. Extend audit service options with optional `validationId` while preserving legacy behavior when omitted.
3. Add `SchedulerRuntimeWorkerAudit` type/schema/path/repository/rendering/event support.
4. Implement `auditSchedulerFirstWorker()` in `src/scheduler-runtime/worker-audit.ts`.
5. Wire the Workbench action registry, stale revalidation, handler, result labeling, scope payload, server/web request types, lazy projection, and UI summary.
6. Add focused tests for success, blocked/failed audit, idempotence, stale/forged scope rejection, generic evidence non-binding, and module boundaries.
7. Run focused and full verification, then update review/status before close.

## Decisions

- Audit approval statuses are `approved` and `approved-with-notes`.
- Audit `blocked` and `failed` both block the TaskRun, matching existing TaskRun workflow-result semantics.
- Scheduler audit must bind to the exact Phase 9I validation run; generic latest validation lookup is not sufficient.

## Module Boundary Plan

- Owner module: `src/scheduler-runtime/`.
- New / moved responsibilities: first-worker audit guard, scheduler-owned audit sidecar, rendering, and repository lookup.
- Facade touch points: `src/scheduler-runtime/manager.ts` re-exports only; Workbench/server/web dispatch and display only.
- Forbidden write-back locations: `src/workbench/chat.ts`, broad server facades, frontend shell, generic audit manager implementation for scheduler-specific logic.
- Compatibility surface: existing `startAuditRun()` remains compatible; optional `validationId` is additive.
- Boundary tests: module boundary test must assert scheduler runtime modules avoid Workbench/server/web/CLI facades and `manager.ts` exports `worker-audit`.
- Follow-up split candidates: none.

## Planning-Discovered Gaps

- Existing audit lookup can choose latest validation by worktree/diff. Phase 9J must add exact validation binding for scheduler audit so unrelated generic validation cannot be consumed.
