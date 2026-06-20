# Controlled Scheduler Routing Window Noop

## Candidate Window

Pending evolution was generated after these five candidate product changes:

- `harness/changes/archive/20260620-controlled-scheduler-confirmation-evidence-surface/summary.md`
- `harness/changes/archive/20260620-controlled-scheduler-next-candidate-prompt-evidence/summary.md`
- `harness/changes/archive/20260620-controlled-scheduler-confirmation-candidate-detail/summary.md`
- `harness/changes/archive/20260620-controlled-scheduler-action-receipt-surface/summary.md`
- `harness/changes/archive/20260620-controlled-scheduler-confirmation-routing-posture/summary.md`

## Recommendation

Result: `noop`.

The candidate window confirms the existing Harness rule rather than exposing a new rule gap. UI-visible Workbench behavior in this window used real App DOM evidence when the changed surface was rendered. The one prompt-evidence change correctly did not claim rendered UI acceptance. The user's correction that UI-visible product behavior must be really UI verified, not fake/projection-only, is already covered by current `docs/ECL.md` Workbench User-Surface Honesty and the review template.

## Existing Coverage

- `docs/ECL.md` section 13 requires real React/App DOM or browser UI checks when Workbench behavior is product-visible and says projection/unit evidence should not be the only visible-surface acceptance evidence.
- `harness/templates/change/reviews/review.md` already records real App DOM / browser UI verification and projection/unit supplemental evidence.
- `harness/changes/archive/20260620-auto-evolve-harness-controlled-scheduler-ui-validation-window/summary.md` already promoted this lesson with `template_update`.

## Experience Retention Scan

- Promote: none. The durable lesson was already promoted into ECL and the review template.
- Retain: keep Workbench User-Surface Honesty wording and review-template real UI fields.
- Merge: none. The repeated UI-verification lesson is already merged into the existing rule.
- Retire: none.
- Archive-only: per-change controlled Scheduler implementation details, exact test names, subagent ids, and transient retry notes remain in archive summaries.

## Independent Review

Subagent `019ee542-e471-7171-a4d6-d3b7a86a0ac5` independently recommended `noop`. It found that the latest correction is already adequately covered by current ECL and review-template language. It also warned that duplicating the rule would increase documentation entropy without improving enforceability.

## Validation Plan

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 mark-complete -Status noop -EvalMode independent_review -Notes "..."`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`

## Non-Changes

Do not change product code, scheduler runtime, Workbench actions, ToolPolicy, source apply, close, merge, IntegrationCheck, remote handoff, `docs/ECL.md`, or the review template for this evolution.
