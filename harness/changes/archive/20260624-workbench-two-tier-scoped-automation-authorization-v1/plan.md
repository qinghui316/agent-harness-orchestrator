# Plan: workbench-two-tier-scoped-automation-authorization-v1

## Approach

Add a small scoped automation runtime that loops over the existing Workbench
confirmation queue instead of inventing another planner. The first human
confirmation creates an automation authorization. Each child iteration rereads
the Workbench snapshot, verifies the current `confirmationQueue.primary` is an
allowed local workflow action, revalidates target ids through the same current
gate logic used by the server endpoint, dispatches the existing handler, records
iteration evidence, and repeats until a stop rule is hit.

## Steps

1. Add `planning.automation.scoped-auto.run` to workflow action contracts,
   live action sets, high-impact/action revalidation sets, payload typing, and
   Workbench handler registration.
2. Create `src/automation-runtime/` for authorization/run/iteration types,
   repository rendering, allowed-action policy, stop rules, and loop runner.
3. Extract reusable current-gate revalidation from the server route layer into
   an owner callable by both `src/server/workbench/action-revalidation.ts` and
   automation child execution.
4. Add the Workbench action handler in
   `src/workbench/actions/handlers/automation.ts`; it creates the top-level
   authorization and dispatches child actions with the existing handler map,
   required-target validation, high-impact audit, and ToolPolicyGate intact.
5. Add Workbench projection/UI support for the two-mode surface and scoped-auto
   action payload, keeping `confirmationQueue.primary` authoritative and hiding
   duplicate selected-demand gates while automation is running.
6. Add targeted runtime, action revalidation, read-model, and DOM tests.
7. Run required product and Harness verification, then update close/handoff
   docs and archive the change.

## Decisions

- New owner is `src/automation-runtime/`, not `src/goal-loop-runtime/`, because
  this is generic scoped automation over Workbench gates rather than only Goal
  Loop Scheduler continuation.
- V1 loops only over the current authoritative `confirmationQueue.primary`; it
  does not evaluate arbitrary next actions from Goal Loop packets or Workpad
  summaries.
- Codex full access is modeled as runtime capability evidence, not AHO
  workflow authorization.

## Module Boundary Plan

- Owner module: `src/automation-runtime/` owns automation authorization,
  run/iteration artifacts, allowed-action policy, loop stop rules, and
  iteration evidence.
- New / moved responsibilities: reusable current-gate revalidation moves out of
  server-only route glue into an owner callable by server and automation; action
  handler glue lives in `src/workbench/actions/handlers/automation.ts`;
  two-mode rendering lives in focused frontend/projection modules.
- Facade touch points: workflow action registry gets the new action id;
  Workbench handler index wires the handler; server action revalidation delegates
  to the shared guard; frontend shell passes a selected mode through the normal
  action path.
- Forbidden write-back locations: no main logic in `src/workbench/chat.ts`,
  `src/workbench/manager.ts`, `src/workbench/projections/read-model.ts`,
  `src/server/workbench-server.ts`, `src/web/src/App.tsx`,
  `src/workflow-runtime/code-workflow.ts`, `src/cli/program.ts`, or broad
  manager facades.
- Compatibility surface: existing action ids and confirmation queue shape remain
  compatible; the new action adds an optional surfaced automation mode and a new
  scoped workflow action payload.
- Boundary tests: runtime unit tests, action revalidation tests, Workbench
  read-model tests, and App DOM tests.
- Follow-up split candidates: none.
- If not applicable, reason: applicable.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: Workbench confirmation queue,
  workflow action registry, required target validation, strict scope matching,
  current-gate revalidation, ToolPolicyGate, Workbench handler map, thread
  workflow.started/completed/failed entries, and runtime artifact repositories.
- Why existing mechanisms are insufficient if a new mechanism is proposed:
  current mechanisms handle one confirmed step; V1 needs a durable scoped
  authorization/run/iteration owner that can repeat existing steps without
  converting UI state or Goal Loop evidence into authority.
- Domain-specific logic location: allowed-action policy and stop rules live in
  `src/automation-runtime/`; UI copy lives in Workbench projection/frontend
  modules.
- Shared cross-cutting logic location: target revalidation remains in the
  Workbench/action or workflow-action owner and is shared by server and
  automation child execution.
- Local framework / state machine / projection / validation / gate avoided:
  no parallel action registry, permission engine, projection system, workflow
  truth, or scheduler loop.
- Future-cost reduction for similar features: later scoped automation profiles
  can reuse the authorization/run/iteration owner and shared revalidation
  instead of adding feature-local loops.
- If not applicable, reason: applicable.

## Planning-Discovered Gaps

- Need identify the smallest UI location for the two-mode selector so it does
  not turn `App.tsx` into the UI owner.
- Need ensure child dispatch records audit scope linking each child step to the
  automation authorization/run without pretending each child step had a separate
  human click.
