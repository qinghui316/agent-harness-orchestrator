# Plan: Auto Evolve Harness Post Real UI Scheduler Window

## Approach

Use the current auto-evolve path: refresh index, evaluate the pending archive
window, write a proposal, request read-only independent subagent review, apply
only a compact accepted delta, validate Harness docs/templates, run
`harness-evolve mark-complete`, then close the active change.

## Steps

1. Read the pending archive summaries, prior auto-evolve result, current
   `docs/ECL.md`, and review template.
2. Write `harness/evolution/proposals/20260623-post-real-ui-scheduler-window.md`
   with accepted/rejected candidates, score, and Experience Retention Scan.
3. Promote only the narrow Workbench primary-surface alignment prompt into the
   existing ECL Workbench User-Surface Honesty rule and review template.
4. Record independent subagent review and adjust the proposal/delta if it
   identifies a stronger decision.
5. Run Harness validation and `harness-evolve mark-complete`.
6. Update handoff docs, close/archive the change, reindex, and commit.

## Decisions

- Decision: `template_update` candidate. The repeated lesson is not "add more
  automation"; it is "future Workbench decision-surface changes must prove the
  authoritative current gate is aligned across the confirmation queue,
  decision inspector, and visible primary card."
- Decision: retain existing no-fake real Codex, external sandbox, source apply
  safety, aggregate timeout split-evidence, Goal Loop, Scheduler, ToolPolicy,
  and human-gate rules without duplicating them.

## Module Boundary Plan

- Owner module: not applicable; Harness docs/templates only.
- New / moved responsibilities: not applicable.
- Facade touch points: not applicable.
- Forbidden write-back locations: product runtime/source modules; archive
  history; generated index by hand.
- Compatibility surface: ECL/review-template wording remains additive and
  does not change product APIs.
- Boundary tests: Harness lint and encoding lint.
- Follow-up split candidates: none.
- If not applicable, reason: no product modules are added or changed.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: Controlled Evolution,
  Experience Lifecycle, Workbench User-Surface Honesty, Read Model Projection,
  Scoped Workbench Action Payload, Documentation Entropy, and Close/Handoff
  Drift coverage.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no
  new mechanism proposed; only two compact prompts are added to existing
  mechanisms.
- Domain-specific logic location: not applicable.
- Shared cross-cutting logic location: `docs/ECL.md` and
  `harness/templates/change/reviews/review.md`.
- Local framework / state machine / projection / validation / gate avoided: no
  new local Harness framework or product gate.
- Future-cost reduction for similar features: future Workbench projection/UI
  changes get an explicit primary-surface alignment checklist before close.
- If not applicable, reason: not applicable because reuse coverage applies.

## Planning-Discovered Gaps

None.
