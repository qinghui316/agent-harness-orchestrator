# Harness Evolution Proposal: post-slash-skill window

## Decision

`docs_merge`

## Window

Triggered by `harness/evolution/pending.md` after 5 archived changes since the
last completed evolution:

- `20260627-auto-evolve-post-desktop-product-entry-window`
- `20260627-workbench-harness-composer-execution-mode-controls-v1`
- `20260627-workbench-reference-style-workspace-picker-and-session-sidebar-v1`
- `20260627-workbench-reference-style-skills-catalog-and-codex-bridge-v1`
- `20260627-workbench-reference-style-slash-skill-composer-v1`

## Evidence

- The previous evolution already promoted the key durable rule: reference-style
  UI/product changes must cite reference map/source evidence and prove copied
  controls are real, hidden, or truthfully unavailable.
- The slash Skill composer review applied that rule successfully. It cited
  `desktop-cc-gui` composer source files, exposed only real scanned Skills,
  showed unsynced Skills as `需要同步`, omitted fake marketplace/provider/file
  controls, and kept Skill as runtime capability rather than Harness workflow
  truth.
- Skills / Codex bridge authority is already covered by ECL runtime bridge
  boundary coverage.
- Fake-control prevention is already covered by Workbench user-surface honesty
  and reference-driven source evidence coverage.
- No candidate archive shows a repeated failure that is not already covered by
  ECL, review template, or current product boundaries.
- Current docs did contain handoff entropy:
  - `docs/CURRENT-DEVELOPMENT-PLAN.md` said both pending evolution existed and
    later that pending evolution was none.
  - `docs/STATUS.md` had become an archive-like ledger instead of a short
    resume point.
  - `AGENTS.md` was above the preferred mature-harness line budget.

## Independent Review

Subagent `Singer` recommendation: `docs_merge`.

Score: `82/100`.

Key findings:

- Existing ECL coverage is sufficient for reference-aligned UI/source evidence,
  runtime bridge boundaries, fake-control/user-surface honesty, and core
  mechanism reuse.
- The latest slash-skill review applied those rules correctly.
- No new durable ECL/template/lint/product rule is justified.
- Minimal docs merge should align pending evolution state and compress current
  handoff docs.

## Experience Retention Scan

- Promote: none. No new ECL, template, lint, or product-runtime rule is
  justified.
- Retain: current ECL reference-driven source evidence, Workbench
  user-surface honesty, runtime bridge, module boundary, core mechanism reuse,
  and documentation entropy rules.
- Merge: compact duplicated current-state/product-closeout wording in
  `AGENTS.md`, `docs/STATUS.md`, and `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- Retire: stale `Pending evolution: none` wording in
  `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- Archive-only: screenshot paths, E-drive acceptance paths, ports, per-run ids,
  individual product closeout narratives, and detailed reference-source
  inspection notes.

## Applied Delta

- Compressed `docs/STATUS.md` into a short current handoff: active change,
  pending evolution, latest product closeout, current baseline, next resume
  point, verification commands, and archive lookup.
- Trimmed `AGENTS.md` current handoff by removing redundant previous archive
  pointers and merging detailed real acceptance bullets.
- Updated `docs/CURRENT-DEVELOPMENT-PLAN.md` current Harness evolution state to
  name `harness/evolution/pending.md` and the active evolution change.

## Non-Changes

- No product code change.
- No Workbench UI / Codex bridge / Skills runtime change.
- No ECL rule or review-template addition.
- No lint rule addition.
- No reference source tracking or vendoring.

## Verification Plan

- `scripts/lint-ecl.ps1`
- `scripts/lint-encoding.ps1`
- `scripts/harness-change.ps1 reindex`
- `scripts/harness-change.ps1 status`
- `scripts/harness-evolve.ps1 mark-complete -Status docs_merge -EvalMode subagent_review`
- `scripts/harness-evolve.ps1 check`
