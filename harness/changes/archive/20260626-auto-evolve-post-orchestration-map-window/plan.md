# Plan: auto-evolve-post-orchestration-map-window

## Approach

Treat this as a Harness evolution closeout, not product work. Review the five
candidate summaries, classify lessons with Promote / Retain / Merge / Retire /
Archive-only, ask an authorized subagent for independent scoring, and apply
only the smallest current-doc alignment needed.

## Steps

1. Read the candidate archive summaries and current handoff docs.
2. Produce a proposal under `harness/evolution/proposals/`.
3. Record independent review in the active change review.
4. If no new durable rule is justified, perform compact docs-merge alignment
   only.
5. Run Harness checks, mark the evolution complete, close the active change,
   and git settle.

## Decisions

- Decision: `docs_merge`.
- Rationale: the window reinforces existing ECL rules for Workbench UI honesty,
  transcript source-boundary, documentation entropy, Experience Lifecycle, and
  real UI acceptance. The only durable current-doc need is handoff alignment.

## Minimality Gate Plan

- Can this be a no-op: no, because `pending.md` must be resolved with proposal,
  review, result, and `mark-complete`.
- Reuse: existing `harness-evolve.ps1`, `harness-change.ps1`, ECL docs, and
  current handoff files.
- Shared root fix: the root issue is pending/current-doc alignment; fix
  handoff pointers rather than adding product or template code.
- Avoided: new ECL rule, review-template field, lint, runtime behavior, or
  local framework.
- Smallest coherent change: proposal + docs-merge handoff alignment + results
  row.

## Module Boundary Plan

- Owner module: not applicable; docs/Harness evolution only.
- New / moved responsibilities: none.
- Facade touch points: not applicable.
- Forbidden write-back locations: product runtime, Workbench code, transcript
  code, scheduler code, and reference projects.
- Compatibility surface: `harness-evolve.ps1` results/state behavior remains
  unchanged.
- Boundary tests: Harness lint/check scripts.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: ECL pending evolution lifecycle,
  Experience Retention Scan, documentation entropy rules, and generated
  evolution state/results.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no
  new mechanism is proposed.
- Domain-specific logic location: archive summaries remain archive-only.
- Shared cross-cutting logic location: current handoff docs only carry compact
  baseline/routing facts.
- Local framework / state machine / projection / validation / gate avoided:
  all avoided.
- Future-cost reduction for similar features: keeps future agents from
  planning from stale pending/latest evolution state without growing ECL.

## Planning-Discovered Gaps

None.
