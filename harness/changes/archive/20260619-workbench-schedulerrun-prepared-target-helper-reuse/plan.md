# Plan: Workbench SchedulerRun Prepared Target Helper Reuse

## Approach

Add the smallest shared assertion to the existing Workbench action target helper
module, then replace only identical SchedulerRun prepared-target guards in the
Workbench action boundary. Keep latest-target validation in the existing latest
helper and keep scheduler-domain artifact/lineage checks in the current branches.

## Steps

1. Extend `src/workbench/actions/active-target.ts` with a pure prepared-target
   assertion that checks id, change id, and `prepared` status and emits the
   existing stale/not-prepared wording.
2. Update `src/workbench/actions/boundary.ts` to call the helper only where the
   existing SchedulerRun check has the same three-field semantics.
3. Exclude `planning.scheduler.plan.prepare` and `planning.scheduler.run.complete`
   from the helper adoption because their semantics or errors differ.
4. Add focused boundary tests for the helper and owner-module constraints.
5. Run targeted Workbench/action tests, product checks, and Harness validation.

## Decisions

- Plan self-review: PASS from subagent
  `019ede37-33d4-7983-8a37-011ba1440829` before ECL creation/implementation.
- The helper will not read latest SchedulerRuns; latest checks remain in
  `assertLatestWorkbenchActionTarget`.
- This phase is convergence work, not a Scheduler/parallel runtime feature.

## Module Boundary Plan

- Owner module: `src/workbench/actions/active-target.ts`.
- New / moved responsibilities: shared pure prepared-target assertion for
  Workbench action targets.
- Facade touch points: none.
- Forbidden write-back locations: Workbench bridge/frontend glue, server routes,
  manager facades, scheduler runtime modules, ToolPolicyGate, and Goal Loop.
- Compatibility surface: public action ids, payload contracts, Workbench action
  behavior, and error wording for adopted checks must remain compatible.
- Boundary tests: extend `tests/unit/workbench-module-boundaries.test.ts`.
- Follow-up split candidates: none.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: Workbench action target helper
  owner and latest-target assertion.
- Why existing mechanisms are insufficient if a new mechanism is proposed: the
  existing owner has scope/latest helpers but no shared prepared-state assertion.
- Domain-specific logic location: scheduler artifact lineage, reservations,
  worker, validation, audit, rework, integration, and closeout checks stay in
  `src/workbench/actions/boundary.ts`.
- Shared cross-cutting logic location: `src/workbench/actions/active-target.ts`.
- Local framework / state machine / projection / validation / gate avoided:
  avoids repeated per-action stale/prepared mini gates.
- Future-cost reduction for similar features: future Workbench action branches
  can reuse one prepared-target assertion instead of copying three-field checks.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

None yet.
