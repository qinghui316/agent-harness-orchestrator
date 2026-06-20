# Plan: workbench-scheduler-integration-outcome-handoff-target-helper-reuse

## Approach

Make the smallest Workbench action boundary edit: replace the local latest SchedulerIntegrationCheckHandoff comparison with `assertLatestWorkbenchActionTarget` while preserving the existing error text and all surrounding scope checks. Update the module-boundary test so future agents can see this path belongs to the shared active-target helper vocabulary.

## Steps

1. Update `src/workbench/actions/boundary.ts` for the integration outcome handoff latest-target check.
2. Update `tests/unit/workbench-module-boundaries.test.ts` to assert helper adoption for the integration outcome handoff path.
3. Run targeted product verification and Harness checks.
4. Perform independent close-ready review, update handoff docs, and close only if evidence is clean.

## Decisions

- Keep the slice at Workbench action boundary level; `src/scheduler-runtime/integration-outcome.ts` keeps its domain-owned runtime guard.
- Do not run full `npm run test` by default because this is a single helper substitution with no runtime semantic, payload, projection, UI, source/apply, validation/audit, or IntegrationCheck behavior change.

## Module Boundary Plan

- Owner module: `src/workbench/actions/active-target.ts` owns shared Workbench action target helper vocabulary; `src/workbench/actions/boundary.ts` remains the action revalidation caller.
- New / moved responsibilities: no new responsibility; one existing latest-target check moves from a local branch to the shared helper.
- Facade touch points: `src/workbench/actions/boundary.ts` only.
- Forbidden write-back locations: do not add scheduler-runtime, server, frontend, manager facade, IntegrationCheck, apply/discard, or Goal Loop logic for this slice.
- Compatibility surface: keep public action contract, error text, and fail-closed behavior compatible.
- Boundary tests: `tests/unit/workbench-module-boundaries.test.ts`.
- Follow-up split candidates: none.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: `assertLatestWorkbenchActionTarget`.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new mechanism is proposed.
- Domain-specific logic location: scheduler outcome domain checks remain in `src/scheduler-runtime/integration-outcome.ts`.
- Shared cross-cutting logic location: Workbench action target revalidation stays in `src/workbench/actions/active-target.ts`.
- Local framework / state machine / projection / validation / gate avoided: avoids another action-local latest-target branch.
- Future-cost reduction for similar features: future Workbench action gates can reuse one helper vocabulary for latest-target stale revalidation.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

None yet.
