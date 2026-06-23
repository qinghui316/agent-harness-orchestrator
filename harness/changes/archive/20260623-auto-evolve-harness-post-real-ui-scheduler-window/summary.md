# Auto Evolve Harness Post Real UI Scheduler Window

## Purpose

Evaluate the pending Harness evolution window created after the latest five
archived changes. The window covers real Workbench/Codex acceptance,
Goal-driven Workflow Loop documentation, close-gate projection alignment, real
UI blocker scouting, and scheduler slow-runtime reduction.

The goal is to decide whether repeated experience should become compact current
Harness memory. This change promotes only one narrow template/ECL prompt:
Workbench current-decision surfaces must agree with the authoritative primary
gate, and stale/running/archived context must not override it.

## Scope

In scope:

- Read the pending archive summaries and current Harness rules/templates.
- Produce an evolution proposal with Experience Retention Scan.
- Use an authorized read-only subagent for independent review.
- Update only the existing Workbench User-Surface Honesty rule/template prompts
  if the evidence supports the delta.
- Record validation and complete pending evolution through
  `scripts/harness-evolve.ps1 mark-complete`.

Out of scope:

- Product runtime changes.
- Workbench UI behavior changes.
- New evidence families, Scheduler loops, full-auto task mode, or remote
  landing behavior.
- Rewriting archive history or hand-editing `harness/changes/INDEX.json`.

## Current Status

Ready to close.

## Verification

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 mark-complete -Status template_update -EvalMode subagent_review ...`: passed and removed `harness/evolution/pending.md`.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`: passed with no pending evolution.
- Final `scripts/lint-ecl.ps1` and `harness-change status`: required after this close-ready update.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: user explicitly authorized subagent
  use for `pending.md`.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: not applicable.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: applicable because this change updates Harness
  rules/templates, evolution records, and handoff state.
- Experience lifecycle result: `template_update`, reviewed by subagent Leibniz
  with score `88/100`.
- Roadmap/current-direction stale language check: active/pending state updated
  in `AGENTS.md`, `docs/STATUS.md`, and `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- Old experience retained / merged / retired / archive-only: recorded in
  `harness/evolution/proposals/20260623-post-real-ui-scheduler-window.md`.
