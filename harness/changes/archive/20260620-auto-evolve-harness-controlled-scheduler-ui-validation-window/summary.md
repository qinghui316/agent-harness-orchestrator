# auto-evolve-harness-controlled-scheduler-ui-validation-window

## Purpose

Handle the pending Harness evolution generated after five controlled Scheduler / Workbench UI surface changes. The window shows a repeated need to distinguish real UI validation from projection-only evidence for user-visible product behavior.

## Scope

In scope:

- Review the five candidate archive summaries listed in `harness/evolution/pending.md`.
- Add minimal ECL and review-template wording for UI-visible Workbench behavior requiring real App DOM or browser UI verification when feasible.
- Record proposal, independent review, validation, results.tsv, and `mark-complete` evidence.
- Fix current handoff drift caused by the just-closed product change.

Out of scope:

- No product runtime, Workbench action, scheduler runtime, ToolPolicy, source apply, close, merge, IntegrationCheck, remote landing, or broad test-suite changes.
- No copied phase history in current handoff docs.

## Current Status

Ready to close.

## Verification

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 mark-complete -Status template_update -EvalMode independent_review -Notes "..."`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`

## Acceptance Feedback

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: user required future UI-visible product features to be truly verified rather than fake/projection-only.
- Retries or environment failures: initial `lint-ecl` failed due to missing active continuation rationale; summary was updated and lint passed.
- Screenshots / artifacts / run ids: subagent plan review `019ee4ee-5f56-7942-9a48-66fc7e663995`; proposal `harness/evolution/proposals/20260620-controlled-scheduler-ui-validation-window-template-update.md`; `harness/evolution/results.tsv` row with `template_update`.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: applicable to ECL wording, review template, handoff docs, proposal, and results.tsv.
- Experience lifecycle result: promote the repeated real-UI verification lesson into Workbench User-Surface Honesty; retain projection coverage for derivation and edge cases; keep per-phase implementation details archive-only.
- Roadmap/current-direction stale language check: no roadmap change planned.
- Old experience retained / merged / retired / archive-only: merge repeated UI validation experience into the existing Workbench User-Surface Honesty rule/template.
