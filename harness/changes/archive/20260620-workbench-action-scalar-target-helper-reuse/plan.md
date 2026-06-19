# Plan: Workbench Action Scalar Target Helper Reuse

## Plan

1. Add `assertWorkbenchActionOptionalStringTarget` to `src/workbench/actions/active-target.ts`.
2. Replace only the seven in-scope optional scalar `target scope mismatch` checks in `src/workbench/actions/boundary.ts`.
3. Extend `tests/unit/workbench-module-boundaries.test.ts` for helper pass/fail/no-op behavior and boundary ownership assertions.
4. Run targeted verification and Harness checks.
5. Record independent close-ready review, update handoff, close, and commit when clean.

## In-Scope Boundary Calls

- `planning.scheduler.integration-outcome.reconcile`: `schedulerIntegrationCandidateId`, `applyCheckId`.
- `planning.scheduler.run.complete`: `schedulerReconcileSnapshotId`, `schedulerClaimReservationId`, `schedulerIntegrationCandidateId`, `schedulerIntegrationCheckHandoffId`, `applyCheckId`.

## Module Boundary Plan

- Owner module: `src/workbench/actions/active-target.ts` owns shared Workbench action target revalidation helpers.
- Retained responsibilities: `src/workbench/actions/boundary.ts` retains action-specific evidence reads, latest-artifact checks, and high-impact target orchestration.
- Forbidden write-back locations: Workbench UI/frontend/server glue, `workflow-actions/registry.ts`, scheduler runtime modules, manager facades, Goal Loop modules, ToolPolicyGate modules, and package scripts.
- Compatibility surface: action ids, payload shapes, error strings, missing-request behavior, ToolPolicyGate path, human gates, scheduler runtime facts, and IntegrationCheck behavior remain unchanged.

## Core Mechanism Reuse Plan

- Existing mechanism strengthened: Workbench action target revalidation helper owner.
- New cross-cutting mechanism: none beyond one small helper in the existing owner.
- Domain-specific logic location: scheduler integration/complete evidence reads remain in `boundary.ts`.
- Shared cross-cutting logic location: optional scalar target-id matching lives in `active-target.ts`.
- Local framework avoided: repeated local `if (request.<id> && request.<id> !== target) throw ... target scope mismatch` checks in the in-scope integration/complete chain.
- Future-cost reduction: future Workbench action target checks can reuse one helper and keep error text consistent.

## Verification Plan

- `npx vitest run tests/unit/workbench-module-boundaries.test.ts`
- `npx eslint src/workbench/actions/active-target.ts src/workbench/actions/boundary.ts tests/unit/workbench-module-boundaries.test.ts`
- `npm run typecheck`
- `npm run lint`
- Harness checks: `lint-encoding.ps1`, `lint-ecl.ps1`, `harness-change.ps1 reindex/status`, `harness-evolve.ps1 check`

Full `npm run test`, full `npm run test:workbench`, slow Workbench suites, and build are not planned unless implementation expands beyond behavior-preserving helper reuse.

## Plan Review

Subagent `019ee23f-eac4-7fb2-9c47-eaf9d41dfe9b` returned PASS. It confirmed the owner, scope, no pending evolution, reference-source non-need, and targeted verification plan. It warned to preserve missing/empty request no-op behavior and exact target-name error text.
