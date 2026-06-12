# Phase 9K Scheduler First Worker Bounded Rework Plan Contract

## Purpose

Phase 9K adds scheduler-owned bounded rework planning evidence for the first scheduler worker path. When the first scheduler worker validation fails, or when validation passed but audit blocks/fails, AHO can compile a `SchedulerRuntimeWorkerReworkPlan` that records the exact blocking evidence, target worktree intent, future execution gate requirements, recovery inputs, and full scheduler lineage.

This phase is deliberately non-executing. It does not call `startCodeRun()`, does not add an existing-worktree code continuation path, and does not start rework. The actual scoped rework-coder execution remains a later phase after a dedicated existing-worktree continuation gate exists.

## Scope

In scope:

- Repair post-9J handoff drift and mark Phase 9K active.
- Add scheduler-owned first-worker bounded rework plan evidence.
- Add the Workbench action `planning.scheduler.worker.rework-plan.compile`.
- Show a user-facing rework-plan summary after validation failed or audit blocked/failed.
- Preserve scheduler-runtime owner-module boundaries.

Out of scope:

- Rework execution or any call to `startCodeRun()`.
- Existing-worktree code continuation support.
- New TaskRun, WorkerLease, WorkerSession, RuntimeWorkspace, EventSource, worktree, run, AgentTask, WorkflowRun, TaskQueueRun, or child Change creation.
- Validation, audit, next-worker start, whole-wave dispatch, scheduler loop, slot allocator, apply, integration check, PR, merge, CLI command, or HTTP route changes.

## Current Status

Ready to close.

## Verification

Passed:

- `npm run test -- tests/unit/workflow-actions.test.ts`
- `npm run test -- tests/unit/workbench-server.test.ts`
- `npm run test -- tests/unit/workbench-module-boundaries.test.ts`
- `npm run test -- tests/unit/workbench.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run test`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`

Note: the first full `npm run test` run hit one transient `tests/unit/web-app.test.tsx` assertion. The targeted rerun passed, and a subsequent full `npm run test` passed.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.
