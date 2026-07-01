# Spec: auto-evolve-post-controlled-scheduler-bridge-window

## Goal

Resolve the pending Harness evolution window for the latest main-agent recovery
/ Scheduler candidate / controlled Scheduler bridge archive group without
adding unnecessary durable rules.

## Users

- Future AHO agents that rely on ECL and handoff docs to decide whether a
  pending evolution window requires rule/template/product changes.
- Maintainers reviewing whether main-agent Scheduler architecture lessons
  should be promoted into long-term Harness process.

## Acceptance Criteria

- AC-001: Candidate archives are reviewed against current ECL and boundary
  coverage.
- AC-002: Independent subagent review records recommendation, score, and
  rationale.
- AC-003: `harness-evolve mark-complete` records a `noop / subagent_review`
  result and clears `pending.md`.
- AC-004: No product runtime, Workbench UI, Scheduler, Goal Loop, Harness
  template, or ECL rule changes are made.
- AC-005: Handoff docs and Harness checks agree that pending evolution is none.

## Non-Goals

- Adding or modifying Harness rules/templates.
- Changing product runtime, Workbench UI, Scheduler, Goal Loop, apply/close,
  remote, PR, merge, or normal Agent mode.
- Rewriting archived summaries or current architecture docs beyond necessary
  pending-state handoff correction.

## Constraints

- The pending window must be processed through the ECL/Harness evolution
  lifecycle.
- Subagent review is evidence only; final files must still be maintained in
  this workspace.
- Existing no-op evolution precedent should be reused when coverage is already
  sufficient.

## Risks

- Adding a rule tied to helper names such as replay/recovery summaries or
  controlled Scheduler routes would increase documentation entropy.
- Leaving `pending.md` unresolved would block clean handoff and future
  structured changes.
