# Spec: controlled-scheduler-confirmation-candidate-detail

## Goal

Show the refreshed controlled Scheduler next-candidate detail on the right confirmation card, using the existing Workpad `controlledSchedulerNextCandidate` read-model evidence, so the unique executable confirmation surface also tells the user which next candidate is ready, whether readiness evidence is prepared, and that human confirmation is still required.

## Users

- Developers continuing a controlled Scheduler / Goal Loop demand in the Workbench.
- Main users relying on the right confirmation card as the only executable decision surface.

## Acceptance Criteria

- AC-001: A controlled Scheduler advance confirmation item can carry an optional structured `controlledSchedulerNextCandidate` detail sourced from the existing Workpad candidate DTO.
- AC-002: The detail is attached only when the existing refreshed reconfirmation predicate is true and the candidate status is `ready-for-confirmation`; stale, mismatched, or `needs-review` candidates must not appear on the executable confirmation card.
- AC-003: The right confirmation card renders the candidate label/body plus readiness and human-confirmation status as user-facing detail without adding another primary action, feedback action, or evidence action.
- AC-004: The rendered copy keeps the boundary clear: the user still has to confirm the concrete controlled step, and no automatic loop, whole-wave dispatch, slot allocation, source mutation, apply, close, merge, or Harness evolution is authorized.
- AC-005: No scheduler runtime, Goal Loop policy, ToolPolicyGate, server route, workflow action, source apply, close, merge, IntegrationCheck, or Harness evolution behavior changes.
- AC-006: Validation includes read-model/unit coverage and a real React App DOM test for the right confirmation card.

## Non-Goals

- No new button or action type.
- No new server endpoint.
- No execution from Goal Loop candidate data.
- No display of `needs-review` candidate detail on an executable confirmation card.
- No changes to Workpad detail card behavior.

## Constraints

- Reuse `WorkbenchControlledSchedulerNextCandidate`; do not create a second candidate state model.
- Read-model confirmation owner decides whether the detail is present.
- Frontend `DecisionPanels` only renders the optional detail; it must not infer readiness or inspect Goal Loop internals.
- Keep `README.md` unrelated and untracked.

## Risks

- Showing candidate detail beside an executable action could look like auto-authorization. Mitigation: attach only ready/matching candidates, render explicit human-confirmation copy, and keep exactly one existing controlled-advance action.
- UI-visible behavior needs real React/App DOM verification. Mitigation: add a deterministic DOM assertion in `tests/unit/web-app.test.tsx`.
