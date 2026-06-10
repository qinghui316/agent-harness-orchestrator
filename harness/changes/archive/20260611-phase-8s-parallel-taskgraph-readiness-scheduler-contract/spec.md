# Spec: Phase 8S Parallel TaskGraph Readiness Scheduler Contract

## Goal

Add a scheduler-contract foundation for parallel TaskGraph candidates. When a confirmed DecompositionPlan is a safe parallel candidate, readiness should authorize only a non-executing SchedulerContract compile action. The contract records dependency order, conflict/source scopes, and topological waves as evidence for a later scheduler phase.

## Users

- Developers using AHO Workbench to refine a complex demand before execution.
- Future scheduler/runtime implementers who need a typed, immutable input contract instead of chat prose.

## Acceptance Criteria

- AC-001: Docs accurately record Phase 8R closed and Phase 8S active.
- AC-002: `taskgraph-parallel-candidate` no longer becomes sequential TaskQueue readiness.
- AC-003: Parallel-ready decomposition produces `ready-for-scheduler-contract` with `nextAllowedAction = "scheduler.contract"`.
- AC-004: Sequential TaskQueue readiness and execution behavior remain unchanged.
- AC-005: `planning.taskqueue.propose` rejects scheduler-contract readiness.
- AC-006: `SchedulerContract` is generated as a versioned typed artifact with latest pointer and Markdown rendering.
- AC-007: SchedulerContract compile validates selected Change scope, confirmed plan, matching readiness, accepted artifact hashes, DAG, source scopes, and conflict scopes.
- AC-008: SchedulerContract compile creates no WorkflowRun, TaskQueueRun, TaskRun, WorkerLease, AgentTask, worktree, run, child Change, or source mutation.
- AC-009: Workbench action registry, required targets, live allow-list, high-impact set, stale revalidation, server request type, frontend payload helper, and tests include `planning.scheduler.contract.compile`.
- AC-010: Workbench first screen shows SchedulerContract summary only; full details load lazily.
- AC-011: No fake parallel start/run/queue control is exposed.
- AC-012: New `src/workflow-scheduler/*` modules do not depend on Workbench, server routes, web UI, CLI command modules, or broad facades.
- AC-013: Open Dynamic Workflows and Symphony remain references only; no ODWF JS runtime, null-as-success parallel semantics, or external ticket truth is introduced.
- AC-014: Full product and Harness verification pass, or any pre-existing failure is clearly recorded.

## Non-Goals

- Parallel scheduler execution.
- Parallel TaskRun/WorkerLease dispatch.
- Child Change creation.
- Runtime cache/replay.
- CLI API additions.

## Constraints

- Future Feature Module Boundary Rule applies: `src/workflow-scheduler/` is the owner module.
- SchedulerContract is evidence / execution-planning input, not workflow truth.
- Existing artifact shapes must remain backward compatible where possible.
- `README.md` remains unrelated and untracked.

## Risks

- Accidentally routing parallel candidates through sequential TaskQueue would create unsafe execution semantics.
- Treating conflict edges as an implicit execution order could hide unresolved user intent.
- Adding action support without registry/revalidation/frontend parity would reintroduce scoped action drift.

