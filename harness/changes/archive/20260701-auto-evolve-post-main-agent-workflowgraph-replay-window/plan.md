# Plan: auto-evolve-post-main-agent-workflowgraph-replay-window

## Approach

Review the five candidate archives as an experience-retention window. Compare
their retained lessons against existing ECL and architecture boundary
documents. If coverage is already durable and general, close as `noop`; if a
missing durable rule is found, propose the smallest rule or template change.

## Steps

1. Read `harness/evolution/pending.md` and the candidate archive summaries.
2. Check current durable rules in `docs/ECL.md`, `docs/BOUNDARIES.md`,
   `docs/AGENT-MODEL.md`, and `docs/STATUS.md`.
3. Record local proposal and independent subagent review.
4. If no durable gap is found, run `scripts/harness-evolve.ps1 mark-complete`
   with `noop / subagent_review`.
5. Run Harness checks and close the evolution change.

## Working Decision

No-op is the selected result. The candidate archives reinforce existing durable
rules:

- Main-agent / WorkflowGraph / replay evidence is not workflow truth.
- Proposal/runtime and replay/projection boundaries must fail closed and not
  execute by themselves.
- Canonical managers remain current-state authority; old jsonl evidence is
  historical explanation.
- Module owners should retire old facades without creating duplicate truth.
- Documentation entropy should keep implementation details archive-only.
- Harness evolution requires proposal, review, validation, and explicit result
  logging.

## Minimality Gate Plan

- Can this be a no-op: yes; independent review found no missing durable rule.
- Reuse: existing ECL, BOUNDARIES, AGENT-MODEL, and STATUS coverage.
- Shared root fix: avoid adding per-archive rules for one migration window.
- Avoided: no product code, UI, template, runtime, or ECL rule changes.
- Smallest coherent change: mark pending evolution complete with review
  evidence.

## Module Boundary Plan

- Owner module: not applicable; no product module changes.
- New / moved responsibilities: none.
- Facade touch points: none.
- Forbidden write-back locations: product source, Workbench UI, runtime owners,
  scheduler, apply/close, and Harness templates/rules.
- Compatibility surface: unchanged.
- Boundary tests: Harness lint/status/evolve checks only.
- Follow-up split candidates: none.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: controlled Harness evolution
  process, ECL rule coverage, documentation entropy, and archive summaries.
- Why existing mechanisms are insufficient if a new mechanism is proposed: not
  applicable.
- Domain-specific logic location: not applicable.
- Shared cross-cutting logic location: existing docs remain sufficient.
- Local framework / state machine / projection / validation / gate avoided: no
  new rule or runtime layer.
- Future-cost reduction for similar features: no extra rule surface for future
  agents to maintain.

## Planning-Discovered Gaps

None.
