# Phase 9A Scheduler Claim Reconcile Plan Foundation

## Purpose

Phase 9A adds a non-executing Scheduler Claim / Reconcile Plan layer after Phase 8Z `SchedulerWorkerSessionPlan`. It turns planned worker stages into auditable claim intents, planned slot demand, source lock intents, wave reconcile checkpoints, blocked reasons, and recovery coverage that a future parallel scheduler would need.

This is product capability foundation, not broad modularization and not a parallel executor. It must not create real `WorkerLease`, `WorkerSession`, `TaskRun`, `WorkflowRun`, worktree, run, child Change, scheduler loop, slot allocator, or Runtime Continuity sidecar.

## Scope

In scope:

- Repair post-8Z handoff drift and record Phase 9A as the active structured change.
- Add owned `src/workflow-scheduler/*` modules and types for `SchedulerClaimReconcilePlan` evidence.
- Add latest/versioned claim-reconcile JSON and Markdown artifacts under selected Change planning artifacts.
- Add Workbench action `planning.scheduler.claim-reconcile.compile` with strict `changeId + schedulerWorkerPlanId` target scope.
- Add Workbench read-model/lazy projection and UI summary for claim/reconcile evidence.
- Add focused tests for scope validation, no-execution guarantees, action registry consistency, projections, and module boundaries.

Out of scope:

- No real `WorkerLease`, `WorkerSession`, `RuntimeWorkspace`, `EventSource`, `WorkflowRun`, `TaskQueueRun`, `TaskRun`, `AgentTask`, worktree, run, child Change, scheduler loop, slot allocator, parallel executor, or Runtime Continuity sidecar creation.
- No CLI API, HTTP route family, SQLite canonical scheduler state, ODWF JavaScript runtime, permission engine, or cache/replay behavior.
- No changes to existing `SchedulerContract`, `SchedulerDispatchDryRun`, `SchedulerWorkerSessionPlan`, Runtime Continuity sidecars, Run/Validation/Audit artifacts, SSE, thread storage, decision/audit scope, or workflow truth.

## Current Status

Ready to close.

Before close, replace this with `Completed.` or `Ready to close.` and keep verification details current. The local close command rejects stale active/planning statuses.

## Verification

- `npm run typecheck`
- `npm run lint`
- `npm run test -- tests/unit/workflow-actions.test.ts`
- `npm run test -- tests/unit/workbench-module-boundaries.test.ts`
- `npm run test -- tests/unit/workbench.test.ts`
- `npm run test -- tests/unit/workbench-server.test.ts`
- `npm run test -- tests/unit/web-app.test.tsx`
- `npm run test`
- `npm run build`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: user requested implementation of the finalized Phase 9A plan.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: no source-root mutation intended.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.
