# Plan: auto-evolve-post-slash-skill-window

## Approach

Process the pending evolution as a docs/Harness-only structured change.
Evaluate the five archive summaries listed in `harness/evolution/pending.md`,
plus the latest slash-skill review evidence, against current ECL rules and
handoff docs.

Expected decision before subagent review: existing ECL reference-driven UI
coverage appears sufficient; a narrow `docs_merge` may be needed for stale
pending/latest wording in current docs.

## Steps

1. Read context in required order and inspect pending archive summaries.
2. Spawn an authorized subagent for independent recommendation and score.
3. Write an evolution proposal with an Experience Retention Scan.
4. Apply only a narrow docs merge if current handoff drift is confirmed.
5. Record the subagent result in `reviews/review.md` and the proposal.
6. Run Harness checks, then `harness-evolve mark-complete`.
7. Close the change and git-settle excluding unrelated `README.md`,
   `reference-projects/`, and pre-existing unrelated `package.json` changes.

## Decisions

- Treat the window as process/documentation evolution, not product work.
- Do not add another reference-driven UI rule unless the independent review
  identifies a concrete gap beyond the existing ECL/review-template coverage.
- Fix only current-state contradictions that affect the next agent's decisions.

## Minimality Gate Plan

- Can this be a no-op: yes, if subagent review confirms existing ECL/template
  coverage and current docs are consistent.
- Reuse: existing `harness-evolve`, `results.tsv`, proposal format, ECL
  reference-driven coverage, and documentation entropy rules.
- Shared root fix: inspect AGENTS / STATUS / CURRENT pending/latest wording
  rather than editing archive summaries.
- Avoided: no new lint rule, no new template field, no product runtime, no new
  reference-project tracking mechanism.
- Smallest coherent change: proposal + result row + mark-complete, plus a
  compact docs merge only for confirmed current-doc drift.

## Module Boundary Plan

- Owner module: not applicable; docs/Harness evolution only.
- New / moved responsibilities: none.
- Facade touch points: not applicable.
- Forbidden write-back locations: product source, Workbench runtime, Codex
  bridge, reference-project source, package metadata unrelated to this change.
- Compatibility surface: ECL lifecycle and current handoff docs remain
  compatible.
- Boundary tests: Harness lint/status/evolve checks.
- Follow-up split candidates: none.
- If not applicable, reason: no product module changes.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: ECL reference-driven UI coverage,
  documentation entropy coverage, Experience Lifecycle scan, subagent review,
  `harness-evolve mark-complete`.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no
  new mechanism is currently proposed.
- Domain-specific logic location: archived proposal and review only.
- Shared cross-cutting logic location: existing ECL and review template.
- Local framework / state machine / projection / validation / gate avoided: all
  avoided.
- Future-cost reduction for similar features: prevents duplicate reference UI
  rules and keeps pending/latest handoff consistent.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

- `docs/CURRENT-DEVELOPMENT-PLAN.md` currently says both
  `Pending Harness evolution: harness/evolution/pending.md` and later
  `Pending evolution: none`; this needs a narrow docs merge if confirmed after
  subagent review.
