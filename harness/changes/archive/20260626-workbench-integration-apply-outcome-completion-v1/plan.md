# Plan: workbench-integration-apply-outcome-completion-v1

## Approach

Start from existing owners and prove whether they already express the desired
state. The known owner chain is:

`applyIntegrationCheck -> IntegrationCheck(applied) -> scheduler outcome
reconcile -> scheduler run completion -> landing candidate / close / completed`.

Add fixture-backed tests that run a real deterministic integration apply patch,
then inspect the Workbench read model after each existing gate. Only patch
product code if those tests reveal a real projection or stale-gate gap.

## Steps

1. Update active Change spec/plan/tasks/review to record the post-apply outcome
   scope and non-goals.
2. Inspect existing integration apply, scheduler outcome, landing, and
   Workbench confirmation queue owners.
3. Strengthen the scheduler integration fixture so a unit test can perform a
   real `apply-check.apply` with a real patch and artifact hash.
4. Add targeted tests for apply -> outcome reconcile -> scheduler completion ->
   landing/close surface, including stale old-gate suppression.
5. If the test exposes a real product gap, fix the smallest owner responsible.
6. Run targeted suites, required project checks, Harness checks, and closeout.

## Decisions

- Use tests first because existing code appears to already have most of the
  intended state machine.
- Do not add a new post-apply framework; post-apply is an owner chain across
  existing integration-check, scheduler-runtime, landing, and Workbench
  projection modules.
- Real UI acceptance is required only if product-visible code changes are made
  or targeted evidence cannot prove the Workbench surface.

## Minimality Gate Plan

- Can this be a no-op: possibly for product code; verify with fixture-backed
  tests before changing runtime.
- Reuse: `applyIntegrationCheck`, `reconcileSchedulerIntegrationOutcome`,
  `completeSchedulerRunFromIntegrationOutcome`, landing candidates, Workbench
  confirmation queue, current-gate action routing.
- Shared root fix: inspect integration-check repository/apply-discard,
  scheduler outcome/completion, Workbench read-model confirmation queue, and
  landing candidate owners before adding any local guard.
- Avoided: new workflow runtime, projection system, permission system,
  post-apply evidence family, or feature-local state machine.
- Smallest coherent change: real deterministic fixture apply coverage plus only
  the minimal projection/owner fix if existing behavior fails.

## Module Boundary Plan

- Owner module: `src/integration-check`, `src/scheduler-runtime`,
  `src/landing`, and `src/workbench/projections/read-model`.
- New / moved responsibilities: none planned.
- Facade touch points: none planned beyond existing action execution paths.
- Forbidden write-back locations: no new post-apply branch in a broad facade if
  a focused owner already expresses the state.
- Compatibility surface: Workbench action ids and IntegrationCheck artifact
  shapes remain compatible.
- Boundary tests: targeted Workbench read-model and integration apply/discard
  tests.
- Follow-up split candidates: none.
- If not applicable, reason: TBD.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: integration apply/discard guards,
  same-Change scheduler outcome, scheduler completion, landing candidate, and
  authoritative confirmation queue projection.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no
  new mechanism is proposed.
- Domain-specific logic location: integration apply outcome remains in
  integration-check and scheduler-runtime owners.
- Shared cross-cutting logic location: stale/source/artifact guards stay in
  existing apply/revalidation owners.
- Local framework / state machine / projection / validation / gate avoided:
  avoided all new local frameworks; this is an existing-gate alignment change.
- Future-cost reduction for similar features: stronger fixture coverage makes
  future integration apply/discard changes prove actual patch/hash behavior.

## Planning-Discovered Gaps

None yet.

