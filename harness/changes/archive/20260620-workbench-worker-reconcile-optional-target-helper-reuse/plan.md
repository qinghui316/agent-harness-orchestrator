# Plan: Workbench Worker Reconcile Optional Target Helper Reuse

## Approach

Adopt the existing `assertWorkbenchActionOptionalStringTarget` helper in one repeated Workbench scheduler worker boundary section. Keep the implementation behavior-preserving by replacing only direct `request.field && request.field !== latest.field` checks where the latest value is a required string on `workerStart`.

## Steps

1. Replace the seven scalar scope checks in `planning.scheduler.worker.reconcile-result` with `assertWorkbenchActionOptionalStringTarget` calls.
2. Leave the `schedulerWorkerResultId` existing-result check unchanged because its latest target may be absent.
3. Extend the Workbench module boundary test to assert reconcile-result uses the helper for the selected fields.
4. Run targeted verification: Workbench module boundary test, typecheck, and Harness checks.

## Decisions

- The plan review rejected adding a new helper because the existing helper already has the exact optional-string scope mismatch behavior.
- The change intentionally covers only one contiguous scheduler worker path as a sample convergence step.

## Module Boundary Plan

- Owner module: existing `src/workbench/actions/active-target.ts` helper owner.
- New / moved responsibilities: no new owner; repeated boundary comparisons move to helper calls.
- Facade touch points: none.
- Forbidden write-back locations: Workbench UI, server bridge, Scheduler runtime managers, reference projects, and `README.md`.
- Compatibility surface: existing action ids, payload fields, and helper export; mismatch text standardizes to the existing helper wording.
- Boundary tests: `tests/unit/workbench-module-boundaries.test.ts` asserts helper behavior and boundary helper usage.
- Follow-up split candidates: none.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: `assertWorkbenchActionOptionalStringTarget`.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new mechanism is proposed.
- Domain-specific logic location: `src/workbench/actions/boundary.ts` keeps action-specific target names and source fields.
- Shared cross-cutting logic location: `src/workbench/actions/active-target.ts`.
- Local framework / state machine / projection / validation / gate avoided: avoids another hand-written cluster of scalar scope guards.
- Future-cost reduction for similar features: establishes the same helper-adoption pattern for later worker validate/audit/rework convergence.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

- `schedulerWorkerResultId` has optional-latest semantics and should not be folded into the helper without a separate reviewed contract.

