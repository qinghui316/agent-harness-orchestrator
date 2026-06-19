# Plan: Workbench Scheduler Planning Latest Target Helper Adoption

## Approach

Apply the existing pure latest-target assertion to the remaining scheduler
planning-chain checks that have the exact same id comparison and error wording.
Do not introduce new state, new helpers, new actions, or broader scheduler
behavior.

## Steps

1. Replace manual latest checks in `planning.scheduler.worker-plan.compile` for
   `SchedulerDispatchDryRun` and `SchedulerContract`.
2. Replace manual latest checks in `planning.scheduler.launch-preflight.check`
   for `SchedulerClaimReconcilePlan`, `SchedulerWorkerSessionPlan`,
   `SchedulerDispatchDryRun`, and `SchedulerContract`.
3. Replace manual latest checks in `planning.scheduler.run.prepare` for
   `SchedulerLaunchPreflight`, `SchedulerClaimReconcilePlan`,
   `SchedulerWorkerSessionPlan`, `SchedulerDispatchDryRun`, and
   `SchedulerContract`.
4. Add focused boundary assertions in
   `tests/unit/workbench-module-boundaries.test.ts`.
5. Run targeted tests plus product and Harness verification.

## Decisions

- Plan self-review: PASS from subagent
  `019ede48-44c3-7120-b5e2-5560bb7fc643`; no required fixes.
- Do not touch `planning.scheduler.plan.prepare` runtime-state snapshot /
  reservation comparisons.
- Do not touch `planning.scheduler.run.complete` in this slice.
- Reference project source is not required for this local owner-module reuse.

## Module Boundary Plan

- Owner module: `src/workbench/actions/active-target.ts`.
- New / moved responsibilities: no new responsibility; adopt the existing
  latest-target assertion in more identical call sites.
- Facade touch points: `src/workbench/actions/boundary.ts` keeps action dispatch
  and domain-specific stale/lineage/status checks.
- Forbidden write-back locations: Workbench bridge/frontend glue, server routes,
  manager facades, scheduler runtime modules, ToolPolicyGate, Goal Loop, and
  reference projects.
- Compatibility surface: public action ids, payload contracts, error wording for
  adopted latest checks, Workbench behavior, and scheduler behavior remain
  compatible.
- Boundary tests: extend `tests/unit/workbench-module-boundaries.test.ts`.
- Follow-up split candidates: none.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened:
  `assertLatestWorkbenchActionTarget`.
- Why existing mechanisms are insufficient if a new mechanism is proposed: not
  applicable; no new mechanism is proposed.
- Domain-specific logic location: scheduler stale, lineage, and status checks
  remain in `src/workbench/actions/boundary.ts`.
- Shared cross-cutting logic location: latest-target vocabulary remains in
  `src/workbench/actions/active-target.ts`.
- Local framework / state machine / projection / validation / gate avoided:
  avoids repeated per-action latest-target mini checks.
- Future-cost reduction for similar features: future Workbench action branches
  can use one consistent helper for latest target checks.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

None yet.
