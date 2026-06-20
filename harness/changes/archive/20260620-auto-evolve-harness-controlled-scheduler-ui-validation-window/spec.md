# Spec: auto-evolve-harness-controlled-scheduler-ui-validation-window

## Goal

Process the pending Harness evolution window generated after five controlled Scheduler / Workbench UI surface changes. Decide whether repeated real-UI validation feedback should update Harness rules or templates.

## Users

- Future agents implementing Workbench-visible product behavior.
- Reviewers using ECL review templates to check whether UI-visible claims were actually rendered and verified.

## Acceptance Criteria

- AC-001: Review the five candidate archive summaries listed in `harness/evolution/pending.md`.
- AC-002: Produce an evolution proposal with candidate window, decision, Experience Lifecycle scan, validation plan, and result target.
- AC-003: Use independent subagent review for the evolution plan/conclusion.
- AC-004: If a repeated Harness-level gap is confirmed, update only the minimal ECL/template wording needed to prevent recurrence.
- AC-005: Record validation/review evidence and run `scripts/harness-evolve.ps1 mark-complete`.
- AC-006: Fix close/handoff drift caused by the just-closed product change before final validation.

## Non-Goals

- No product runtime, Workbench action, scheduler behavior, ToolPolicy, apply/close/merge, or IntegrationCheck change.
- No broad test-suite mandate such as always requiring screenshots, Playwright, or full Workbench suites.
- No phase history copied into current handoff docs.

## Constraints

- Pending evolution must be handled before final handoff/git.
- Workflow truth and human gates remain unchanged.
- Keep documentation entropy low: generic rule only, archive details stay archive-only.
- Real React App DOM tests count as real UI verification when they render the affected user surface.

## Risks

- Over-tightening the rule could slow product progress with unnecessary slow tests.
- Under-tightening the rule could let future UI-visible features pass with projection-only evidence. Mitigation: narrow wording that requires real App DOM or browser UI when feasible, while preserving projection/unit tests for derivation and edge cases.
