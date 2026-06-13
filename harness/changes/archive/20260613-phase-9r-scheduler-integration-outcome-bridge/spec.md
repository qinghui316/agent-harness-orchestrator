# Spec: Phase 9R Scheduler Integration Outcome Bridge

## Goal

Add a scheduler-owned outcome bridge after `SchedulerIntegrationCheckHandoff` so the scheduler runtime can account for the existing IntegrationCheck result lifecycle without owning source-root mutation.

The bridge must read scoped scheduler handoff evidence, read the existing IntegrationCheck record, verify lineage and target identity, and write a scheduler outcome artifact only for terminal or consumed states. When IntegrationCheck is still `passed`, the existing IntegrationCheck apply/discard confirmation remains the user-facing gate; scheduler must not add a duplicate apply action.

## Users

- Main Agent: needs a simple explanation of whether scheduler-produced worker outputs have reached existing IntegrationCheck, are waiting for apply/discard, were applied, were discarded, or are blocked.
- Developer: needs audit/recovery evidence tying scheduler runtime state to the existing IntegrationCheck result.
- Future scheduler executor: needs a clean handoff point before any later landing/close or next-worker policy is considered.

## Acceptance Criteria

- AC-001: Docs record Phase 9Q archived and Phase 9R active, with no stale active-none or Phase 9Q current claim.
- AC-002: `SchedulerIntegrationOutcome` is implemented inside `src/scheduler-runtime/` and exported through the scheduler-runtime facade.
- AC-003: Outcome reconciliation requires scoped `changeId + schedulerRunId + schedulerIntegrationCheckHandoffId`.
- AC-004: Reconciliation fail-closes on forged, stale, cross-change, superseded, target-mismatched, or source-hash-mismatched scheduler handoff / IntegrationCheck evidence.
- AC-005: IntegrationCheck `passed` remains handled by existing IntegrationCheck apply/discard confirmation; Phase 9R does not add a scheduler apply/discard action or mutate source root.
- AC-006: Applied IntegrationCheck writes scheduler-owned applied outcome only after existing apply evidence is present and all handoff target worktrees are marked applied under matching scope.
- AC-007: Discarded IntegrationCheck writes scheduler-owned discarded outcome without mutating source root.
- AC-008: Failed, conflict, validation-failed, audit-failed, stale-result, or other non-passed terminal IntegrationCheck states write blocked outcome evidence.
- AC-009: Existing IntegrationCheck artifact paths, JSON shape, aggregate validation/audit semantics, apply/discard behavior, Workbench confirmation queue shape, and source-root apply gate remain unchanged.
- AC-010: Workbench summary and lazy projection expose scheduler outcome state without showing duplicate IntegrationCheck/apply controls.
- AC-011: New scheduler-runtime modules do not import Workbench, server, web UI, CLI command modules, or broad facades.
- AC-012: No next worker, whole-wave dispatch, scheduler loop, slot allocator, WorkerLease allocation, child Change, landing, PR, merge, ODWF runtime, cache/replay, or full parallel executor behavior is added.
- AC-013: Full product and Harness verification pass, or any pre-existing failure is explicitly recorded.

## Non-Goals

- Do not reimplement `runIntegrationCheck()`.
- Do not reimplement `applyIntegrationCheck()` or `discardIntegrationCheck()`.
- Do not auto-apply scheduler worktrees.
- Do not start more scheduler workers.
- Do not create new worktrees, runs, TaskRuns, WorkerLeases, WorkerSessions, RuntimeWorkspaces, or EventSources.
- Do not add CLI commands, HTTP routes, or a new parallel scheduler runtime.

## Constraints

- Existing IntegrationCheck remains the authority for aggregate patch validation/audit and source-root apply readiness.
- Existing apply/discard confirmation remains the authority for source-root mutation.
- Scheduler outcome evidence must use canonical scope from selected Change, SchedulerRun, scheduler handoff, and IntegrationCheck record; request payload ids cannot override persisted scope.
- Projection/list paths may be projection-safe, but direct reconcile action must be strict and fail closed.
- The owner module is `src/scheduler-runtime/`; Workbench/server/frontend changes must be thin dispatch/projection/display glue.

## Risks

- Duplicate apply affordance risk: avoid by leaving IntegrationCheck apply/discard in the existing confirmation queue and only showing scheduler outcome after terminal/consumed states.
- Stale outcome risk: fail closed if the handoff is not latest, the IntegrationCheck target set differs, or artifact hashes/source heads no longer match.
- Boundary creep risk: do not let outcome evidence become landing, PR, or demand close authority.
