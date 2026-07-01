# Plan: main-agent-controlled-scheduler-state-backflow-v1a

## Approach

Keep the change narrow. First fix the controlled-step replay gap by ensuring
wrong-scope evidence creates an unsafe issue. Then add a read-only state
backflow helper under `src/main-agent-orchestration/` that reads only existing
Scheduler repository/projection APIs for the latest same-Change SchedulerRun
and SchedulerRuntimeState. Wire its bounded summary into WorkflowGraph replay
and the replay consumption helper without creating any execution path.

## Steps

1. Update controlled Scheduler step replay so unscoped/wrong-run evidence
   discovered during expected-run lookup contributes a `stale` or
   `scope-mismatch` issue to gaps.
2. Add `controlled-scheduler-state-backflow.ts` as a read-only main-agent
   owner. It may read latest same-Change SchedulerRun/runtime state/events and
   reuse the controlled-step replay summary. It must not write or execute.
3. Extend WorkflowGraph replay summary and
   `recordMainAgentWorkflowGraphObservationAndReplay(...)` to carry the new
   backflow summary.
4. Update policy only if needed to treat unsafe backflow gaps as
   `inspect-evidence-gap`; do not add action-like policy kinds.
5. Add regression, summary, policy, and module-boundary tests.
6. Run targeted suites, aggregate checks, Harness checks, update review, close.

## Decisions

- V1a stops at latest same-Change SchedulerRun/runtime state. WorkerLease,
  worker result/validation/audit/rework, and IntegrationCheck deep backflow
  are deferred.
- The new helper is an in-memory projection, not a durable evidence family.
- Existing Scheduler owners remain canonical and executable owners.

## Minimality Gate Plan

- Can this be a no-op: no; a real gap classification bug exists and future
  parallel integration needs a bounded observation input.
- Reuse: reuse `controlled-scheduler-step-replay`, Scheduler repository
  readers, replay summary, and decision policy.
- Shared root fix: fix the controlled-step replay health merge, not each policy
  consumer.
- Avoided: no Scheduler execution wrapper, gate, action payload, UI surface, or
  worker graph framework.
- Smallest coherent change: gap fix plus latest SchedulerRun/runtime state
  summary only.

## Module Boundary Plan

- Owner module: `src/main-agent-orchestration/`.
- New / moved responsibilities: new read-only state backflow helper; no moved
  execution responsibilities.
- Facade touch points: WorkflowGraph replay and replay consumption helper.
- Forbidden write-back locations: SchedulerRun, SchedulerRuntime, WorkerLease,
  TaskRun, IntegrationCheck, SQLite, confirmationQueue, source root, Workbench
  actions.
- Compatibility surface: replay summary gains optional bounded state data; no
  existing behavior should change when evidence is absent.
- Boundary tests: static import/call checks for no executor/action/UI imports.
- Follow-up split candidates: worker path backflow V1b; IntegrationCheck
  terminal backflow V1c.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: controlled-step replay,
  WorkflowGraph replay, Scheduler repository/projection readers.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no
  existing main-agent reader summarizes SchedulerRun/runtime posture without
  invoking Scheduler owners.
- Domain-specific logic location: main-agent orchestration replay.
- Shared cross-cutting logic location: none added.
- Local framework / state machine / projection / validation / gate avoided: no
  new durable state machine, gate, or action validation framework.
- Future-cost reduction for similar features: later worker/IntegrationCheck
  backflow can extend a bounded read-only summary instead of reading raw
  Scheduler evidence in policy.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

- Subagent review required scope shrink: V1a must not implement full worker
  graph or IntegrationCheck deep backflow.

