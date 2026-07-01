# Plan: main-agent-scheduler-candidate-assessment-v1

## Approach

Add a narrow main-agent assessment owner that consumes existing observation,
replay, and recovery summaries. It will classify only evidence completeness and
candidate signals. It will not read or write Scheduler runtime state directly.

## Steps

1. Implement `scheduler-candidate-assessment.ts` as a pure read-only owner.
2. Extend `recordMainAgentWorkflowGraphObservationAndReplay(...)` to return the
   assessment after recovery summary derivation.
3. Export the assessment types/builders from `src/main-agent-orchestration`.
4. Add focused unit tests for candidate, sequential, blocked, stale, and
   forbidden-payload cases.
5. Add module-boundary tests for import/call prohibitions.
6. Update current roadmap/handoff docs.
7. Run targeted and aggregate verification.

## Decisions

- Use `candidate-signal-observed`, not `candidate-ready`, to avoid implying an
  executable Scheduler gate.
- Use the existing observation/replay helper return shape rather than adding a
  new public facade.
- Do not import from `workflow-scheduler` in V1; the assessment consumes
  already-loaded readiness/graph/recovery signals.

## Minimality Gate Plan

- Can this be a no-op: no; the next migration step needs a stable candidate
  signal boundary before parallel integration.
- Reuse: `recordMainAgentWorkflowGraphObservationAndReplay(...)`,
  WorkflowGraph observation, replay summary, and recovery summary.
- Shared root fix: centralize candidate classification in one main-agent owner
  instead of scattering checks in handlers.
- Avoided: Scheduler runtime facade, Workbench UI, action bridge, and new
  persisted artifact family.
- Smallest coherent change: pure assessment plus helper return field and tests.

## Module Boundary Plan

- Owner module: `src/main-agent-orchestration/scheduler-candidate-assessment.ts`.
- New / moved responsibilities: classify read-only Scheduler candidate signals
  from existing main-agent observation evidence.
- Facade touch points: `src/main-agent-orchestration/index.ts` export and
  `workflowgraph-replay-consumption.ts` return field.
- Forbidden write-back locations: `workflow-scheduler`, `scheduler-runtime`,
  Workbench actions, confirmation queue, automation, workflow runtime,
  apply/close, terminal.
- Compatibility surface: existing helper callers continue to work; they may
  ignore the new return field.
- Boundary tests: source assertions in `workbench-module-boundaries.test.ts`.
- Follow-up split candidates: none.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: WorkflowGraph observation,
  replay summary, recovery summary, module-boundary tests.
- Why existing mechanisms are insufficient: replay/recovery explain current
  state and completeness but intentionally do not classify Scheduler candidate
  signals.
- Domain-specific logic location: candidate classification belongs in
  main-agent orchestration.
- Shared cross-cutting logic location: stale/scope/gap handling stays in
  replay/recovery summaries.
- Local framework avoided: no new scheduler state machine, no new artifact
  protocol, no UI projection.
- Future-cost reduction: parallel integration can consume a single bounded
  signal instead of reading scattered evidence directly.

## Planning-Discovered Gaps

- Subagent review warned that `candidate-observable` and `wait` were too close
  to executable wording; use `candidate-signal-observed` and
  `wait-for-evidence`.
- `docs/CURRENT-DEVELOPMENT-PLAN.md` must clarify that recovery summary is not
  scheduler authority, while candidate assessment may consume it read-only.
