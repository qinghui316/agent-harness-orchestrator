# Plan: main-agent-controlled-scheduler-worker-runtime-backflow-v1b

## Approach

Keep V1b as a narrow read-only extension of V1a. Add a worker backflow helper
that reads only existing WorkerLease and SchedulerRuntime worker repository
APIs. Attach the bounded summary to `controlledSchedulerStateBackflow` and let
the existing replay/policy unsafe-gap path handle failures. Do not create any
new execution, gate, action, or UI path.

## Steps

1. Add `controlled-scheduler-worker-backflow.ts` under
   `src/main-agent-orchestration/`.
2. Read and summarize same-Change / same-SchedulerRun WorkerLease and worker
   start/result/validation/audit/rework posture using existing repository
   readers.
3. Attach the worker summary as
   `MainAgentControlledSchedulerStateBackflowSummary.workerBackflow`.
4. Ensure worker backflow health/gaps flow into replay evidence health and
   existing policy `inspect-evidence-gap` behavior.
5. Add targeted worker backflow, replay/policy, and module-boundary tests.
6. Run verification, update review/summary/handoff, close.

## Decisions

- IntegrationCheck is not part of V1b. It is V1c.
- Worker backflow is a child summary of the existing state backflow owner, not
  a new policy/action/gate owner.
- Missing worker evidence is allowed as incomplete posture. Malformed,
  old-schema, stale, or scope-mismatch evidence is unsafe.
- Existing SchedulerRuntime and IntegrationCheck owners remain canonical and
  executable owners.

## Minimality Gate Plan

- Can this be a no-op: no; main-agent replay cannot yet observe worker-level
  Scheduler posture.
- Reuse: use existing WorkerLease and SchedulerRuntime repository readers,
  V1a state backflow, replay summary, and decision-policy gap handling.
- Shared root fix: add one bounded worker backflow reader instead of ad hoc
  worker evidence reads inside policy.
- Avoided: no Scheduler executor, no IntegrationCheck reader/executor, no gate,
  no action payload, no UI, no durable evidence family.
- Smallest coherent change: worker/rework posture only; IntegrationCheck
  deferred.

## Module Boundary Plan

- Owner module: `src/main-agent-orchestration/`.
- New / moved responsibilities: new read-only worker posture summary; no moved
  execution responsibilities.
- Facade touch points: `controlled-scheduler-state-backflow.ts` and
  WorkflowGraph replay.
- Forbidden write-back locations: SchedulerRun, SchedulerRuntime, WorkerLease,
  TaskRun, IntegrationCheck, SQLite, confirmationQueue, source root, Workbench
  actions.
- Compatibility surface: V1a summary gains optional bounded worker data; no
  existing behavior should change when worker evidence is absent.
- Boundary tests: static import/call checks for no executor/action/UI imports.
- Follow-up split candidates: IntegrationCheck terminal backflow V1c.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: WorkerLease repository,
  SchedulerRuntime worker repository readers, controlled Scheduler state
  backflow, WorkflowGraph replay, decision-policy unsafe gaps.
- Why existing mechanisms are insufficient if a new mechanism is proposed:
  no existing main-agent reader summarizes worker-level Scheduler posture.
- Domain-specific logic location: main-agent orchestration backflow.
- Shared cross-cutting logic location: none added.
- Local framework / state machine / projection / validation / gate avoided:
  no new durable state machine, gate, action validation framework, or UI.
- Future-cost reduction for similar features: V1c can add IntegrationCheck
  terminal backflow as a separate sibling summary without reading raw worker
  evidence in policy.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

- Subagent review required scope shrink: IntegrationCheck terminal backflow is
  hard-deferred to V1c.
