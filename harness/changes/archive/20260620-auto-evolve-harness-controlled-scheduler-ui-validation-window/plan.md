# Plan: auto-evolve-harness-controlled-scheduler-ui-validation-window

## Decision

Use a narrow Harness rule/template update.

The candidate window repeatedly used real React/App DOM tests to prove Workbench-visible controlled Scheduler behavior. Existing Workbench User-Surface Honesty rules already require visible-surface checks, but they do not explicitly say that projection/unit evidence is not enough for UI-visible product behavior. The minimal fix is to add that sentence to ECL and mirror it in the review template.

## Steps

1. Record the five candidate archives and Experience Lifecycle classification in a proposal under `harness/evolution/proposals/`.
2. Update `docs/ECL.md` Workbench User-Surface Honesty Coverage with the narrow real-UI validation rule.
3. Update `harness/templates/change/reviews/review.md` so future reviews prompt for real App DOM/browser UI evidence when applicable.
4. Keep AGENTS/STATUS handoff aligned with the active auto-evolve change and then final archive state.
5. Validate ECL, encoding, Harness status, and evolution completion.

## Boundaries

- No product source code changes.
- No scheduler runtime or action behavior changes.
- No new lint/script requirement.
- No broad documentation rewrite.

## Experience Lifecycle

- Promote: real App DOM or browser UI verification is required for UI-visible Workbench behavior when feasible.
- Retain: projection/unit evidence remains required and useful for derived read-model behavior and edge cases.
- Merge: repeated controlled Scheduler UI validation lessons merge into the existing Workbench User-Surface Honesty rule/template.
- Retire: none.
- Archive-only: per-phase DTO names, specific controlled Scheduler copy, result-summary fields, and implementation details.
