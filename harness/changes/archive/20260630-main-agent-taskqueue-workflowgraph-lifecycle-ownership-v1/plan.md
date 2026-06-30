# Plan: main-agent-taskqueue-workflowgraph-lifecycle-ownership-v1

## Approach

Add a new main-agent TaskQueue lifecycle owner and reduce the old
`task-queue-runner.ts` to a compatibility wrapper. Move stage-resume
orchestration beside the new lifecycle. Reuse existing TaskQueue, TaskRun,
WorkflowRun, validation, and audit managers for persistence and evidence.

## Steps

1. Add `src/main-agent-orchestration/taskqueue-lifecycle.ts`.
   - Start/resume the workflow task queue through existing taskqueue helpers.
   - Read/sync WorkflowRun through existing workflow-run/taskqueue helpers.
   - Loop over next queue items, live pause, completed, blocked, and failed
     states.
   - For each item, call `runMainAgentTaskRunLifecycle` or resumed stage
     handling, then finish the queue item and sync WorkflowRun.
2. Add `src/main-agent-orchestration/taskqueue-stage-resume.ts`.
   - Move resume verdict handling out of workflow-runtime.
   - Require current change and queue/workflow scope when choosing a resume
     candidate.
   - Preserve completed, continue-validation, continue-audit, continue-rework,
     and blocked semantics.
3. Replace `runTaskQueueSequence` implementation.
   - Keep the exported function and action handler compatibility.
   - Remove queue loop control and direct TaskRun/rework/stage-resume imports
     from `workflow-runtime/kernel/task-queue-runner.ts`.
4. Remove old direct rework production path.
   - Stop production use of `executeTaskRunReworkIfEligible`.
   - Delete the helper if it has no remaining legitimate callers.
5. Update boundary and behavior tests.
   - Replace tests that expected old runner rework ownership.
   - Add assertions for thin wrapper, fail-closed gate scope, resume scope, and
     no scheduler/UI/authority expansion.

## Decisions

- Keep `runTaskQueueSequence` as the public compatibility name for this change.
- Do not rename Workbench action types.
- Treat missing TaskQueue proposal/graph scope as a hard stop, not a fallback.
- Preserve blocked user semantics; low-level compatibility may still use an
  existing fail-item helper if no blocked-item API exists.

## Minimality Gate Plan

- Can this be a no-op: no; current production queue loop still lives in
  workflow-runtime and blocks the main-agent architecture migration.
- Reuse: existing TaskQueue, TaskRun, WorkflowRun, validation, audit, and
  taskqueue reconcile/sync owners are reused.
- Shared root fix: move the queue loop owner once instead of adding another
  local wrapper around the old runner.
- Avoided: no new UI, persistence family, scheduler path, provider path, or
  free-form LLM decision system.
- Smallest coherent change: one new queue lifecycle owner, one stage-resume
  owner, a thin compatibility wrapper, and tests.

## Module Boundary Plan

- Owner module: `src/main-agent-orchestration/taskqueue-lifecycle.ts`.
- New / moved responsibilities: queue-level orchestration control and stage
  resume orchestration.
- Facade touch points: `workflow-runtime/kernel/task-queue-runner.ts` and
  `workflow-runtime/code-workflow.ts` remain compatibility surfaces.
- Forbidden write-back locations: Workbench UI, confirmation queue, scheduler
  runtime, automation allowlist, apply/close, remote/PR/merge, Harness evolution.
- Compatibility surface: existing Workbench action handlers continue calling
  `runTaskQueueSequence`.
- Boundary tests: module-boundary grep for old control imports, scheduler/UI
  negative imports, and production helper usage.
- Follow-up split candidates: scheduler/parallel integration after sequential
  queue lifecycle is stable.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: TaskQueue manager, TaskRun manager,
  WorkflowRun manager, taskqueue reconcile/sync, validation/audit managers, and
  main-agent TaskRun lifecycle.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no
  existing main-agent owner currently controls the queue-level loop; the old
  workflow-runtime runner owns it.
- Domain-specific logic location: queue orchestration in main-agent lifecycle;
  state writes remain in domain managers.
- Shared cross-cutting logic location: none added beyond the new owner boundary.
- Local framework / state machine / projection / validation / gate avoided: no
  new workflow truth or UI projection; only fail-closed scope checks.
- Future-cost reduction for similar features: scheduler/parallel integration can
  attach to one main-agent queue owner instead of crossing old runtime runners.

## Planning-Discovered Gaps

- Existing blocked verdict plumbing uses failure-oriented queue item helpers.
  Implementation must either add a narrow blocked-compatible path or preserve
  blocked user/workflow semantics while reusing existing helpers.
- Stage-resume candidate lookup currently keys mostly by change/task; it must be
  tightened to current queue/workflow scope.
