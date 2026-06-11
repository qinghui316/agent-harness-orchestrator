# Spec: Phase 9C SchedulerRun Journal Shell Human Gated Launch Record

## Problem

Phase 8S through Phase 9B created a deliberate pre-executor scheduler evidence chain: SchedulerContract, dispatch dry-run, worker-session plan, claim/reconcile plan, and launch preflight. The next missing boundary is a human-gated scheduler run journal shell that records the user's confirmed launch intent and creates a recovery anchor for a future executor.

Jumping directly from launch preflight to worker creation would collapse planning evidence into runtime execution and risk bypassing ToolPolicyGate, human confirmation, and recovery scope checks.

## Requirements

- Add `SchedulerRun` as non-executing scheduler coordination evidence.
- `SchedulerRun` must bind the latest matching `SchedulerLaunchPreflight -> SchedulerClaimReconcilePlan -> SchedulerWorkerSessionPlan -> SchedulerDispatchDryRun -> SchedulerContract` lineage.
- `SchedulerRun` status must be limited to `prepared | blocked | abandoned`; it must not use `running`, `started`, `executing`, `authorized`, or equivalent execution terms.
- Add a journal JSONL whose canonical `changeId`, `schedulerRunId`, and lineage ids come from the persisted SchedulerRun, not caller payload.
- Add Workbench action `planning.scheduler.run.prepare` with explicit `changeId + schedulerLaunchPreflightId` scope.
- The action must require user confirmation, high-impact handling, stale-target revalidation, and decision/audit scope preservation.
- The action must accept only latest matching launch preflight with `status="checked"`.
- The action must reject blocked, rejected, stale, forged, cross-change, superseded, or hash-mismatched preflight/lineage.
- Workbench may display SchedulerRun summary and lazy detail, but must not expose parallel start/run/worker/slot/lease controls.

## Non-Goals

- Do not create `WorkflowRun`, `TaskQueueRun`, `TaskRun`, `WorkerLease`, `AgentTask`, `WorkerSession`, `RuntimeWorkspace`, `EventSource`, worktree, code/validation/audit Run, child Change, scheduler loop, slot allocator, or parallel executor.
- Do not pre-run or pre-authorize future executor ToolPolicyGate.
- Do not add CLI commands, HTTP routes, or product runtime execution capability.

## Acceptance Criteria

- AC-001: Docs record Phase 9B closed and Phase 9C active with no stale Phase 9B active claim.
- AC-002: `SchedulerRun` typed artifact and journal are owned by `src/workflow-scheduler/`.
- AC-003: `planning.scheduler.run.prepare` writes only SchedulerRun evidence and decision/audit records.
- AC-004: `SchedulerRun` binds latest checked SchedulerLaunchPreflight and full scheduler lineage.
- AC-005: stale/forged/cross-change/superseded/hash-mismatched/blocked preflight rejects.
- AC-006: journal events cannot forge canonical SchedulerRun scope.
- AC-007: Workbench shows SchedulerRun summary/lazy detail and no parallel execution controls.
- AC-008: No runtime/execution artifacts are created.
- AC-009: Workflow-scheduler modules remain independent of Workbench/server/web/CLI.
- AC-010: Full product and Harness verification pass or any pre-existing failure is recorded.
