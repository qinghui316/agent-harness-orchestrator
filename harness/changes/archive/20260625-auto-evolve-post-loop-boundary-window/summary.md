# auto-evolve-post-loop-boundary-window

## Purpose

Handle the pending Harness evolution window generated after five archived
changes ending with `workbench-loop-per-change-boundary-guard-v1`.

The window is evaluated for durable ECL/template/lint/current-doc/product
runtime changes. The expected result is either a small `docs_merge` for current
handoff drift or a `noop` if independent review finds no durable delta.

## Scope

In scope:

- Read the pending evolution file, current Harness rules, handoff docs, and
  candidate archive summaries.
- Produce an evolution proposal with an Experience Retention Scan.
- Use an authorized subagent for independent review and scoring.
- Record the terminal result in `harness/evolution/results.tsv` and clear
  `harness/evolution/pending.md` with `harness-evolve mark-complete`.
- Apply only the smallest current-doc cleanup if the pending window exposes
  handoff drift.

Out of scope:

- Product runtime or Workbench behavior changes.
- New ECL rules, lint rules, review-template fields, or automation behavior
  unless the archive evidence proves a repeated process gap.
- Copying detailed real UI paths, run ids, retries, or historical narratives
  into current handoff docs.
- Auto-applying future Harness evolution without human gate.

## Current Status

Completed and archived.

## Verification

Passed:

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 mark-complete -Status docs_merge -EvalMode subagent_review ...`

Product tests were not required because this change touched Harness
proposal/result/handoff docs only.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: completed for `AGENTS.md`, `docs/STATUS.md`,
  `docs/CURRENT-DEVELOPMENT-PLAN.md`, and `docs/ECL.md`.
- Experience lifecycle result: `docs_merge`; no ECL/template/lint/product
  runtime change.
- Roadmap/current-direction stale language check: pending state drift was
  merged into current docs.
- Old experience retained / merged / retired / archive-only: recorded in
  `harness/evolution/proposals/20260625-post-loop-boundary-window-docs-merge.md`.

