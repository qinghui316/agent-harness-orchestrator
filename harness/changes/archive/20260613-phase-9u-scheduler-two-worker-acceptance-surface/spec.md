# Spec: Phase 9U Scheduler Two Worker Acceptance Surface

## Goal

Prove the scheduler current-worker surface can advance beyond the first worker without adding a full parallel executor: a second worker can run through the existing current-worker quality gates, refresh scheduler integration candidate evidence, and hand ready targets to the existing IntegrationCheck gate.

## Users

- Developer using Workbench as the main-agent conversation and Harness confirmation surface.
- Future maintainer adding scheduler runtime behavior who needs this boundary locked down before adding loops or whole-wave dispatch.

## Acceptance Criteria

- AC-001: Docs accurately record Phase 9T archived and Phase 9U active, with no stale active-none handoff in `AGENTS.md` or `docs/STATUS.md`.
- AC-002: Workbench transcript/action labels for scheduler worker result, validation, audit, and rework compatibility actions use current-worker wording rather than first-worker singleton wording after `start-next`.
- AC-003: A focused acceptance path proves: first scheduler worker audit approved -> `SchedulerIntegrationCandidate` waiting with one ready output -> `planning.scheduler.worker.start-next` starts exactly one additional coder worker -> current worker result/validation/audit completes -> candidate refresh includes both approved outputs and at least two ready worktree targets -> scheduler IntegrationCheck handoff uses those exact ready worktree ids.
- AC-004: The acceptance path does not start whole-wave dispatch, scheduler loop, slot allocator, apply/discard, landing, PR, merge, child Change, `WorkflowRun`, `TaskQueueRun`, or `AgentTask`.
- AC-005: New or changed scheduler decisions remain in owned scheduler-runtime modules or tests; Workbench/server/frontend code only maps action payloads, labels, summaries, and projections.
- AC-006: Reference alignment remains intact: Symphony-style dispatch/reconcile and AgentScope-style session/event evidence are inspiration only; AHO workflow truth remains Change/ECL, accepted artifacts, Run/Validation/Audit, IntegrationCheck, and human gates.

## Non-Goals

- Add full parallel executor, scheduler loop, slot allocator, start-all/whole-wave controls, or new scheduler runtime authority.
- Add new Workbench action, CLI command, HTTP route, frontend panel, or public artifact shape.
- Run apply/discard, landing, PR, merge, or child Change creation from the scheduler path.

## Constraints

- `README.md` remains unrelated and untracked.
- Existing compatibility action ids such as `validate-first` / `audit-first` remain stable; copy can describe the current worker path.
- Product logic must stay owner-module first. Do not add scheduler state-machine logic to broad Workbench facades.

## Risks

- The long Workbench acceptance test can become brittle if it duplicates scheduler internals; it should drive public Workbench actions and assert artifacts/payloads instead.
- Residual Workbench path classification still exists; if behavior must change, prefer scheduler-runtime helpers over adding more Workbench state branches.
