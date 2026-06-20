# Harness Evolution Proposal: controlled-scheduler-ui-validation-window

## Candidate Window

Generated from `harness/evolution/pending.md` after five archived product changes:

- `harness/changes/archive/20260620-controlled-scheduler-reconfirm-copy/summary.md`
- `harness/changes/archive/20260620-controlled-scheduler-concrete-step-preview/summary.md`
- `harness/changes/archive/20260620-controlled-scheduler-post-step-result-summary/summary.md`
- `harness/changes/archive/20260620-controlled-scheduler-workpad-next-candidate-surface/summary.md`
- `harness/changes/archive/20260620-controlled-scheduler-confirmation-evidence-surface/summary.md`

## Decision

`template_update`.

Keep existing workflow-truth, Goal Loop boundary, Workbench User-Surface Honesty, Read Model Projection, Module Boundary, Core Mechanism Reuse, and human-gate rules. Add a narrow clarification that UI-visible Workbench product behavior needs real App DOM or browser UI verification when feasible; projection/unit evidence can support derivation and edge cases but should not be the only visible-surface acceptance evidence.

## Evaluation

The five changes were bounded, user-visible controlled Scheduler surfaces:

- clearer reconfirmation copy;
- concrete single-step category preview;
- post-step result summary;
- durable Workpad next-candidate state;
- right confirmation-card evidence refs.

Each preserved the single-confirmed-step boundary and avoided runtime loop, ToolPolicy, apply, close, merge, and IntegrationCheck changes. The repeated pattern was not a missing product mechanism; it was a review/validation expectation: visible UI claims should be verified through a rendered UI surface, not only through projection tests.

## Experience Lifecycle

- Promote: real App DOM or browser UI verification for UI-visible Workbench behavior when feasible.
- Retain: projection/unit coverage for read-model derivation, stale/mismatch edge cases, and owner-module behavior.
- Merge: fold the repeated controlled Scheduler UI validation lesson into Workbench User-Surface Honesty and the review template.
- Retire: none.
- Archive-only: specific DTO/copy/result-summary implementation details and phase narratives.

## Validation Plan

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 mark-complete -Status template_update -EvalMode independent_review -Notes "..."`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`

## Result Target

Record a `template_update / independent_review` row in `harness/evolution/results.tsv`. No product runtime, scheduler behavior, ToolPolicy, source apply, close, merge, IntegrationCheck, or broad test-suite requirement changes.
