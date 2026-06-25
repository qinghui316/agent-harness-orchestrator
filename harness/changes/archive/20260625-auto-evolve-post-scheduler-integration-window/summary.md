# auto-evolve-post-scheduler-integration-window

## Purpose

Handle the pending Harness evolution window generated after the scheduler
reachability, worker, IntegrationCheck, and apply/discard acceptance sequence.
The goal is to decide whether the latest five archives justify a durable ECL
rule, review-template update, lint rule, documentation merge, or product
runtime follow-up.

This is Harness evolution maintenance, not product runtime work.

## Scope

In scope:

- Read the pending archive window and current handoff/ECL rules.
- Produce an evolution proposal with an Experience Retention Scan.
- Use the user-authorized subagent for independent review/scoring.
- Record one evolution result, run `harness-evolve mark-complete`, and clear
  `harness/evolution/pending.md`.
- Update compact handoff docs if the active/pending/latest evolution state
  changes.

Out of scope:

- Product runtime or Workbench behavior changes.
- New scheduler permissions, automatic apply/close/merge, remote landing,
  Harness evolution apply, full parallel executor, scheduler loop, or workflow
  runtime.
- Copying detailed E-drive sandbox/run histories from archives into current
  docs.
- Hand-editing generated `harness/changes/INDEX.json`.

## Current Status

Completed.

## Verification

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
  passed before `mark-complete`.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status`
  passed before `mark-complete` with active change aligned and incomplete tasks
  only.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 mark-complete -Status docs_merge -EvalMode subagent_review ...`
  passed and cleared `harness/evolution/pending.md`.
- Final closeout checks passed before close: `lint-ecl`, `lint-encoding`,
  `harness-change reindex`, `harness-change status`, and
  `harness-evolve check`.

## Acceptance Feedback

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: user authorized subagent use for
  pending evolution.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: applicable for proposal, evolution records, and
  close/handoff docs.
- Experience lifecycle result: `docs_merge`; no ECL/template/lint/product
  runtime change.
- Roadmap/current-direction stale language check: active/pending/current-doc
  pointers aligned.
- Old experience retained / merged / retired / archive-only: recorded in
  `harness/evolution/proposals/20260625-post-scheduler-integration-window-docs-merge.md`.

