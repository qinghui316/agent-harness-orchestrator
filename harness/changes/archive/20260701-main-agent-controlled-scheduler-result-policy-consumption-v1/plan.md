# Plan: main-agent-controlled-scheduler-result-policy-consumption-v1

## Approach

Extend the existing replay/policy chain instead of creating a new Scheduler
layer. Replay remains the single read model consumed by policy. The controlled
Scheduler reader classifies the latest existing step evidence and attaches a
small summary plus evidence health/gaps to replay; policy uses only that summary
and existing current-state rules.

## Steps

1. Update active handoff/spec/plan/tasks to record scope and non-goals.
2. Inspect scheduler step schema/repository and replay/policy tests.
3. Add a read-only controlled Scheduler step health reader inside the
   main-agent replay owner or a narrow helper owned by it.
4. Extend `MainAgentWorkflowGraphReplaySummary` with bounded
   `controlledScheduler` metadata, refs, health, and gaps.
5. Update policy to react only to replay summary fields and unsafe gaps without
   adding action-like kinds.
6. Add targeted unit and boundary tests.
7. Update docs/status closeout only after implementation verification.

## Decisions

- Keep `controlledScheduler` in replay rather than `workflowgraph-decisions`.
  It is a replay input, not graph-level workflow evidence.
- Do not use projection-only scheduler readers as the only source because they
  collapse malformed/scope errors to null.
- Treat `recorded-with-warning` as degraded explanatory evidence, not normal
  ready.
- Do not consume controlled Scheduler evidence when canonical manager state
  already gives a stronger completed/blocked/running interpretation.

## Minimality Gate Plan

- Can this be a no-op: no; replay currently lacks controlled Scheduler step
  consumption and policy cannot observe controlled handoff results.
- Reuse: existing scheduler schemas/repository readers, replay summary, and
  policy gap handling.
- Shared root fix: fix the replay input gap rather than adding special cases to
  Workbench actions or UI.
- Avoided: no new gate, runner, executor, UI surface, action bridge, or
  Scheduler state machine.
- Smallest coherent change: one bounded replay summary extension plus tests.

## Module Boundary Plan

- Owner module: `src/main-agent-orchestration/workflowgraph-replay.ts` and
  `decision-policy.ts`.
- New / moved responsibilities: read-only classification and summarization of
  latest controlled Scheduler step evidence.
- Facade touch points: none.
- Forbidden write-back locations: scheduler runtime state, WorkflowRun,
  TaskQueue, TaskRun, AgentTask, SQLite, confirmation queue, Workbench UI.
- Compatibility surface: existing replay builder remains callable; absence of
  controlled Scheduler evidence preserves current output behavior.
- Boundary tests: no scheduler executor/action/UI/confirmation imports in
  replay/policy; no old raw scheduler or queue/code sequence entrypoints.
- Follow-up split candidates: none.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: replay summary, decision policy,
  scheduler controlled step schema/repository, canonical manager precedence.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no
  new framework is proposed; only a bounded health reader is needed because
  projection readers intentionally swallow malformed evidence.
- Domain-specific logic location: controlled Scheduler summary belongs to
  main-agent replay consumption.
- Shared cross-cutting logic location: evidence health/gap semantics remain in
  replay.
- Local framework / state machine / projection / validation / gate avoided: no
  new state machine or gate.
- Future-cost reduction for similar features: future parallel integration can
  consume one replay field instead of reading scheduler artifacts ad hoc.

## Planning-Discovered Gaps

None.
