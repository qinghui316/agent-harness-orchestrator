# Plan: main-agent-workflowgraph-observation-cleanup-queue-wrapper-removal-v1

## Approach

Make the smallest architecture cleanup before building replay. First fix the
WorkflowGraph observation state classifier so it distinguishes an unbound
created WorkflowRun from an active queue. Then remove the last legacy TaskQueue
wrapper export and update tests to enforce the new single entrypoint.

## Steps

1. Update `decideMainAgentWorkflowGraph()` so `created` WorkflowRun state returns
   `wait` with a clear reason unless a fresh bound queue is present.
2. Add or adjust unit tests for created/unbound, created/stale, mismatched
   queue/workflow ids, and fresh bound running queue.
3. Delete the `runTaskQueueSequence` wrapper/export and update boundary tests to
   forbid the legacy name in production source/facades.
4. Run targeted workflowgraph/taskqueue/module-boundary tests, then standard
   typecheck/lint/build/Harness checks.

## Decisions

- Do not introduce a new `queue-starting` enum in this cleanup; use `wait` for
  created-but-unbound WorkflowRun to avoid expanding the evidence schema.
- Do not remove `rolePipeline` or `MainAgentLoopProjection` in this change; both
  still serve existing projections and must be retired separately.
- Do not implement recovery/replay in the same change; cleanup first avoids
  encoding stale semantics into a new layer.

## Minimality Gate Plan

- Can this be a no-op: no, existing observation can misclassify created
  WorkflowRun as running.
- Reuse: reuse `workflowgraph-observation.ts` and existing TaskQueue lifecycle
  ownership.
- Shared root fix: fix the classifier and public facade, not individual callers.
- Avoided: no new framework, state machine, UI projection, or action bridge.
- Smallest coherent change: one semantic correction plus one legacy wrapper
  removal.

## Module Boundary Plan

- Owner module: `src/main-agent-orchestration/` for observation and
  `runMainAgentTaskQueueLifecycle`.
- New / moved responsibilities: none.
- Facade touch points: remove `runTaskQueueSequence` from
  `workflow-runtime/code-workflow.ts`.
- Forbidden write-back locations: Workbench UI, confirmation queue, action
  registry, automation allowlist, scheduler runtime, apply/close.
- Compatibility surface: `runMainAgentTaskQueueLifecycle` remains the public
  production entrypoint.
- Boundary tests: update module-boundary tests to reject legacy wrapper export.
- Follow-up split candidates: WorkflowGraph recovery/replay foundation.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: WorkflowGraph observation,
  WorkflowRun recovery key checks, TaskQueue lifecycle owner.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new
  mechanism is proposed.
- Domain-specific logic location: WorkflowGraph state classification stays in
  `workflowgraph-observation.ts`.
- Shared cross-cutting logic location: TaskQueue execution stays in
  `runMainAgentTaskQueueLifecycle`.
- Local framework / state machine / projection / validation / gate avoided:
  replay owner deferred.
- Future-cost reduction for similar features: future replay sees one entrypoint
  and reliable observation semantics.

## Planning-Discovered Gaps

- Subagent review found `created` WorkflowRun is created before queue binding and
  should not imply active execution.
- Subagent review found `runTaskQueueSequence` is no longer used by production
  Workbench actions, but tests still protect it as a compatibility export.
