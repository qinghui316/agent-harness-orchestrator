# auto-evolve-post-transcript-window

## Purpose

Handle the pending Harness evolution window generated after the transcript
virtualization closeout. The window has strong evidence around local Goal Loop
acceptance, scheduler handoff/terminal acceptance, and transcript performance,
but it does not expose a new uncovered ECL/template/lint/product-runtime gap.

Decision: `docs_merge`.

## Scope

In scope:

- Review five pending archive summaries.
- Use authorized subagent review and score.
- Write an evolution proposal and Experience Retention Scan.
- Align compact current-state handoff docs.
- Record evolution result and mark pending complete.

Out of scope:

- Product runtime, Workbench, scheduler, automation, transcript, or
  IntegrationCheck changes.
- New ECL rule, review-template field, lint rule, or product capability.
- Promotion of detailed E-drive run ids, ports, patch hashes, or gate sequences
  into current docs.

## Current Status

Ready to close.

## Verification

- Proposal:
  `harness/evolution/proposals/20260626-post-transcript-window-docs-merge.md`.
- Independent review: subagent `Kuhn`, recommendation `docs_merge`, score
  `84/100`.
- `harness-evolve mark-complete`: passed; `pending.md` removed,
  `state.json` advanced, and `results.tsv` recorded a `docs_merge` row with
  `eval_mode = subagent_review`.
- Harness verification:
  - `scripts/lint-ecl.ps1` - pending final rerun after closeout updates.
  - `scripts/lint-encoding.ps1` - pending final rerun.
  - `scripts/harness-change.ps1 reindex/status` - pending final rerun.
  - `scripts/harness-evolve.ps1 check` - pending final rerun.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: user explicitly authorized subagent
  use for pending Harness evolution.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: in progress for `AGENTS.md`, `docs/STATUS.md`,
  and `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- Experience lifecycle result: `docs_merge`.
- Roadmap/current-direction stale language check: `docs/CURRENT-DEVELOPMENT-PLAN.md`
  had stale pending-evolution state; aligned during this change.
- Old experience retained / merged / retired / archive-only: recorded in the
  proposal; detailed real UI and sandbox evidence remains archive-only.

