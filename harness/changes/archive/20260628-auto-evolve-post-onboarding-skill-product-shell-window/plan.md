# Plan: auto-evolve-post-onboarding-skill-product-shell-window

## Approach

Treat this pending evolution as an evidence review, not a product change. The
candidate archives reinforce existing ECL coverage for reference-driven UI,
runtime bridge boundaries, proposal/runtime boundaries, Workbench user-surface
honesty, documentation entropy, and experience lifecycle. The implementation is
therefore to record a `noop` evolution and clear pending state.

## Steps

1. Write an evolution proposal under `harness/evolution/proposals/` with the
   candidate window, experience retention scan, independent review summary,
   rejected durable-change candidates, and no-op decision.
2. Fill the active change review with subagent evidence and scoring.
3. Run Harness validation checks.
4. Run `harness-evolve.ps1 mark-complete -Status noop -EvalMode subagent_review`.
5. Confirm `pending.md` is removed and `results.tsv` has the expected row.
6. Close the active change and update handoff pointers only.

## Decisions

- Result status: `noop`.
- Eval mode: `subagent_review`.
- Durable changes: none.
- Product/runtime changes: none.

## Minimality Gate Plan

- Can this be a no-op: yes; this is the selected outcome.
- Reuse: existing ECL review sections, `harness-evolve`, `results.tsv`, and
  archive summaries.
- Shared root fix: existing ECL coverage already addresses the repeated lessons.
- Avoided: new rules, templates, lint rules, UI/runtime code, and Skill changes.
- Smallest coherent change: proposal/review/results only.

## Module Boundary Plan

Not applicable. This change does not touch product modules or runtime owners.

## Core Mechanism Reuse Plan

- Existing mechanisms reused: Harness evolution proposal, independent review,
  results.tsv, `mark-complete`, handoff pointer alignment.
- No new mechanism proposed.

## Planning-Discovered Gaps

None. Four independent read-only checks agreed that no durable Harness delta is
justified.
