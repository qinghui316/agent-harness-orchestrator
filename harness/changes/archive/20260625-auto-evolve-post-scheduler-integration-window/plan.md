# Plan: auto-evolve-post-scheduler-integration-window

## Approach

Treat this as a bounded Harness evolution pass. Review the five archive
summaries, compare them against existing ECL/template/current-doc rules, request
independent subagent review, then record the smallest evidence-backed result.
The expected result is `noop` or `docs_merge` unless the review identifies a
real uncovered ECL/template/lint gap.

## Steps

1. Read pending archive summaries and current handoff/ECL rules.
2. Create an evolution proposal under `harness/evolution/proposals/`.
3. Include Experience Retention Scan decisions for each repeated lesson.
4. Incorporate the authorized subagent's independent review/scoring.
5. Run Harness validation and mark the pending evolution complete.
6. Update compact handoff docs and close the active change.

## Decisions

- Current evidence points to product follow-up, not Harness expansion:
  planning/decomposition honesty and external-local restore are product
  blockers, while source safety, scoped automation, scheduler non-authority,
  Workbench honesty, and documentation entropy are already covered by current
  ECL/review-template rules.
- Raw scheduler actions, integration apply/discard, and Harness evolution remain
  human-gated; no product runtime change belongs in this evolution.

## Module Boundary Plan

- Owner module: not applicable.
- New / moved responsibilities: none.
- Facade touch points: none.
- Forbidden write-back locations: product runtime, Workbench action handlers,
  scheduler runtime, automation runtime.
- Compatibility surface: Harness evolution records and handoff docs only.
- Boundary tests: Harness lint/status/evolve checks.
- Follow-up split candidates: none.
- If not applicable, reason: this change evaluates Harness process evidence and
  does not add product code.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: `harness/evolution/pending.md`,
  proposal files, `results.tsv`, `harness-evolve mark-complete`,
  documentation entropy and experience lifecycle rules.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no
  new mechanism is proposed.
- Domain-specific logic location: not applicable.
- Shared cross-cutting logic location: existing ECL/Harness evolution rules.
- Local framework / state machine / projection / validation / gate avoided:
  no new evolution framework or product executor.
- Future-cost reduction for similar features: keeps one-off product blockers in
  current plan/archives instead of promoting them into permanent process.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

- The archive window repeatedly points to product next work:
  Workbench external-local restore and planning/decomposition scope honesty.
  These should remain product backlog candidates, not Harness evolution runtime
  changes.

