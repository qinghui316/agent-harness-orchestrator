# Plan: workbench-scheduler-runtime-state-latest-target-helper-reuse

## Approach

Make a bounded Workbench action boundary edit: convert three runtime-state latest id comparisons to `assertLatestWorkbenchActionTarget`, using the existing `{ id: ... }` target shape already used by scheduler close-blocked. Keep cross-field lineage and stale checks as local domain-specific checks.

## Steps

1. Update `src/workbench/actions/boundary.ts` for the two `planning.scheduler.plan.prepare` latest id checks.
2. Update `src/workbench/actions/boundary.ts` for the `planning.scheduler.runtime.reserve-claims` latest SchedulerReconcileSnapshot id check.
3. Update `tests/unit/workbench-module-boundaries.test.ts` to assert helper adoption and removal of the old raw comparisons.
4. Run targeted product verification and Harness checks.
5. Perform independent close-ready review, update handoff docs, and close only if evidence is clean.

## Decisions

- Use existing `assertLatestWorkbenchActionTarget`; no new helper or runtime-state-specific validator.
- Keep `lastClaimReservationSnapshotId` checks outside the helper because they are lineage/stale semantics rather than a latest id target.
- Do not run full `npm run test` by default because this is a helper-only boundary substitution with no runtime semantic, payload, projection, UI, source/apply, validation/audit, IntegrationCheck, or release-risk behavior change.

## Module Boundary Plan

- Owner module: `src/workbench/actions/active-target.ts` owns shared Workbench action target helper vocabulary; `src/workbench/actions/boundary.ts` remains the action revalidation caller.
- New / moved responsibilities: no new responsibility; three latest-id checks move from local branches to shared helper use.
- Facade touch points: `src/workbench/actions/boundary.ts` only.
- Forbidden write-back locations: do not add scheduler-runtime, server, frontend, manager facade, IntegrationCheck, apply/discard, Goal Loop, or reference-project logic for this slice.
- Compatibility surface: keep public action contract, error text, and fail-closed behavior compatible.
- Boundary tests: `tests/unit/workbench-module-boundaries.test.ts`.
- Follow-up split candidates: none.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: `assertLatestWorkbenchActionTarget`.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new mechanism is proposed.
- Domain-specific logic location: runtime-state lineage/stale checks remain in `src/workbench/actions/boundary.ts` for this action boundary; scheduler-runtime owners remain unchanged.
- Shared cross-cutting logic location: latest-target action revalidation stays in `src/workbench/actions/active-target.ts`.
- Local framework / state machine / projection / validation / gate avoided: avoids three action-local latest id branches.
- Future-cost reduction for similar features: future Workbench action gates have one shared latest-target helper vocabulary for runtime-state selected ids as well as artifact records.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

None yet.
