# Plan: auto-evolve-post-desktop-product-entry-window

## Approach

Run this as a compact Harness evolution. Review the five archive summaries,
inspect the `desktop-cc-gui` reference map and relevant source controls, record
the subagent score, add the smallest semantic ECL/template coverage needed for
reference-driven UI changes, align stale handoff wording, validate, mark the
pending evolution complete, and close/archive this change.

## Steps

1. Review candidate archives and current reference-source rules.
2. Inspect relevant `desktop-cc-gui` source controls that drove the recent
   product-surface correction.
3. Record an Experience Retention Scan and decision in an evolution proposal.
4. Use the authorized subagent review as independent scoring evidence.
5. Add compact ECL and review-template coverage for reference-driven UI/source
   evidence.
6. Align current handoff docs and avoid archive-ledger expansion.
7. Run Harness validation and `harness-evolve mark-complete`.
8. Close/archive and git-settle while excluding unrelated `README.md`.

## Decisions

- Decision target: `ecl_update`.
- Add one semantic review coverage section rather than a lint rule because the
  failure mode is interaction-level source evidence, not mechanically greppable
  text.
- Keep existing Workbench user-surface honesty rules; the new rule plugs the
  narrower gap of conceptual reference alignment without source-backed
  interaction evidence.

## Minimality Gate Plan

- Can this be a no-op: checked and rejected because pending evolution exists
  and subagent review identified a real ECL/template gap.
- Reuse: existing pending evolution, proposal/result ledger, reference-source
  rules, and Workbench user-surface honesty coverage.
- Shared root fix: strengthen ECL/template coverage instead of adding
  product-specific handoff prose only.
- Avoided: product runtime change, UI change, lint rule, new framework, and
  tracked reference source.
- Smallest coherent change: one ECL paragraph, one review-template section,
  one proposal/result, and compact handoff alignment.

## Module Boundary Plan

- Owner module: not applicable; this is Harness evolution documentation state.
- New / moved responsibilities: none.
- Facade touch points: none.
- Forbidden write-back locations: product runtime, Workbench UI code,
  reference source directories, and generated `harness/changes/INDEX.json`.
- Compatibility surface: existing ECL and evolution scripts.
- Boundary tests: Harness lint, encoding lint, reindex/status, evolve check.
- Follow-up split candidates: none.
- If not applicable, reason: no product module responsibility changes.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: pending evolution, proposal,
  `results.tsv`, subagent review evidence, ECL reference rules, and review
  template coverage.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no
  new mechanism proposed.
- Domain-specific logic location: future product-layer implementation remains
  in Workbench product changes.
- Shared cross-cutting logic location: ECL/review template.
- Local framework / state machine / projection / validation / gate avoided:
  all avoided.
- Future-cost reduction for similar features: future agents get a mandatory
  prompt to cite reference source evidence and prove controls are real before
  shipping UI.
- If not applicable, reason: no product mechanism changes.

## Planning-Discovered Gaps

Subagent review identified a gap not fully covered by existing rules:
reference-driven UI work can satisfy broad user-surface honesty yet still fail
by relying on screenshots or conceptual maps instead of interaction-level
source evidence.
