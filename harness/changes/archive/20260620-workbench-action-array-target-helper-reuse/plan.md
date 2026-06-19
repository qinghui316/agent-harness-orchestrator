# Plan: Workbench Action Array Target Helper Reuse

## Approach

Make the smallest ownership-strengthening source change in the Workbench action target revalidation chain. Promote the private ordered string-array comparison from `boundary.ts` into the existing `active-target.ts` helper owner, then replace the three scheduler `worktreeIds` target checks with that helper.

## Steps

1. Add a pure fail-closed helper to `src/workbench/actions/active-target.ts` for exact ordered string-array target matching.
2. Import and use that helper in `src/workbench/actions/boundary.ts` for the three scheduler `worktreeIds` checks, preserving the current `request.worktreeIds?.length` guard and existing error text.
3. Remove the private `sameStringArray` helper from `boundary.ts`.
4. Extend `tests/unit/workbench-module-boundaries.test.ts` to cover helper pass/fail behavior and boundary ownership.
5. Run targeted validation, product checks required by the changed boundary, and Harness checks.

## Decisions

- Reuse `active-target.ts` because it already owns Workbench action target stale/scope/prepared revalidation helpers.
- Keep `workflow-actions/registry.ts` unchanged because it owns whole-action scope matching, not latest-evidence target comparison inside high-impact Workbench revalidation.
- Do not split `boundary.ts` further in this phase.

## Module Boundary Plan

- Owner module: `src/workbench/actions/active-target.ts` owns shared Workbench action target revalidation helpers.
- New / moved responsibilities: ordered array target matching moves from `boundary.ts` private helper into the owner helper module.
- Facade touch points: none.
- Forbidden write-back locations: Workbench frontend, server route modules, manager facades, scheduler-runtime repositories, workflow action registry, and product docs.
- Compatibility surface: Workbench action request/response shapes, action ids, error text, and runtime semantics remain unchanged.
- Boundary tests: `tests/unit/workbench-module-boundaries.test.ts`.
- Follow-up split candidates: broader `boundary.ts` scheduler revalidation extraction remains future work, not in scope.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: Workbench action target revalidation helper owner in `active-target.ts`.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new mechanism is proposed; a private helper is moved to the existing owner.
- Domain-specific logic location: action-specific scheduler checks stay in `boundary.ts`.
- Shared cross-cutting logic location: exact array target matching lives in `active-target.ts`.
- Local framework / state machine / projection / validation / gate avoided: avoids another feature-local target comparison helper in `boundary.ts`.
- Future-cost reduction for similar features: future Workbench actions can reuse the same helper instead of adding new private array equality checks.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

- Plan review subagent `019ee232-f79c-70e1-80d8-00e4310edf4a` returned PASS.
- The review noted a required constraint: helper calls may fail closed, but existing boundary checks must preserve the current behavior where missing `request.worktreeIds` does not trigger the check.
