# Plan: auto-evolve-post-goal-loop-decision-surface-window

## Approach

Treat the pending window as a Harness evolution maintenance pass. Read the five
candidate archives, compare them against existing ECL/template/current-doc
rules, write a proposal, request independent subagent scoring, then apply only
the smallest justified delta.

Subagent review recommends `noop` with score 89. The mainline plan follows that
recommendation: do not change product runtime, ECL, templates, lint, or current
docs beyond the required lifecycle state updates after `mark-complete`.

## Steps

1. Read pending evolution, candidate summaries, current handoff docs, and ECL
   evolution rules.
2. Write an evolution proposal with an Experience Retention Scan.
3. Record independent subagent review/scoring.
4. Run `harness-evolve mark-complete -Status noop -EvalMode subagent_review`.
5. Update compact handoff docs to clear pending evolution and name the latest
   completed Harness evolution.
6. Run Harness verification, close the active change, and git settle.

## Decisions

- Use `noop` because the useful lessons are already covered by current
  ECL/template/handoff rules.
- Do not add new rules for external-local restore; that was a product
  entrypoint/projection fix.
- Do not add new rules for Goal Loop decision-surface non-authority; existing
  Goal Loop boundary and Workbench honesty rules already cover it.
- Do not add another minimality rule; the minimality docs change already
  promoted that lesson.

## Minimality Gate Plan

- Can this be a no-op: yes for durable rules/docs; no-op still requires
  proposal, result row, and `mark-complete`.
- Reuse: existing `harness-evolve`, proposal directory, `results.tsv`, ECL
  Experience Lifecycle, Documentation Entropy, Minimality Gate, and close
  handoff rules.
- Shared root fix: current rules already cover the repeated lessons; no shared
  lint/template gap found.
- Avoided: new ECL section, new review field, new lint rule, product runtime
  change, new evidence family, and archive-ledger copying.
- Smallest coherent change: proposal + no-op result + compact lifecycle
  handoff alignment.

## Module Boundary Plan

- Owner module: not applicable for product modules; Harness evolution uses
  `harness/evolution/*` and current handoff docs.
- New / moved responsibilities: none.
- Facade touch points: not applicable.
- Forbidden write-back locations: product source/runtime, Workbench owners, and
  generated `harness/changes/INDEX.json` manual edits.
- Compatibility surface: ECL lifecycle and handoff docs remain compatible.
- Boundary tests: Harness lint/status checks.
- Follow-up split candidates: none.
- If not applicable, reason: not applicable; this pass has no product module
  ownership change.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: controlled evolution proposal,
  `results.tsv`, `mark-complete`, Documentation Entropy, Experience Lifecycle,
  Minimality Gate, and close/handoff drift coverage.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no
  new mechanism proposed.
- Domain-specific logic location: not applicable.
- Shared cross-cutting logic location: existing ECL rules.
- Local framework / state machine / projection / validation / gate avoided:
  no new product or Harness framework.
- Future-cost reduction for similar features: avoids repeating rules after
  evidence shows current rules are sufficient.
- If not applicable, reason: not applicable; this is a Harness evolution pass.

## Planning-Discovered Gaps

None yet.

