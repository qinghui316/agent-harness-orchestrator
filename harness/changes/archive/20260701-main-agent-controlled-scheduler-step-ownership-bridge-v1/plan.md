# Plan: main-agent-controlled-scheduler-step-ownership-bridge-v1

## Approach

Create a narrow bridge module under `main-agent-orchestration`. The bridge owns
only the main-agent observation sandwich around the existing controlled
Scheduler step; it delegates the actual scheduler transition to the existing
runtime and returns the existing result shape. Workbench keeps the same action
type and confirmation path but calls the bridge instead of scheduler runtime.

## Steps

1. Add `controlled-scheduler-step-bridge.ts` with
   `runMainAgentControlledSchedulerStep(...)`.
2. Resolve project memory and active Change path before pre-observation.
3. Call `recordMainAgentWorkflowGraphObservationAndReplay(...)` before
   delegation; failure prevents execution.
4. Delegate once to `runControlledSchedulerLoopStep(...)` with the same services
   the Workbench handler currently provides.
5. After delegate success or failure, best-effort record post-observation
   without overwriting delegate result/error.
6. Change the Workbench scheduler handler to import/call the bridge.
7. Add bridge, handler, and module-boundary tests.

## Decisions

- `controlledSchedulerRoute` is not a blocking precondition in V1. Existing
  Workbench revalidation and controlled Scheduler guards remain the authority.
- The executable wrapper lives in a new bridge file, not in the existing
  non-executing route owner.
- Post-observation failures are warnings/internal evidence gaps only, not action
  failures.

## Minimality Gate Plan

- Can this be a no-op: no; Workbench still directly calls scheduler runtime for
  controlled advance.
- Reuse: existing owner/helper/mechanism considered: reuse
  `runControlledSchedulerLoopStep`,
  `recordMainAgentWorkflowGraphObservationAndReplay`, Workbench revalidation,
  and controlled-step dispatch.
- Shared root fix: move the direct call at the Workbench handler boundary rather
  than adding another observer beside it.
- Avoided: no new gate, action payload, route authority, or scheduler state
  machine.
- Smallest coherent change: one bridge module plus handler import/call and
  tests.

## Module Boundary Plan

- Owner module: `src/main-agent-orchestration/controlled-scheduler-step-bridge.ts`.
- New / moved responsibilities: the main-agent owner wraps controlled Scheduler
  advance observation and delegates execution to scheduler runtime.
- Facade touch points: `src/workbench/actions/handlers/scheduler.ts` keeps the
  same action handler surface.
- Forbidden write-back locations: confirmation queue, action registry,
  automation allowlist, UI, apply/close, remote/PR/merge, Harness evolution.
- Compatibility surface: returned action result and summaries remain unchanged.
- Boundary tests: production direct imports of scheduler runtime are allowed
  only from the new bridge and existing scheduler owners.
- Follow-up split candidates: controlled scheduler result/policy consumption and
  old seam retirement.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: controlled Scheduler runtime,
  controlled-step dispatch, WorkflowGraph observation/replay/recovery/route,
  Workbench revalidation, and high-impact audit.
- Why existing mechanisms are insufficient if a new mechanism is proposed: the
  new bridge is not a new scheduler mechanism; it is the ownership seam that
  removes direct Workbench-to-runtime coupling.
- Domain-specific logic location: scheduler transition logic remains in
  scheduler runtime / workflow-scheduler owners.
- Shared cross-cutting logic location: main-agent observation stays in
  WorkflowGraph observation/replay helper.
- Local framework / state machine / projection / validation / gate avoided: no
  new state machine, projection, validator, or gate.
- Future-cost reduction for similar features: future main-agent parallel work can
  hook into one bridge rather than Workbench handlers.

## Planning-Discovered Gaps

- Subagent review found no blocker, but required a separate executable bridge
  module and explicit pre/post observation failure semantics.
