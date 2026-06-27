# auto-evolve-post-codex-model-picker-window

## Purpose

Handle the pending Harness evolution window generated after the Codex runtime
model picker archive. The window checks whether the recent reference-style
file reference, right tool rail, and Codex model picker work requires new
durable Harness rules.

Decision: `docs_merge`.

## Scope

In scope:

- Review the five candidate archive summaries from `harness/evolution/pending.md`.
- Use the authorized subagent review as independent scoring evidence.
- Write an evolution proposal with an Experience Retention Scan.
- Apply only compact current-doc/template alignment justified by evidence.
- Record `results.tsv`, mark the pending evolution complete, and close.

Out of scope:

- Product runtime, Workbench UI behavior, Codex bridge, Skills, file
  references, Scheduler, automation, apply/close, remote, merge, PR, or
  Harness evolution product changes.
- New lint rules or broad ECL rules.
- Promoting screenshots, E-drive run ids, ports, raw stderr, or detailed
  archive narratives into current docs.

## Current Status

Completed.

## Verification

Completed:

- Proposal:
  `harness/evolution/proposals/20260627-post-codex-model-picker-window-docs-merge.md`.
- Independent review: subagent `Helmholtz`, recommendation `Merge`, score
  `84/100`.
- `scripts/lint-ecl.ps1` - passed.
- `scripts/lint-encoding.ps1` - passed.
- `scripts/harness-change.ps1 status` - passed with incomplete tasks before
  mark-complete, as expected.
- `scripts/harness-evolve.ps1 mark-complete -Status docs_merge -EvalMode subagent_review`
  - passed; `pending.md` removed and `results.tsv` recorded a `docs_merge`
  row.

Final closeout validation:

- `scripts/harness-change.ps1 reindex` - passed.
- `scripts/harness-change.ps1 status` - passed; active change none and
  STATUS aligned.
- `scripts/harness-evolve.ps1 check` - passed; no pending evolution, one
  archive since last completion.

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

- Documentation entropy check: applicable.
- Experience lifecycle result: `docs_merge`.
- Roadmap/current-direction stale language check:
  `docs/CURRENT-DEVELOPMENT-PLAN.md` pending/latest/current evolution wording
  aligned.
- Old experience retained / merged / retired / archive-only: recorded in the
  proposal. Detailed product closeout narratives, screenshots, E-drive paths,
  run ids, and raw runtime diagnostics remain archive-only.
