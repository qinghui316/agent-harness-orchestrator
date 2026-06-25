# auto-evolve-post-integrationfix-apply-window

## Purpose

Handle the pending Harness evolution generated after the five-archive window
ending with `workbench-repaired-integration-apply-real-ui-acceptance-v1`.

The window is evaluated for durable ECL, review-template, lint, current-doc, or
product-runtime changes. The expected bar is high: promote only a repeated,
current, mechanically useful lesson that is not already covered by existing
Source Apply Safety, Workbench User-Surface Honesty, Scoped Workbench Action
Payload, Module Boundary, Core Mechanism Reuse, Documentation Entropy, or
Experience Lifecycle rules.

## Scope

In scope:

- Read `harness/evolution/pending.md`, the five candidate archive summaries,
  relevant ECL rules, current handoff docs, and prior evolution results.
- Produce a proposal with an Experience Retention Scan.
- Use the authorized subagent for independent review and scoring only.
- Record a `results.tsv` row and clear `pending.md` with
  `scripts/harness-evolve.ps1 mark-complete`.
- Apply at most compact handoff/doc alignment if the scan proves it is needed.

Out of scope:

- Product runtime or Workbench behavior changes.
- New scheduler, IntegrationCheck, IntegrationFix, automation, or Workbench
  capabilities.
- New ECL/template/lint rules unless the evidence is repeated and not already
  covered.
- Copying E-drive sandbox paths, run ids, or detailed repair narratives into
  current handoff docs.

## Current Status

Completed / Ready to close.

## Verification

Evolution decision: `noop`.

- Proposal: `harness/evolution/proposals/20260626-post-integrationfix-apply-window-noop.md`.
- Independent review: subagent `Leibniz`, recommendation `noop`, score
  `91/100`.
- `harness-evolve mark-complete` result: `pending.md` removed,
  `state.json` advanced to archive count `487`, and `results.tsv` recorded a
  `noop` row with `eval_mode = subagent_review`.
- Durable changes: no ECL rule, review-template field, lint rule, product
  runtime, or broad handoff-history expansion.

Final Harness checks pending.

## Acceptance Feedback

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
  `docs/CURRENT-DEVELOPMENT-PLAN.md`, `docs/ECL.md`, and review-template state.
- Experience lifecycle result: `noop`.
- Roadmap/current-direction stale language check: active closeout state aligned;
  final archive handoff will be written after close.
- Old experience retained / merged / retired / archive-only: recorded in the
  proposal and review; detailed sandbox/run/click evidence remains
  archive-only.
