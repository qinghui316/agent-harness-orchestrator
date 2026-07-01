# Spec: auto-evolve-post-controlled-scheduler-backflow-window

## Goal

Complete the pending Harness evolution window for the controlled Scheduler
bridge/backflow archive sequence, deciding whether any lesson should be
promoted into durable Harness rules/templates/lints or retained as archive-only
history.

## Users

- Future AHO agents following ECL and Harness evolution.
- Maintainers deciding whether repeated controlled Scheduler/main-agent
  evidence lessons need new rules.

## Acceptance Criteria

- AC-001: Candidate archive summaries in `harness/evolution/pending.md` are
  reviewed against current `docs/ECL.md`, `docs/BOUNDARIES.md`, `AGENTS.md`,
  and `docs/STATUS.md`.
- AC-002: Independent subagent review records a recommendation, score, retained
  lessons, and any boundary risks.
- AC-003: Evolution proposal records the final recommendation, rationale, and
  Experience Retention Scan.
- AC-004: Pending evolution is marked complete with `noop / subagent_review`
  if no durable rule/template/product change is justified.
- AC-005: Harness checks pass and handoff docs reflect active/pending state
  before close and no pending evolution after close.

## Non-Goals

- Do not change product runtime, Workbench UI, Scheduler/IntegrationCheck
  owners, action bridge, confirmationQueue, automation allowlist, apply/close,
  remote, PR, merge, or Harness evolution mechanics.
- Do not add implementation-specific controlled Scheduler helper names to ECL
  unless review finds a reusable process gap not already covered.

## Constraints

- `pending.md` must be completed through proposal, independent review,
  validation, results row, and `mark-complete`.
- Existing ECL rules should be reused when sufficient; no-op is valid after an
  explicit Experience Retention Scan.

## Risks

- Over-promoting archive-specific helper names would increase documentation
  entropy and make future agents treat read-only evidence as workflow truth.
- Under-reviewing the window could miss a real Harness rule gap around
  Scheduler/IntegrationCheck authority.

