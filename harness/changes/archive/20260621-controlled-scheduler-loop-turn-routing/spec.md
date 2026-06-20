# Spec: controlled-scheduler-loop-turn-routing

## Goal

After a human confirms one controlled Scheduler gate, AHO should record where that one controlled turn stopped in a reusable, SchedulerRun-scoped route summary. The summary must make the route clear to the user and to later controlled-loop runtime work: which concrete gate ran, what scheduler result was produced, which existing controlled-loop posture applies, whether another human gate is still required, and which authorities remain explicitly forbidden.

## Users

- Main Agent and future controlled-loop runtime code that need a compact post-step route input without re-reading scattered Workbench handler fields.
- Users reading the Workbench controlled-step evidence card after a controlled Scheduler step.
- Future agents extending Scheduler/Goal Loop behavior who need a clear owner boundary for post-step route records.

## Acceptance Criteria

- AC-001: `SchedulerControlledStepEvidence` may carry an optional route summary with executed action, result kind/id/status, route posture, next candidate action, human-gate requirement, warning detail, and forbidden authority flags that all remain false.
- AC-002: Route posture reuses the existing Goal Loop controlled-loop posture vocabulary: `waiting`, `recommending-gate`, `awaiting-human-gate`, `quality-routing`, `integration-barrier`, and `terminal-handoff`; warnings are details, not a new posture.
- AC-003: The route summary is built in scheduler-runtime ownership from existing controlled-step inputs and does not re-read workflow truth, create a new artifact family, or become execution authority.
- AC-004: `planning.scheduler.controlled-advance.run` keeps the existing sequence: fresh Goal Loop evaluation, controller policy, gate-readiness preflight, one concrete scheduler gate, post-step evidence, route summary record.
- AC-005: Workbench projection and frontend display the route summary as read-only evidence without adding or duplicating executable buttons, confirmation items, server routes, or ToolPolicy paths.
- AC-006: Targeted tests cover helper mapping, handler recording, repository/projection, and real App DOM read-only display. Verification records why slow or full suites are run or skipped.

## Non-Goals

- Implementing an autonomous scheduler loop, hidden continuation, whole-wave dispatch, slot allocator, full parallel executor, or automatic worker fan-out.
- Allowing Goal Loop evidence, controller policy, or route summary to execute a gate or bypass ToolPolicyGate, stale revalidation, validation/audit, IntegrationCheck, or human gates.
- Adding source apply, merge, close/archive, remote landing, or Harness evolution automation.
- Adding a second controlled-loop state model outside the existing Goal Loop posture vocabulary.

## Constraints

- Workflow truth remains Change/ECL, accepted artifacts, SchedulerRun/runtime evidence, Run, Validation, Audit, IntegrationCheck, apply/close decisions, and Harness evolution records.
- Goal Loop remains the owner for current-evidence reasoning and controlled-loop posture vocabulary.
- Scheduler runtime owns the SchedulerRun-scoped controlled step evidence record and post-step route summary persistence/rendering.
- Workbench and frontend surfaces are read-only projections for this feature.
- The change must satisfy Module Boundary and Core Mechanism Reuse coverage.

## Risks

- Re-implementing Goal Loop posture policy inside scheduler-runtime would create a local state machine and violate Architecture Growth Control.
- Making warnings a new posture would drift from the accepted controlled-loop design boundary.
- Putting result-summary or route logic in the Workbench handler would continue cross-cutting runtime behavior in a glue layer.
- UI wording could accidentally imply automatic continuation or new execution authority.
