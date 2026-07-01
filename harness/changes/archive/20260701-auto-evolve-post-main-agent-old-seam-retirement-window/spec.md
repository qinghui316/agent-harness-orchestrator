# Spec: auto-evolve-post-main-agent-old-seam-retirement-window

## Goal

Determine whether the latest controlled Scheduler backflow and old-seam
retirement archive window requires a Harness rule, template, lint, or runtime
change.

## Users

Future agents working under AHO Harness rules.

## Acceptance Criteria

- AC-001: The five candidate archives are reviewed against current ECL and
  boundary rules.
- AC-002: Independent review confirms whether the correct result is `noop` or a
  concrete Harness evolution.
- AC-003: If no new rule is needed, `harness-evolve mark-complete` records a
  `noop / subagent_review` result and clears `pending.md`.
- AC-004: Handoff docs reflect the pending evolution outcome.

## Non-Goals

- Do not change product runtime, Workbench UI, action ids, confirmation queue,
  automation, Scheduler, IntegrationCheck, apply/close, remote, PR, merge, or
  Harness evolution authority.
- Do not promote short-lived implementation helper names into durable ECL unless
  the review finds a general rule gap.

## Constraints

- `pending.md` must be handled through evidence, review, validation, and
  `mark-complete`; it must not be deleted manually.
- Any evolution must be generalizable and machine-checkable where practical.
- No-op is preferred when existing ECL/BOUNDARIES already cover the lessons.

## Risks

- Overfitting ECL to one migration's helper names would increase documentation
  entropy.
- Ignoring a real repeated failure mode would let later agents regress into
  unsafe seam deletion or permission expansion.
