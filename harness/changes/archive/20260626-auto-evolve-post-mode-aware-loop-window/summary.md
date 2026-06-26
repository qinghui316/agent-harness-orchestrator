# auto-evolve-post-mode-aware-loop-window

## Purpose

Handle the pending Harness evolution window generated after
`workbench-mode-aware-local-goal-loop-v1`. The task is to evaluate the five
candidate archives for durable Harness changes and finish the evolution
lifecycle with proposal, independent review, results row, and mark-complete.

The result is `docs_merge`: no new ECL rule, review-template field, lint rule,
product runtime behavior, or Workbench capability was warranted. The useful
delta was compact current-doc alignment.

## Scope

In scope:

- Review the pending five-archive window and existing ECL/template coverage.
- Use the authorized subagent for independent review and scoring.
- Write an evolution proposal with Experience Retention Scan.
- Apply compact current-doc alignment in `AGENTS.md`, `docs/STATUS.md`, and
  `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- Record a `results.tsv` row and run `harness-evolve mark-complete`.

Out of scope:

- Product runtime, Workbench, scheduler, automation, IntegrationCheck, or
  IntegrationFix changes.
- New ECL/template/lint rules without repeated uncovered evidence.
- Copying E-drive sandbox paths, run ids, patch hashes, browser connector
  failures, or gate sequences into current docs.

## Current Status

Completed / ready to close.

## Verification

- Evolution decision: `docs_merge`.
- Proposal:
  `harness/evolution/proposals/20260626-post-mode-aware-loop-window-docs-merge.md`.
- Independent review: subagent `Aquinas`, recommendation `docs_merge`, score
  `86/100`.
- `harness-evolve mark-complete`: passed; `pending.md` removed,
  `state.json` advanced to archive count `492`, and `results.tsv` recorded a
  `docs_merge` row with `eval_mode = subagent_review`.
- Durable changes: compact current-doc alignment only. No ECL rule,
  review-template field, lint rule, or product runtime change.

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status` - passed; close-ready with only closeout task pending before this update.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: user explicitly authorized subagent
  use for pending Harness evolution.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: not applicable.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: completed for `AGENTS.md`, `docs/STATUS.md`,
  and `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- Experience lifecycle result: `docs_merge`.
- Roadmap/current-direction stale language check: fixed stale pending/latest
  product language in `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- Old experience retained / merged / retired / archive-only: recorded in the
  proposal; detailed sandbox/run/gate evidence remains archive-only.
