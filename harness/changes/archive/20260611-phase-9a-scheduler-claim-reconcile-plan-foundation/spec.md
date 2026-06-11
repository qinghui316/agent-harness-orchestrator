# Spec: Phase 9A Scheduler Claim Reconcile Plan Foundation

## Goal

Add a non-executing `SchedulerClaimReconcilePlan` artifact after `SchedulerWorkerSessionPlan`. The artifact records claim eligibility, wave reconcile checkpoints, planned slot demand, source lock intent, blocked reasons, recovery key coverage, and source hashes that a later parallel scheduler must consume.

## Users

- AHO developer/operator reviewing parallel-readiness evidence in Workbench.
- Future scheduler implementation that needs typed pre-execution coordination evidence.
- Future agents reading archived ECL history and scheduler artifacts.

## Acceptance Criteria

- AC-001: Docs accurately record Phase 8Z archived and Phase 9A active, with no stale Phase 8Z active claim.
- AC-002: `SchedulerClaimReconcilePlan` latest/versioned JSON and Markdown artifacts are written under the selected Change planning directory.
- AC-003: The plan binds the latest matching `SchedulerWorkerSessionPlan`, `SchedulerDispatchDryRun`, and `SchedulerContract`.
- AC-004: Stale, forged, cross-change, superseded, or source-hash-mismatched inputs fail closed.
- AC-005: Claim/reconcile plan entries use claim intent ids and planned worker keys, not real `WorkerLease.id` or `WorkerSession.id`.
- AC-006: Blocked worker-plan stages remain blocked claim intents.
- AC-007: Same-wave overlapping source lock intent is rejected as artifact inconsistency.
- AC-008: Workbench exposes `planning.scheduler.claim-reconcile.compile` with full scoped payload and stale-target revalidation.
- AC-009: Workbench summary/lazy projection shows claim/reconcile evidence without parallel start, run, queue, lease, or worker-slot controls.
- AC-010: No execution/runtime artifacts are created.
- AC-011: `src/workflow-scheduler/*` remains independent from Workbench, server, web UI, CLI command modules, and broad facades.
- AC-012: Full product and Harness verification pass, or any pre-existing failure is clearly recorded.

## Non-Goals

- No real `WorkerLease`, `WorkerSession`, `RuntimeWorkspace`, `EventSource`, `TaskRun`, `WorkflowRun`, `TaskQueueRun`, `AgentTask`, worktree, run, child Change, scheduler loop, slot allocator, or parallel executor.
- No CLI commands, HTTP route family, SQLite scheduler truth, ODWF JavaScript runtime, permission engine, or cache/replay behavior.
- No changes to existing SchedulerContract, SchedulerDispatchDryRun, SchedulerWorkerSessionPlan, Runtime Continuity sidecars, Run/Validation/Audit artifacts, Workbench API/SSE/thread shapes, or workflow truth.

## Constraints

- `SchedulerClaimReconcilePlan` is evidence only and must not be execution authorization.
- New implementation ownership stays under `src/workflow-scheduler/`.
- Workbench/server/frontend changes are thin integration and display layers.
- Do not use `LeasePlan` naming because `WorkerLease` is an existing runtime evidence object.
- `README.md` remains unrelated and untracked.

## Risks

- Naming or UI copy could imply a real scheduler. Mitigation: use claim/reconcile intent wording and repeat non-execution copy in docs, confirmation queue, and Markdown rendering.
- Action registry drift could leave the new action out of live/high-impact/revalidated sets. Mitigation: extend workflow action consistency tests.
- New artifact could accidentally overlap with real `WorkerLease` or Runtime Continuity sidecars. Mitigation: test no execution/runtime artifacts are created.
