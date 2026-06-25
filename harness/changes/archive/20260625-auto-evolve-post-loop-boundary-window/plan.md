# Plan: auto-evolve-post-loop-boundary-window

## Approach

Treat the pending window as a Harness maintenance change. Read the archive
summaries and current docs, ask a subagent for independent scoring, then choose
the smallest result:

- `noop` when current rules and handoff docs are already sufficient.
- `docs_merge` when current docs contain contradictory active/pending/current
  state or need a compact alignment update.
- Template/ECL/lint update only if the window exposes a repeated gap that is
  not already covered by existing rules.

## Steps

1. Read pending evolution, candidate archive summaries, current ECL rules, and
   handoff docs.
2. Create an evolution proposal with evidence summary and Experience Retention
   Scan.
3. Record independent subagent review/scoring.
4. Apply the minimum current-doc merge if drift is found.
5. Run Harness checks and `harness-evolve mark-complete`.
6. Close the active change, update handoff docs, reindex, and git settle.

## Decisions

- Candidate durable lessons are already mostly covered by ECL: plan
  confirmation is human-only, scoped automation stays current-Change bound,
  Harness evolution is human-gated, and docs must stay compact.
- A current-doc drift was found in `docs/CURRENT-DEVELOPMENT-PLAN.md`: the
  document says a pending evolution exists near the active direction, but a
  later "Latest evolution" block still says current pending evolution is none.
  This supports a small docs merge unless subagent review identifies a stronger
  rule change.

## Minimality Gate Plan

- Can this be a no-op: yes if subagent review finds no handoff drift or
  durable rule delta.
- Reuse: existing evolution proposal/results flow, ECL Controlled Evolution,
  Documentation Entropy, and Experience Lifecycle rules.
- Shared root fix: current-doc state alignment is checked across `AGENTS.md`,
  `docs/STATUS.md`, and `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- Avoided: product runtime changes, new templates, new lint, new evolution
  state machine, and archive-history duplication.
- Smallest coherent change: proposal/result plus one compact current-doc merge
  if needed.

## Module Boundary Plan

- Owner module: not applicable.
- New / moved responsibilities: not applicable.
- Facade touch points: not applicable.
- Forbidden write-back locations: no product/runtime/facade files should be touched.
- Compatibility surface: current Harness lifecycle and handoff docs remain compatible.
- Boundary tests: Harness lint/status checks are sufficient.
- Follow-up split candidates: none.
- If not applicable, reason: Harness evolution docs/results change only; no
  product module or runtime owner changes.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: ECL controlled evolution,
  documentation entropy, experience lifecycle, proposal/result logs, and
  `harness-evolve mark-complete`.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no
  new mechanism is currently proposed.
- Domain-specific logic location: not applicable.
- Shared cross-cutting logic location: docs/ECL already owns reusable rules.
- Local framework / state machine / projection / validation / gate avoided:
  avoided all new product/runtime/evolution machinery.
- Future-cost reduction for similar features: prevents repeated current-doc
  pending-state drift without adding new process layers.
- If not applicable, reason: applicable as Harness architecture growth control.

## Planning-Discovered Gaps

None yet.

