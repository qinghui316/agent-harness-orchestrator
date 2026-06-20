# Spec: controlled-scheduler-confirmation-evidence-surface

## Goal

When the controlled Scheduler can be confirmed again after a refreshed post-step Goal Loop evaluation, the right confirmation card should show the evidence backing that readiness directly in the decision surface.

This makes the confirmation queue more useful without adding another execution path: the user sees what evidence supports the next single-step confirmation, and the existing controlled advance action remains the only executable affordance.

## Users

- Human operator deciding whether to confirm the next controlled Scheduler step.
- Main Agent / Workbench UI relying on confirmation queue projections to explain the next safe decision.

## Acceptance Criteria

- AC-001: Refreshed controlled Scheduler confirmation items merge the ready Workpad Goal Loop next-candidate evidence refs into `ConfirmationQueueItem.evidenceRefs`.
- AC-002: Evidence refs are merged only when the refreshed current gate matches and `controlledSchedulerNextCandidate.status` is `ready-for-confirmation`; needs-review or mismatched states must not be presented as ready confirmation evidence.
- AC-003: The right confirmation card renders existing `evidenceRefs` as read-only evidence links without adding action buttons or changing confirmation behavior.
- AC-004: The card keeps user-facing copy free of raw action ids/internal terms and preserves the single controlled advance button.
- AC-005: Verification includes projection tests and a real React/App DOM test proving the evidence links are visible in the actual confirmation card.

## Non-Goals

- Do not add or change workflow actions, server routes, scheduler runtime behavior, ToolPolicy, source apply, close, merge, remote landing, or Harness evolution automation.
- Do not use transient action result `postStepHandoff` as confirmation queue truth.
- Do not add frontend business logic for Goal Loop or Scheduler readiness.

## Constraints

- Confirmation queue remains a projection over Workbench/Goal Loop evidence.
- Right confirmation queue remains the only execution entry for the controlled Scheduler step.
- React may render evidence refs but must not decide whether a Scheduler gate is ready.

## Risks

- Showing evidence refs on a confirmation card could imply the step is automatically approved. The copy must still say the user is confirming one step only.
- Generic evidence rendering could leak noisy internal paths. Use existing `artifactName` display to show compact filenames.
