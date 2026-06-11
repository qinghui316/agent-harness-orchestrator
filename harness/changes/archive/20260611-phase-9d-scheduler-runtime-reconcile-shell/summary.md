# Phase 9D Scheduler Runtime Reconcile Shell

## Purpose

Phase 9D starts the first scheduler runtime-state step after the Phase 9C
non-executing SchedulerRun journal shell. It adds SchedulerRun-scoped runtime
sidecar evidence for initialization and reconcile snapshots while keeping
SchedulerRun as the only scheduler run identity.

This phase is still not a parallel executor. It does not start workers, allocate
leases, create TaskRun/AgentTask/WorkerSession/runtime-continuity sidecars,
create worktrees or runs, or call coder/validator/auditor.

## Scope

In scope:

- Repair post-9C handoff drift and record Phase 9D as the active structured
  change.
- Add an owned `src/scheduler-runtime/` module for scheduler runtime state,
  events, scope/lineage guards, and reconcile snapshots.
- Add SchedulerRun-scoped runtime sidecar artifacts without changing the
  existing SchedulerRun JSON shape.
- Add Workbench actions for runtime-shell initialization and reconcile snapshot
  generation.
- Add Workbench summaries/lazy projections and focused tests for non-execution
  boundaries.

Out of scope:

- Parallel executor, scheduler loop, slot allocator, real worker claim, or
  worker execution.
- Creating WorkflowRun, TaskQueueRun, TaskRun, WorkerLease, AgentTask,
  WorkerSession, RuntimeWorkspace, EventSource, worktree, run, or child Change.
- Changing existing SchedulerRun JSON shape or replacing SchedulerRun as the
  scheduler run identity.
- New CLI APIs, standalone HTTP routes, SQLite canonical state, ODWF runtime,
  cache/replay, or ToolPolicy pre-authorization.

## Current Status

Completed.

## Verification

- `npm run typecheck`
- `npm run lint`
- `npm run test -- tests/unit/workflow-actions.test.ts`
- `npm run test -- tests/unit/workbench-module-boundaries.test.ts`
- `npm run test -- tests/unit/workbench-server.test.ts`
- `npm run test -- tests/unit/web-app.test.tsx`
- `npm run test -- tests/unit/workbench.test.ts`
- `npm run build`
- `npm run test`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.
