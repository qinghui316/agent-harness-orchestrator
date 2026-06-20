# Spec: controlled-scheduler-continuation-readiness

## Goal

Build the next controlled Scheduler product slice after `controlledLoopTick`:
make the latest stopped controlled step tell the user whether the next
continuation is ready for the existing human gate or must stop for review,
waiting, quality/rework, IntegrationCheck, or terminal handoff.

## Users

- A developer using the Workbench to continue a long-running demand safely.
- The main Agent reading Workpad evidence before explaining the next step.
- Reviewers checking that controlled Scheduler evidence is still bounded by
  Change/ECL, accepted artifacts, validation/audit, IntegrationCheck, ToolPolicy,
  and human gates.

## Acceptance Criteria

- AC-001: Existing `SchedulerControlledStepEvidence` records an embedded
  continuation readiness summary derived from its controlled loop tick, route,
  result, and post-step handoff.
- AC-002: The readiness summary uses the existing controlled-loop posture
  vocabulary and includes a user-facing status, reason, current/next action
  labels where available, evidence refs, and a boundary statement.
- AC-003: Readiness remains non-executing: `executionStarted` is false,
  `humanConfirmationStillRequired` is true, and loop/full-parallel/whole-wave/
  slot/source/apply/close/merge/remote/evolution authorizations are false.
- AC-004: Workbench projection exposes the readiness summary only as read-only
  Workpad evidence, and current-gate mismatch, missing receipt/gate evidence,
  stale or cross-change scope, disabled gate, or incomplete readiness fails
  closed to a review/waiting state.
- AC-005: The real Workbench UI shows the readiness state in user-facing copy
  without exposing a new primary executable action or advertising automatic
  loop/parallel/source/apply/close/remote/evolution behavior.
- AC-006: The existing controlled Scheduler advance path and concrete Scheduler
  action semantics remain compatible.

## Non-Goals

- Do not create a new standalone artifact family.
- Do not add automatic scheduler loops, hidden continuation, whole-wave
  dispatch, slot allocation, full parallel executor, child Changes, source
  apply/merge, close automation, remote landing, or Harness evolution
  automation.
- Do not add a new Workbench action, server route, CLI command, or ToolPolicy
  path.
- Do not make Goal Loop, SchedulerRun, Workbench projection, or UI state
  workflow truth.

## Constraints

- Workflow truth remains Change/ECL, accepted artifacts, Run, Validation, Audit,
  IntegrationCheck, Apply/Close human gates, and Harness evolution.
- `src/scheduler-runtime/` owns readiness classification from runtime evidence.
- Workbench read-model may align runtime readiness with the current visible
  human gate but must not own scheduler policy.
- Frontend renders the projected summary only; it must not infer policy or create
  executable affordances.
- Reuse existing posture vocabulary, stale/scope revalidation helpers, Workbench
  projection patterns, and controlled Scheduler reconfirmation logic.

## Risks

- Risk: adding another evidence summary could become local-framework growth.
  Mitigation: embed in existing controlled step evidence and reuse existing
  posture/read-model/action-scope mechanisms.
- Risk: UI copy could imply automatic continuation. Mitigation: deterministic
  DOM assertions for no fake action and explicit human gate wording.
- Risk: readiness could drift from the current visible gate. Mitigation:
  projection tests for stale/missing/cross-change/disabled/mismatched gate cases.

