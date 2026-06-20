# Spec: auto-evolve-harness-controlled-scheduler-reconfirm-window

## Goal

Process the pending Harness evolution window generated after five archived
controlled scheduler / Workbench result-surface changes. Decide whether this
window should modify Harness rules/templates/scripts or whether existing ECL
coverage is sufficient.

## Users

- Future agents continuing controlled Scheduler / Goal Loop product work.
- Reviewers relying on Harness evolution to avoid both missing rules and
  unnecessary process weight.

## Acceptance Criteria

- AC-001: Review the five candidate archive summaries listed in
  `harness/evolution/pending.md`.
- AC-002: Produce a Harness evolution proposal with candidate window, decision,
  evaluation, Experience Lifecycle scan, validation plan, and result target.
- AC-003: Use independent subagent review for the evolution conclusion.
- AC-004: Record validation/review evidence and run
  `scripts/harness-evolve.ps1 mark-complete`.
- AC-005: Do not modify Harness rules, scripts, current docs, or product
  runtime unless the evaluation identifies a real repeated Harness-level gap.
  A narrow review-template alignment is allowed if an existing ECL rule is
  missing from the default template.

## Non-Goals

- No product runtime change.
- No Workbench UI/action change.
- No new Harness rule/template/script by default.
- No broad architecture or test-suite convergence.

## Constraints

- Pending evolution must be handled before final handoff/git.
- Existing workflow truth and human gates remain unchanged.
- Keep this evolution lightweight; do not add process weight without a
  repeated missing-policy signal.
- Experience Lifecycle must classify whether recent experience should be
  promoted, retained, merged, retired, or left archive-only.

## Risks

- Overreacting would slow product progress with duplicate Harness rules.
- Underreacting could miss a repeated safety gap. Mitigation: candidate-window
  review plus independent subagent evaluation.
