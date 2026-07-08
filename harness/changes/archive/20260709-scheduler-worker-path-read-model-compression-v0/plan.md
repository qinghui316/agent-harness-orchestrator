# Plan: scheduler-worker-path-read-model-compression-v0

## Approach

Add a canonical read-only worker-path view in scheduler-runtime, then replace
private assembly in runtime, boundary, GoalLoop, closeout, and projection with
that view. Keep transition selection and dispatch authority in their existing
owners.

## Steps

1. Inspect all current worker-path assembly sites and identify the fields each
   caller needs.
2. Implement a canonical scheduler-runtime read model with adapters for current
   transition input and Workbench summaries.
3. Rewire covered callers to consume the read model and delete duplicate helper
   code.
4. Add unit tests for read-model states and boundary tests for forbidden private
   assembly/import drift.
5. Run targeted and required verification, then update summary/review and close.

## Decisions

- Stable relationship: Scheduler evidence repository -> scheduler-runtime
  worker-path read model -> workflow-actions transition contract ->
  workflow-runtime dispatch revalidation -> Workbench/GoalLoop/projection
  read-only consumers.
- The read model returns facts and evidence references; it does not choose the
  next Scheduler transition and does not dispatch leaf work.

## Minimality Gate Plan

- Can this be a no-op: no; repeated private worker-path assembly already exists
  across Scheduler runtime, Workbench, GoalLoop, and closeout.
- Reuse: strengthen scheduler-runtime worker-path helpers and workflow-actions
  current transition contract instead of introducing another policy module.
- Shared root fix: centralize evidence assembly once instead of patching each
  caller.
- Avoided: no new Scheduler state machine, action id, UI projection authority,
  or WorkflowGraphPlan branch.
- Smallest coherent change: read-model compression only.

## Module Boundary Plan

- Owner module: scheduler-runtime owns canonical Scheduler worker-path read
  model.
- New / moved responsibilities: evidence assembly, terminal/pending
  classification, approved-output refs, and adapter shapes move to the read
  model.
- Facade touch points: workflow-runtime Scheduler facade, Workbench boundary,
  GoalLoop compiler, closeout, Workbench projection.
- Forbidden write-back locations: Workbench/projection/GoalLoop/read model must
  not write runtime state or artifacts.
- Compatibility surface: public action ids, payloads, confirmation queue, and
  Workbench summaries remain compatible.
- Boundary tests: forbid private worker-path assembly helpers in covered
  modules and forbid read-model imports from UI/runtime owners.
- Follow-up split candidates: none.
- If not applicable, reason: TBD.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: scheduler-runtime repositories,
  worker-path domain helpers, and workflow-actions current transition contract.
- Why existing mechanisms are insufficient if a new mechanism is proposed:
  current helpers do not assemble full evidence paths with pending reasons and
  evidence refs for all consumers.
- Domain-specific logic location: Scheduler evidence interpretation stays in
  scheduler-runtime.
- Shared cross-cutting logic location: current-gate/transition matching remains
  in workflow-actions; dispatch authority remains in workflow-runtime.
- Local framework / state machine / projection / validation / gate avoided:
  read model is read-only and does not own transition selection or dispatch.
- Future-cost reduction for similar features: future Scheduler wave/graph work
  can reuse one worker-path fact model instead of updating five consumers.

## Planning-Discovered Gaps

None yet.

