# auto-evolve-harness-real-codex-acceptance-window

## Purpose

Evaluate the pending Harness evolution window created after the latest five
archived changes. The window covers controlled Scheduler convergence,
Workbench manual-gated usability, demand-to-execution golden flow,
Workbench verification signal stability, and current-project real Codex
acceptance.

The goal is not to add another process layer. The goal is to decide which
experience should become compact current Harness memory, which should stay
archive-only, and which existing ECL rules are already sufficient.

## Scope

In scope:

- Read the pending archive summaries and current Harness rules.
- Produce a Harness evolution proposal with Experience Retention Scan.
- Use an authorized read-only subagent for independent review.
- Promote only narrow reusable rules that change future agent behavior.
- Record validation and complete the pending evolution through
  `scripts/harness-evolve.ps1 mark-complete`.

Out of scope:

- Product runtime changes.
- Workbench UI changes.
- New evidence families, Scheduler loops, full-auto task mode, or remote
  landing behavior.
- Rewriting archive history or hand-editing `harness/changes/INDEX.json`.

## Current Status

Completed / Ready to close.

## Verification

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`: passed with no pending evolution after `mark-complete`.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 mark-complete -Status template_update -EvalMode subagent_review ...`: passed and removed `harness/evolution/pending.md`.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`: passed after closeout checklist update.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status`: passed and reported `close-ready`.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`: passed.

Product test suites are not planned because this change is Harness
documentation/evolution only.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none.
- Extra prompts or reviewer instructions: user explicitly authorized subagent
  use for `pending.md`.
- Retries or environment failures: none.
- Screenshots / artifacts / run ids: not applicable.
- External source/state safety: not applicable; no product source apply occurs
  in this evolution.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: the latest real
  acceptance left a bounded Workbench projection gap as product follow-up, not
  Harness evolution scope.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: applicable because this change updates Harness
  rules, evolution records, and handoff docs.
- Experience lifecycle result: `template-update`, reviewed by subagent Boyle
  with score `84/100`.
- Roadmap/current-direction stale language check: active/pending state updated
  in `AGENTS.md`, `docs/STATUS.md`, and
  `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- Old experience retained / merged / retired / archive-only: recorded in
  `harness/evolution/proposals/20260623-real-codex-acceptance-window.md` and
  `reviews/review.md`.
