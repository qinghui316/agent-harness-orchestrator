# Plan: main-agent-workflowgraph-replay-summary-builder-v1

## Approach

Add one read-only summary builder under `src/main-agent-orchestration/`.
The builder should reuse existing WorkflowGraph observation, TaskQueue,
WorkflowRun, TaskRun, AgentTask, and loop-evidence readers. It should not create
a new state machine or recovery runtime.

## Steps

1. Inspect existing manager/readers for WorkflowGraph observation, TaskQueue,
   WorkflowRun, TaskRun, AgentTask, loop evidence, queue evidence, and next-step
   evidence.
2. Add `workflowgraph-replay.ts` with types and
   `buildMainAgentWorkflowGraphReplaySummary(...)`.
3. Prefer canonical manager state for `currentState`; use jsonl evidence only
   for `latestHistoricalEvidence`.
4. Add evidence health/gap reporting, including malformed or old-schema jsonl.
5. Export the builder from `src/main-agent-orchestration/index.ts`.
6. Add replay and boundary tests.
7. Fix `docs/STATUS.md` closeout drift for the deleted
   `runTaskQueueSequence` wrapper.

## Decisions

- The public API is a builder returning an in-memory summary, not a writer.
- `nextObservation` is descriptive only and cannot carry action ids or payloads.
- Role loop discovery is Change-scoped; fallback scanning must filter by
  `changeId`.
- `rolePipeline`, `MainAgentLoopProjection`, and `role.pipeline.*` remain.

## Minimality Gate Plan

- Can this be a no-op: no; future decision policy currently lacks one stable
  observation input.
- Reuse: existing WorkflowGraph observation, queue evidence, loop evidence, and
  manager readers are reused.
- Shared root fix: the change centralizes replay observation instead of adding
  direct readers to future decision policy.
- Avoided: no recovery runtime, no UI, no action bridge expansion, no scheduler
  integration.
- Smallest coherent change: one read-only builder plus tests and handoff drift
  fix.

## Module Boundary Plan

- Owner module: `src/main-agent-orchestration/workflowgraph-replay.ts`.
- New / moved responsibilities: aggregate current state and historical evidence
  into a read-only summary.
- Facade touch points: export through `src/main-agent-orchestration/index.ts`.
- Forbidden write-back locations: Harness artifacts, SQLite, WorkflowRun,
  TaskQueueRun, TaskRun, AgentTask, Workbench actions, terminal sessions.
- Compatibility surface: no existing runtime names removed in this change.
- Boundary tests: assert no forbidden imports and no old TaskQueue wrapper
  revival.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: WorkflowGraph observation reader,
  TaskQueue / WorkflowRun / TaskRun / AgentTask managers, loop and queue jsonl
  evidence paths.
- Why existing mechanisms are insufficient: they expose separate slices; the
  future decision policy needs one bounded replay input.
- Domain-specific logic location: main-agent orchestration replay owner.
- Shared cross-cutting logic location: existing managers remain canonical state
  owners.
- Local framework / state machine / projection / validation / gate avoided:
  replay summary has no lifecycle transition or executable gate.
- Future-cost reduction for similar features: future Decision Policy V2 can read
  one summary rather than duplicating evidence aggregation.

## Planning-Discovered Gaps

- Current `docs/STATUS.md` still describes the previous wrapper state; fix in
  this change.
- Existing evidence readers may swallow malformed jsonl; replay builder must
  surface those conditions as gaps.
