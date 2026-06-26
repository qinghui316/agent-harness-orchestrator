# Post Mode-Aware Loop Window Harness Evolution

## Window

Candidate archives from `harness/evolution/pending.md`:

- `harness/changes/archive/20260626-auto-evolve-post-integrationfix-apply-window/summary.md`
- `harness/changes/archive/20260626-workbench-integration-apply-outcome-completion-v1/summary.md`
- `harness/changes/archive/20260626-workbench-integration-applied-local-landing-close-real-ui-scout-v1/summary.md`
- `harness/changes/archive/20260626-workbench-local-landing-ready-terminal-close-v1/summary.md`
- `harness/changes/archive/20260626-workbench-mode-aware-local-goal-loop-v1/summary.md`

## Decision

Result: `docs_merge`.

No new ECL rule, review-template field, lint rule, or product runtime change is
warranted. The repeated lessons in this window are already covered by existing
ECL coverage:

- Workbench User-Surface Honesty: old/stale gates must not override the current
  authoritative `confirmationQueue.primary`.
- Scoped Workbench Action Payload Coverage: current gate target ids and
  selected Change scope must be revalidated.
- Source Apply Safety Coverage: source root mutation remains gated by explicit
  local apply authorization or human confirmation.
- Goal Loop Boundary Coverage: loop evidence is control context, not workflow
  truth or permission source.
- Module Boundary and Core Mechanism Reuse: product fixes should strengthen
  existing owners instead of adding local frameworks.
- Documentation Entropy and Experience Lifecycle: detailed run ids, ports,
  E-drive paths, patch hashes, and historical blockers stay archive-only.

The only durable change needed is compact current-doc alignment:

- `AGENTS.md`: reduce the current handoff ledger to current active/pending
  state, latest product/evolution pointers, and compact baseline.
- `docs/STATUS.md`: remove duplicated old evolution resume blocks and point to
  the active evolution change.
- `docs/CURRENT-DEVELOPMENT-PLAN.md`: replace stale `Pending Harness evolution:
  none` and old latest-product pointers with the active evolution and current
  mode-aware loop baseline.

## Independent Review

Subagent: Aquinas.

Recommendation: `docs_merge`.

Score: `86/100`.

Rationale: existing Harness rules already cover the product lessons; current
doc drift and duplicate handoff history are the real issue. Aquinas
recommended no new rule/template/lint/product runtime changes, plus compact
alignment of `AGENTS.md`, `docs/STATUS.md`, and
`docs/CURRENT-DEVELOPMENT-PLAN.md`.

## Experience Retention Scan

- Promote: none. No repeated uncovered failure justifies a new ECL/template
  rule or lint check.
- Retain: plan confirmation remains human; raw scheduler actions, manual
  IntegrationCheck, integration apply/discard, PR/remote/merge, and Harness
  evolution remain outside scoped `完全访问权限`.
- Merge: recent integration-apply outcome, local terminal, and mode-aware loop
  details are merged into one compact current Workbench loop baseline in
  current docs.
- Retire: stale current-doc claims that pending evolution was absent or that
  `workbench-local-landing-ready-terminal-close-v1` was still the latest
  product change.
- Archive-only: E-drive sandbox paths, ports, patch hashes, gate sequences,
  browser connector failures, and old blocker narratives.

## Validation

Required validation:

- `scripts/lint-ecl.ps1`
- `scripts/lint-encoding.ps1`
- `scripts/harness-change.ps1 reindex`
- `scripts/harness-change.ps1 status`
- `scripts/harness-evolve.ps1 mark-complete`
- `scripts/harness-evolve.ps1 check` after close/mark-complete state is
  aligned.
