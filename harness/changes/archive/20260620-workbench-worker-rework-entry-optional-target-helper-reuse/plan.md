# Plan: workbench-worker-rework-entry-optional-target-helper-reuse

## Approach

Perform a narrow helper-adoption refactor in the existing Workbench action boundary. The implementation will replace only local comparisons that are semantically equivalent to "if the request supplied a string target, it must match the latest scoped artifact string" with `assertWorkbenchActionOptionalStringTarget`.

The plan intentionally keeps branch logic and idempotency/existence gates direct because they are not optional latest-string comparisons.

## Steps

1. Update `src/workbench/actions/boundary.ts` for `planning.scheduler.worker.rework-plan.compile`.
   - Use `assertWorkbenchActionOptionalStringTarget` for WorkerStart, WorkerResult, SchedulerRuntimeClaimReservation, reservationIntentId, claimIntentId, TaskRun, WorkerLease, worktree, code run, validation run.
   - Keep failed-validation WorkerAudit prohibition and passed-validation WorkerAudit requirement direct.
   - After WorkerAudit is re-read and validated in the passed branch, use the helper for `auditRunId`.
2. Update `src/workbench/actions/boundary.ts` for `planning.scheduler.worker.rework-start-first`.
   - Use the helper for SchedulerRuntimeClaimReservation, WorkerValidation, optional WorkerAudit, reservationIntentId, claimIntentId, original TaskRun, original WorkerLease, worktree, and original code run.
   - Use `reworkPlan.schedulerWorkerAuditId ?? ""` for the optional latest audit id.
   - Do not add audit run validation unless current code already validates it in this path.
3. Update `tests/unit/workbench-module-boundaries.test.ts` with focused helper-adoption assertions for the two rework entry action paths.
4. Run targeted verification first, then product and Harness checks required for this source/ECL change.

## Decisions

- Scope is limited to two adjacent rework entry actions; later rework reconcile/result/validation/audit paths remain follow-up slices.
- No new helper is added. The existing helper in `src/workbench/actions/active-target.ts` remains the shared owner.
- Existing error copy may normalize to the helper's `target scope mismatch` wording for converted checks.
- Full `npm run test` is not the default close gate for this slice because it does not change runtime behavior, action payloads, projection shapes, or scheduler execution paths.

## Module Boundary Plan

- Owner module: `src/workbench/actions/active-target.ts` owns shared Workbench action target helper vocabulary; `src/workbench/actions/boundary.ts` remains action boundary orchestration that applies the shared helper to concrete action evidence.
- New / moved responsibilities: no new responsibilities; repeated scalar target comparisons move from local branches to the existing helper call site.
- Facade touch points: no broad facade changes.
- Forbidden write-back locations: do not move logic into Workbench chat, server routes, frontend, scheduler-runtime manager facades, or a new feature-local validator.
- Compatibility surface: action ids, request payloads, artifact schemas, Workbench projections, and runtime authority remain unchanged.
- Boundary tests: `tests/unit/workbench-module-boundaries.test.ts` asserts helper adoption for selected rework entry paths.
- Follow-up split candidates: none.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: `assertWorkbenchActionOptionalStringTarget`.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new mechanism is proposed.
- Domain-specific logic location: branch-specific scheduler rework rules stay in `boundary.ts` where the action re-reads scheduler artifacts.
- Shared cross-cutting logic location: optional target id comparison stays in `active-target.ts`.
- Local framework / state machine / projection / validation / gate avoided: avoids another local scalar target validator in each scheduler worker rework action.
- Future-cost reduction for similar features: later Workbench scheduler actions can adopt the same helper vocabulary with less review effort and fewer divergent stale-target messages.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

- Subagent plan review approved with adjustments:
  - Do not use the helper for WorkerAudit absence/presence branch rules.
  - Use `?? ""` when the latest artifact field is optional, such as `reworkPlan.schedulerWorkerAuditId`.
  - Keep existing-created artifact checks direct.

