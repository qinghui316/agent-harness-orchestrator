# Spec: Phase 8Y Scheduler Dispatch Reconcile Dry Run Evidence

## Goal

Add a scoped, non-executing `SchedulerDispatchDryRun` evidence artifact that previews how a future scheduler would dispatch and reconcile a selected `SchedulerContract` without starting any worker or creating any runtime execution state.

## Users

- The primary user is the Workbench operator evaluating a selected demand that has already compiled a SchedulerContract.
- The secondary user is a future scheduler/runtime implementer who needs durable evidence for dispatch/reconcile decisions before real parallel execution is introduced.

## Acceptance Criteria

- AC-001: Docs and handoff state accurately record Phase 8X closed/archived and Phase 8Y active, with no stale Phase 8X active or pending evolution claim.
- AC-002: `src/workflow-scheduler/` owns `SchedulerDispatchDryRun` compile/read/render logic; Workbench handler/projection/UI are thin call/display layers.
- AC-003: Workbench action `planning.scheduler.dispatch.dry-run` requires `changeId + schedulerContractId` and rejects stale, forged, cross-Change, missing, or superseded contracts.
- AC-004: A valid selected SchedulerContract produces versioned/latest dry-run JSON and Markdown evidence with wave verdicts, node verdicts, dependency readiness, conflict/source summaries, estimated max wave width, runtime-continuity prerequisites, blocked reasons, and source artifact hashes.
- AC-005: Dry-run evidence does not create `WorkflowRun`, `TaskQueueRun`, `TaskRun`, `WorkerLease`, `AgentTask`, worktree, run, child Change, source mutation, ODWF runtime record, cache/replay record, or scheduler runtime state.
- AC-006: Dry-run does not reuse or allocate DemandWorker slots; any slot information is explicitly an evidence-only estimate derived from SchedulerContract waves.
- AC-007: Workbench shows "生成调度预演" and dry-run summary after SchedulerContract, lazy-loads full detail, and does not show parallel start/run/queue controls.
- AC-008: Existing SchedulerContract, Runtime Continuity, Run/Validation/Audit artifacts, SSE/live events, thread storage, decision/audit scope, and workflow truth remain unchanged.
- AC-009: `src/workflow-scheduler/*` new modules do not depend on Workbench, server routes, web UI, CLI command modules, or broad facades.
- AC-010: Full product and Harness verification pass, or any pre-existing failure is clearly recorded.

## Non-Goals

- No scheduler executor, scheduler daemon, parallel TaskRun, WorkerLease allocation, AgentTask creation, worktree creation, run creation, child Change creation, ODWF JavaScript runtime, LLM cache/replay, or permission engine.
- No CLI API, HTTP route, Workbench lazy route beyond the existing projection mechanism, or SQLite scheduler truth.
- No promotion of `SchedulerContract` or `SchedulerDispatchDryRun` to workflow truth.

## Constraints

- `SchedulerDispatchDryRun` is execution-planning evidence only.
- Canonical Change scope must be verified through the same artifact scope guard pattern used by workflow artifacts and SchedulerContract.
- Raw request payload cannot override selected `changeId` or SchedulerContract scope.
- File writes must use UTF-8 and must not include unrelated `README.md`.

## Risks

- The word "dispatch" could imply execution. UI copy, Markdown, docs, and tests must explicitly say dry-run does not start workers or allocate leases.
- Slot terminology could be confused with DemandWorker slots. The dry-run must call this an estimate/max wave width, not actual slot allocation.
- Adding a Workbench action requires registry/live/high-impact/revalidation/frontend/server consistency updates to avoid stale target bypass.
