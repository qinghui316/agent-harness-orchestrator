# auto-evolve-post-desktop-product-entry-window

## Purpose

Handle the pending Harness evolution window generated after the desktop product
entry and `desktop-cc-gui` reference-policy work. The candidate archives provide
evidence that product-layer reference projects must be read as source evidence,
that local reference clones must stay out of Git, and that Workbench UI must not
show reference-style controls until the behavior is implemented.

Decision: `ecl_update`.

## Scope

In scope:

- Review the five pending archive summaries.
- Use the authorized subagent review as independent scoring evidence.
- Write an evolution proposal with an Experience Retention Scan.
- Add compact ECL/review-template coverage for reference-driven UI/source
  evidence.
- Align current handoff docs and mark pending evolution complete.

Out of scope:

- Product runtime, Workbench UI, Codex bridge, scheduler, automation, apply,
  close, or reference-source changes.
- New lint rule or product capability.
- Promoting detailed screenshot paths, E-drive run ids, ports, or
  reference-source excerpts into current entry docs beyond compact guidance.

## Current Status

Completed.

## Verification

- Proposal:
  `harness/evolution/proposals/20260627-post-desktop-product-entry-window-ecl-update.md`.
- Independent review: subagent `Huygens`, recommendation `ecl_update`, score
  `84/100`.
- `harness-evolve mark-complete`: passed; `pending.md` removed, `state.json`
  advanced, and `results.tsv` recorded an `ecl_update` row with
  `eval_mode = subagent_review`.
- Final Harness validation:
  - `scripts/lint-ecl.ps1` - passed.
  - `scripts/lint-encoding.ps1` - passed.
  - `scripts/harness-change.ps1 reindex` - passed.
  - `scripts/harness-change.ps1 status` - passed; no active change.
  - `scripts/harness-evolve.ps1 check` - passed; no pending evolution.

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

- Documentation entropy check: applicable for compact handoff alignment in
  `AGENTS.md`, `docs/STATUS.md`, and `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- Experience lifecycle result: `ecl_update`.
- Roadmap/current-direction stale language check: stale lower-section
  `docs/STATUS.md` pending/latest wording aligned during closeout.
- Old experience retained / merged / retired / archive-only: recorded in the
  proposal; detailed archive evidence remains archive-only.

