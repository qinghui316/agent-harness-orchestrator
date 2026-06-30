# Plan: main-agent-taskrun-lifecycle-rework-ownership-v1

## Approach

Move the bounded rework decision to the main-agent orchestration layer while leaving TaskRun, TaskQueue, and WorkflowRun persistence/lifecycle in their existing owners. This is a behavior-preserving architecture migration: no UI, action registry, confirmation, or scheduler changes.

## Steps

1. Add a main-agent TaskRun lifecycle entrypoint that wraps a started or retried TaskRun. It creates one `loopRunId`, runs the single-attempt step loop with `finalizeLoop: false`, finishes the TaskRun through `task-run/manager`, and decides whether a single `rework-coder` retry is legal.
2. Keep `runMainAgentTaskRunAttempt` single-attempt. It may accept internal options needed by the lifecycle, but it must not retry by itself.
3. Replace workflow-runtime recursive bounded rework. `task-run-sequence.ts` starts/retries/marks started as needed, then calls the main-agent lifecycle. `stage-resume-runner.ts` returns resumed stage results and leaves rework to the lifecycle.
4. Add a narrow TaskQueue retry handoff so a retry TaskRun can be bound to the current queue item before rework code execution begins.
5. Preserve WorkflowRun sync and queue status updates in the existing queue runner. The main-agent lifecycle returns compatible result shapes where callers still require them.

## Decisions

- `runMainAgentTaskRunAttempt` remains single-attempt to prevent nested automatic rework.
- TaskQueue remains the queue owner; the new lifecycle only receives a queue handoff callback for retry binding.
- Stage-resume remains a distinct recovery path; it must not restart coder unless the verdict explicitly requires a new TaskRun.

## Minimality Gate Plan

- Can this be a no-op: no; bounded rework still lives in workflow-runtime recursion.
- Reuse: existing main-agent step-loop, TaskRun manager, TaskQueue manager, WorkflowRun sync, and orchestration decision engine.
- Shared root fix: migrate the rework owner once rather than adding guards to each caller.
- Avoided: no new scheduler, UI, provider, workflow authority, or local state machine.
- Smallest coherent change: migrate one TaskRun/item lifecycle before queue-level orchestration.

## Module Boundary Plan

- Owner module: `src/main-agent-orchestration`.
- New / moved responsibilities: bounded rework decision after a finished TaskRun attempt.
- Facade touch points: `workflow-runtime/kernel/task-run-sequence.ts`, `workflow-runtime/kernel/task-queue-runner.ts`, and `workflow-runtime/kernel/stage-resume-runner.ts`.
- Forbidden write-back locations: Workbench UI, confirmation queue, scheduler runtime, apply/close, remote, PR, Harness evolution.
- Compatibility surface: TaskRun/TaskQueue/WorkflowRun result shapes and event sync stay compatible.
- Boundary tests: assert no direct bounded rework execution remains in workflow-runtime wrappers and no forbidden imports enter main-agent lifecycle.
- Follow-up split candidates: queue-level observe/decide orchestration after this change.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: main-agent step loop, AgentTask/Run/Validation/Audit leaf stages, TaskRun manager, TaskQueue manager, WorkflowRun sync.
- Why existing mechanisms are insufficient if a new mechanism is proposed: the existing step loop does not own TaskRun finish/retry lifecycle, so a narrow lifecycle wrapper is needed.
- Domain-specific logic location: TaskRun rework decision in main-agent orchestration; queue item binding in TaskQueue-owned handoff.
- Shared cross-cutting logic location: no new cross-cutting protocol beyond the existing step loop and TaskRun/TaskQueue managers.
- Local framework / state machine / projection / validation / gate avoided: no new execution state machine or UI projection.
- Future-cost reduction for similar features: queue-level orchestration can later call the same lifecycle without preserving old recursive rework paths.

## Planning-Discovered Gaps

- Subagent review identified TaskQueue retry binding before rework coder execution as mandatory because the `taskqueue-proposal` gate checks TaskRun scope.
- Subagent review identified stage-resume compatibility as mandatory; resumed validation/audit paths must not fall back to coder-first execution.
