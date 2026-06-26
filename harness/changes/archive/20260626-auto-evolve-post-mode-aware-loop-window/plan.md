# Plan: auto-evolve-post-mode-aware-loop-window

## Approach

Treat this as a Harness maintenance change. Read the pending window, compare
the archive lessons with existing ECL/template/handoff rules, request an
independent subagent review, and apply only the smallest evidence-backed
delta. The expected outcome is `noop` unless the evidence shows a repeated gap
that current rules do not already cover.

## Steps

1. Read the pending window and five candidate archive summaries.
2. Compare candidate lessons against existing ECL sections for Workbench user
   surface honesty, scoped payloads, source safety, Goal Loop boundary,
   module boundary, core mechanism reuse, documentation entropy, and
   experience lifecycle.
3. Ask the authorized subagent for an independent recommendation and score.
4. Write an evolution proposal with Experience Retention Scan.
5. If no durable rule/doc/template/lint delta is warranted, record `noop`;
   otherwise apply the smallest docs/Harness delta and verify it.
6. Run Harness verification, `mark-complete`, close the change, and git
   settle while excluding unrelated `README.md`.

## Decisions

- Decision: no product runtime change is allowed in this evolution.
- Decision: detailed E-drive run ids, gate sequences, and browser connector
  failures remain archive-only unless they reveal a repeated process-rule gap.
- Decision: existing current docs may be compactly aligned if needed, but
  should not receive expanded history.

## Minimality Gate Plan

- Can this be a no-op: yes; `noop` is preferred unless evidence proves a
  missing current rule.
- Reuse: existing ECL review coverage and Harness evolution scripts.
- Shared root fix: compare repeated issues against current ECL before adding
  any new rule.
- Avoided: product runtime changes, new templates, new lint, and broad current
  doc expansion unless proven necessary.
- Smallest coherent change: proposal + subagent review + results row +
  `mark-complete`; docs change only if alignment requires it.

## Module Boundary Plan

- Owner module: not applicable.
- New / moved responsibilities: none.
- Facade touch points: none.
- Forbidden write-back locations: product runtime, Workbench code, scheduler
  code, and broad handoff history sections.
- Compatibility surface: Harness evolution files and ECL lifecycle only.
- Boundary tests: Harness lint/check commands.
- Follow-up split candidates: none.
- If not applicable, reason: this is a Harness evidence review, not product
  implementation.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: `harness-evolve`,
  `harness-change`, `results.tsv`, proposal files, ECL review sections.
- Why existing mechanisms are insufficient if a new mechanism is proposed:
  no new mechanism proposed.
- Domain-specific logic location: proposal scan only.
- Shared cross-cutting logic location: existing ECL rules.
- Local framework / state machine / projection / validation / gate avoided:
  yes.
- Future-cost reduction for similar features: prevents repeated promotion of
  already-covered Workbench lessons into new rules.

## Planning-Discovered Gaps

None.
