# Harness Evolution Proposal: post-Codex model picker window

## Decision

`docs_merge`

## Window

Triggered by `harness/evolution/pending.md` after 5 archived changes since the
last completed evolution:

- `20260627-auto-evolve-post-slash-skill-window`
- `20260627-workbench-reference-style-file-reference-composer-v1`
- `20260627-workbench-minimal-right-tool-rail-files-panel-v1`
- `20260627-workbench-reference-style-codex-model-selection-v1`
- `20260627-workbench-reference-style-codex-runtime-model-picker-v1`

## Evidence

- Existing ECL already requires reference-style controls to be backed by real
  behavior, hidden, or honestly unavailable.
- The Codex model-selection window shows the rule was directionally correct:
  an early arbitrary custom-model affordance was removed in the runtime model
  picker follow-up because AHO currently has no API provider model mapping.
- Current docs had handoff entropy in `docs/CURRENT-DEVELOPMENT-PLAN.md`:
  it named a pending evolution near the current direction section, but later
  still claimed pending evolution was none and pointed latest product work at
  an older slash-skill archive.
- Product-visible Workbench controls need clearer review applicability. A
  control can influence user expectations even when it does not mutate
  `confirmationQueue.primary`, so the review template should not allow this
  coverage to be marked not applicable solely on that basis.

## Independent Review

Subagent `Helmholtz` recommendation: `Merge`.

Score: `84/100`.

Key findings:

- No new ECL rule is justified; reference-driven UI/source evidence,
  user-surface honesty, runtime bridge, core reuse, and documentation entropy
  rules already cover the observed issues.
- Minimal review-template wording is justified so product-visible Workbench
  controls get DOM/browser evidence or an explicit infeasible reason.
- `docs/CURRENT-DEVELOPMENT-PLAN.md` needed pending/latest/current evolution
  alignment.
- AGENTS and STATUS are otherwise compact enough and should only be updated as
  part of normal close/handoff.

## Experience Retention Scan

- Promote: none. No new durable ECL, lint, product runtime, or broad template
  section is warranted.
- Retain: existing ECL reference-driven UI/product source evidence,
  Workbench user-surface honesty, runtime bridge, core-reuse, and
  documentation entropy rules.
- Merge: align CURRENT pending/latest/current evolution state; add one
  sentence to the review template clarifying product-visible Workbench control
  applicability.
- Retire: stale `Pending evolution: none` and stale slash-skill latest product
  pointer in `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- Archive-only: screenshots, E-drive sandbox paths, run ids, detailed per-run
  model-list stderr, and product closeout narratives.

## Applied Delta

- Updated `harness/templates/change/reviews/review.md` with one sentence under
  Workbench User-Surface Honesty Coverage: product-visible Workbench controls
  are applicable unless the review records why they cannot affect user
  decisions.
- Updated `docs/CURRENT-DEVELOPMENT-PLAN.md` so current structured change,
  pending evolution, latest product change, and current Harness evolution state
  agree.
- Updated `AGENTS.md` and `docs/STATUS.md` while the active evolution is open
  so handoff points to the active change rather than a loose pending file.

## Non-Changes

- No product runtime change.
- No Workbench UI change.
- No ECL rule addition.
- No lint rule addition.
- No reference source tracking, vendoring, or dependency change.

## Verification Plan

- `scripts/lint-ecl.ps1`
- `scripts/lint-encoding.ps1`
- `scripts/harness-change.ps1 reindex`
- `scripts/harness-change.ps1 status`
- `scripts/harness-evolve.ps1 mark-complete -Status docs_merge -EvalMode subagent_review`
- `scripts/harness-evolve.ps1 check`
