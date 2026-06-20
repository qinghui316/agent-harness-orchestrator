# Plan: workbench-scheduler-claim-reservation-snapshot-guard-reuse

## Approach

Strengthen the existing scheduler-runtime guard owner, then replace only fully equivalent Workbench boundary checks. The change stays narrow: it centralizes the repeated latest claim-reservation + reconcile-snapshot relationship and leaves branch-specific status, request target, worker/candidate/handoff/outcome, and ToolPolicy/human-gate checks in place.

## Steps

1. Add a scheduler-runtime guard that accepts a claim reservation, runtime-state latest ids, the current reconcile snapshot id, a context label, and optional required reservation status.
2. Replace repeated Workbench action boundary checks that already read `snapshot` and `reservation` and compare `reservation.schedulerReconcileSnapshotId` / `runtimeState.lastClaimReservationSnapshotId` against that snapshot.
3. Keep `planning.scheduler.plan.prepare` request-id/latest-target checks intact; use the shared guard only where it preserves the same semantics.
4. Update targeted boundary tests with direct guard behavior checks and reuse/anti-regression assertions.
5. Run targeted verification, update review/summary, perform close-ready review, and close/archive if clean.

## Decisions

- The shared owner is `src/scheduler-runtime/guards.ts`; Workbench boundary calls into it instead of owning scheduler-runtime lineage rules.
- No new Workbench helper module is introduced because that would keep a scheduler-runtime safety rule in the glue layer.
- The guard will preserve the existing error style for latest reservation failures and use the context label for status failures.

## Module Boundary Plan

- Owner module: `src/scheduler-runtime/guards.ts`.
- New / moved responsibilities: shared scheduler runtime latest claim-reservation + reconcile-snapshot guard.
- Facade touch points: `src/workbench/actions/boundary.ts` imports and calls the scheduler-runtime guard; no manager facade receives new logic.
- Forbidden write-back locations: do not add scheduler runtime safety rules to Workbench glue, server routes, frontend, CLI command modules, or broad manager facades.
- Compatibility surface: Workbench workflow action ids, request payloads, branch-specific stale checks, and public APIs remain unchanged.
- Boundary tests: `tests/unit/workbench-module-boundaries.test.ts` direct guard and source-boundary assertions.
- Follow-up split candidates: none.
- If not applicable, reason: not applicable; module-boundary coverage is applicable.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: scheduler-runtime guard owner and existing Workbench action target helper pattern.
- Why existing mechanisms are insufficient if a new mechanism is proposed: existing `assertLatestSchedulerRuntimeClaimReservation` does not explicitly assert that the runtime state's latest claim-reservation snapshot matches the concrete latest reconcile snapshot being used by Workbench action branches, so a narrower extension is needed.
- Domain-specific logic location: branch-specific worker, integration candidate, integration handoff, outcome, and status checks remain in their existing action/runtime branches.
- Shared cross-cutting logic location: scheduler runtime claim-reservation lineage and latest snapshot safety lives in `src/scheduler-runtime/guards.ts`.
- Local framework / state machine / projection / validation / gate avoided: avoids a Workbench-local scheduler reservation validator and avoids repeated branch-specific stale-target mini-rules.
- Future-cost reduction for similar features: future scheduler action branches can call one audited guard for the reservation/snapshot invariant instead of rewriting compound comparisons.
- If not applicable, reason: not applicable; core mechanism reuse coverage is applicable.

## Planning-Discovered Gaps

- Subagent plan review approved the scope and required that the new guard keep strong semantics, preserve request-target/status checks, include direct tests, and document full-test skip rationale.
