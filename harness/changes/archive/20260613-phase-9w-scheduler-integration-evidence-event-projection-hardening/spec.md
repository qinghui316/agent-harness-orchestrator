# Spec: Phase 9W Scheduler Integration Evidence Event Projection Hardening

## Goal

Add scheduler-runtime journal coverage for the scheduler integration bridge so the full path is visible as SchedulerRun-scoped runtime evidence:

`SchedulerIntegrationCandidate -> SchedulerIntegrationCheckHandoff -> SchedulerIntegrationOutcome`

The implementation must keep the bridge as evidence/replay material only. It must not become an executor, a new IntegrationCheck engine, or a scheduler-owned apply/discard path.

## Users

- Developers using the Workbench run graph and scheduler evidence detail to understand why a scheduler run is waiting, integrated, applied, discarded, or blocked.
- Future recovery/replay code that needs a canonical SchedulerRun event trail rather than reconstructing every integration bridge transition from separate artifacts.
- Harness reviewers checking that scheduler integration still returns to existing IntegrationCheck and human apply/discard gates.

## Acceptance Criteria

- AC-001: Docs and ECL artifacts accurately record Phase 9V and the latest Harness evolution as closed, and Phase 9W as active.
- AC-002: `SchedulerRuntimeEventType` includes integration candidate, IntegrationCheck handoff, and Integration outcome event types.
- AC-003: Writing a new `SchedulerIntegrationCandidate` appends exactly one SchedulerRun-scoped candidate event; idempotent rewrites/refreshes do not create noisy duplicate event semantics beyond the chosen write path.
- AC-004: Writing a new `SchedulerIntegrationCheckHandoff` appends exactly one SchedulerRun-scoped handoff event; returning an existing handoff does not append another event.
- AC-005: Writing a terminal `SchedulerIntegrationOutcome` appends exactly one SchedulerRun-scoped outcome event; `waiting-for-apply` does not append a terminal outcome event.
- AC-006: Event canonical `changeId` and `schedulerRunId` come from the persisted `SchedulerRun`; caller payload cannot forge scheduler event scope.
- AC-007: Existing IntegrationCheck/apply/discard behavior remains unchanged; scheduler code does not apply, discard, mutate source root, create a new IntegrationCheck engine, or bypass existing human gates.
- AC-008: New logic remains owned by `src/scheduler-runtime/*`; Workbench/server/frontend/broad facades do not own the scheduler integration event implementation.
- AC-009: Full product and Harness verification pass, or any pre-existing failure is clearly recorded.

## Non-Goals

- No parallel executor, scheduler loop, whole-wave dispatch, slot allocator, next-worker automation, child Change creation, ODWF JavaScript runtime, cache/replay, new CLI command, new HTTP route, or new Workbench action.
- No new apply/discard action and no source-root mutation path.
- No changes to public artifact JSON/Markdown shapes for SchedulerIntegrationCandidate, SchedulerIntegrationCheckHandoff, SchedulerIntegrationOutcome, IntegrationCheck, Run, Validation, Audit, Worktree, or Runtime Continuity.

## Constraints

- Keep Change/ECL, accepted artifacts, Run, Validation, Audit, IntegrationCheck, apply/discard, close, and human gates as workflow truth.
- Continue using `src/scheduler-runtime/` as the owner module.
- Continue excluding unrelated untracked `README.md`.
- Preserve UTF-8 and PowerShell encoding discipline.

## Risks

- Event append on refresh could become noisy. Keep events only on meaningful writes and test idempotent existing paths.
- Integration handoff calls the existing IntegrationCheck engine; documentation and event labels must not imply scheduler-owned execution or apply authority.
- Projection/read-model code must remain a thin consumer; avoid moving main scheduler logic into Workbench or server facades.
