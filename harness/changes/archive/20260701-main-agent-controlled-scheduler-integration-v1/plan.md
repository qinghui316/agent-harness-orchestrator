# Plan: main-agent-controlled-scheduler-integration-v1

## Approach

Strengthen the existing non-executing candidate path instead of adding a new
gate. WorkflowGraph observation will carry the existing readiness action
metadata, the candidate assessment will require that metadata, and a narrow
main-agent helper will describe whether the existing controlled Scheduler path
is the only legal future route.

## Steps

1. Extend WorkflowGraph observation/read schema with readiness
   `nextAllowedAction` and `schedulerEligible`, using nullable values so old
   evidence can be read and classified fail-closed.
2. Update Scheduler candidate assessment and tests to require status,
   next-action, eligibility, freshness, and scope agreement.
3. Add a non-executing controlled Scheduler route helper under
   `src/main-agent-orchestration`.
4. Export the helper/types from the main-agent orchestration barrel.
5. Add module-boundary tests proving no Scheduler runtime/action execution
   imports or payloads.
6. Update current roadmap/handoff docs.
7. Run targeted and aggregate verification.

## Decisions

- Do not add a `parallel gate assessment`; the existing Goal Loop /
  controlled Scheduler gate owns current-gate and human-confirmation checks.
- Do not route Scheduler through `assessMainAgentActionBridge`; Scheduler uses
  existing Workbench action boundary and controlled Scheduler owners.
- Treat missing readiness action fields as old-schema or insufficient evidence,
  never as a positive candidate.

## Minimality Gate Plan

- Can this be a no-op: no; current candidate signal lacks the readiness action
  fields needed before controlled Scheduler integration.
- Reuse: WorkflowGraph observation, candidate assessment, controlled
  Scheduler wrapper, and module-boundary tests.
- Shared root fix: make the candidate signal stricter in one owner instead of
  patching future callers.
- Avoided: new Scheduler gate, action bridge integration, automation allowlist
  changes, raw Scheduler dispatch, UI.
- Smallest coherent change: observation fields, stricter candidate
  classification, one non-executing route helper, tests, and docs.

## Module Boundary Plan

- Owner module: `src/main-agent-orchestration/controlled-scheduler-integration.ts`.
- New / moved responsibilities: explain whether the existing controlled
  Scheduler path is observable for a candidate signal.
- Facade touch points: main-agent orchestration barrel exports.
- Forbidden write-back locations: SchedulerRun, WorkerLease, IntegrationCheck,
  WorkflowRun, TaskQueue, TaskRun, SQLite, Workbench action handlers,
  confirmation queue, automation allowlist, source apply/close.
- Compatibility surface: existing helper callers can ignore the stricter
  candidate fields and the new route helper.
- Boundary tests: source assertions in `workbench-module-boundaries.test.ts`.
- Follow-up split candidates: actual parallel integration through controlled
  Scheduler owners.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: DecompositionReadinessManifest
  fields, WorkflowGraph observation, candidate assessment, controlled
  Scheduler wrapper boundary, module-boundary tests.
- Why existing mechanisms are insufficient: candidate assessment currently
  sees readiness status but not next action / eligibility, so it is too weak
  for the next integration phase.
- Domain-specific logic location: main-agent orchestration.
- Shared cross-cutting logic location: Scheduler execution and current-gate
  authority stays in existing Scheduler/Workbench owners.
- Local framework avoided: no new gate, no new persisted artifact family, no
  new Scheduler state machine.
- Future-cost reduction: parallel integration can consume one strict signal and
  one route explanation without probing readiness artifacts directly.

## Planning-Discovered Gaps

- Subagent review rejected a separate `parallel gate assessment` because it
  would duplicate Goal Loop preflight, controlled transition, and Workbench
  action boundary responsibilities.
- `schedulerEligible` is not enough by itself; candidate agreement must use the
  existing Scheduler owner condition of `status + nextAllowedAction`.
