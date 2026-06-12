# Spec: Phase 9K Scheduler First Worker Bounded Rework Plan Contract

## Goal

Compile scoped, scheduler-owned rework planning evidence after the first scheduler worker path is blocked by validation or audit, without starting rework or changing existing code-run worktree semantics.

## Users

- Users reviewing the Workbench Harness stage gate after a first scheduler worker fails validation or is blocked by audit.
- Future scheduler executor phases that need a durable rework intent before implementing scoped existing-worktree continuation.

## Acceptance Criteria

- AC-001: Docs accurately record Phase 9J archived and Phase 9K active.
- AC-002: `SchedulerRuntimeWorkerReworkPlan` evidence can be generated from `SchedulerRuntimeWorkerValidation(status="failed")` with no audit.
- AC-003: `SchedulerRuntimeWorkerReworkPlan` evidence can be generated from `SchedulerRuntimeWorkerValidation(status="passed")` plus `SchedulerRuntimeWorkerAudit(status="blocked" | "failed")`.
- AC-004: Approved audit, approved-with-notes audit, missing audit for passed validation, stale lineage, forged lineage, cross-change lineage, and unrelated generic evidence fail closed.
- AC-005: Repeated compile for the same blocking evidence returns the existing scheduler-owned plan and does not write duplicate artifacts.
- AC-006: The plan records blocking source, reason, target worktree intent, future code gate requirement, recovery key inputs, source artifact hashes, and scheduler lineage refs.
- AC-007: Workbench shows `生成第一个 worker rework 计划` only for eligible blocked first-worker states and shows a plan summary after compile.
- AC-008: Phase 9K creates no execution/runtime worker artifacts and does not call `startCodeRun()`.
- AC-009: New scheduler-runtime modules do not depend on Workbench, server, web UI, CLI command modules, or broad facades.
- AC-010: Full product and Harness verification pass, or pre-existing failures are clearly recorded.

## Non-Goals

- Rework-coder execution.
- New code execution gate or existing-worktree continuation support.
- Starting validation, audit, next worker, whole wave, scheduler loop, slot allocator, apply, integration check, PR, merge, or child Change.
- Changing existing Run, Validation, Audit, TaskRun, WorkerLease, Worktree, SchedulerRun, Runtime Continuity, SSE, thread storage, or decision/audit public shapes.

## Constraints

- `README.md` remains unrelated and untracked.
- Main implementation must live in `src/scheduler-runtime/`.
- Workbench handler, server stale revalidation, read-model, and frontend may only dispatch, summarize, and show the plan.
- Existing `startCodeRun()` always creates a worktree; Phase 9K must not pretend it can rework in-place.

## Risks

- Accidentally turning rework planning into execution would bypass the missing existing-worktree continuation gate.
- Auto-binding generic validation/audit evidence by worktree alone would weaken scheduler lineage safety.
- Exposing internal scheduler checkpoints as ordinary user decisions would make the Workbench flow hard to understand.
