# Plan: auto-evolve-post-main-agent-policy-bridge-window

## Approach

Treat the five pending archives as an experience-retention window. Compare
their retained lessons against existing durable rules. If current ECL and
boundary docs already cover the lessons, close as `noop`; if a durable gap is
found, propose only the smallest general rule.

## Steps

1. Read `harness/evolution/pending.md` and all candidate archive summaries.
2. Check current durable coverage in `docs/ECL.md`, `docs/BOUNDARIES.md`,
   `AGENTS.md`, and `docs/STATUS.md`.
3. Record local proposal and independent subagent review.
4. Run `scripts/harness-evolve.ps1 mark-complete` with the selected result.
5. Run Harness checks and close the evolution change.

## Working Decision

No-op is the selected result. The candidate archives reinforce existing
durable rules:

- Replay, policy, Goal Loop, bridge, and graph observations are
  non-executing evidence or projections unless a later accepted change
  explicitly promotes a gated runtime path.
- Proposal/runtime boundaries require stale, forged, draft, superseded, or
  cross-change targets to fail closed before canonical transitions.
- Canonical managers remain current-state authority; historical JSONL and
  replay summaries can explain but cannot override workflow truth.
- Action bridge evidence may only validate explicit existing gates and must
  not create actions, mutate confirmation queues, or bypass ToolPolicy/human
  gates.
- Documentation entropy and experience lifecycle rules already require
  implementation details to remain archive-only.
- Controlled Harness evolution already requires proposal, review, validation,
  result logging, and explicit `mark-complete`.

## Minimality Gate Plan

- Can this be a no-op: yes; both local review and subagent review found no
  missing durable rule.
- Reuse: existing ECL proposal/runtime, module-boundary, core-mechanism,
  controlled-evolution, documentation-entropy, and experience-lifecycle rules.
- Shared root fix: no shared product root cause exists; pending is maintenance
  review of archive evidence.
- Avoided: no per-helper rules, no template expansion, no runtime owner, no
  Workbench UI, no action bridge changes.
- Smallest coherent change: mark pending evolution complete with review
  evidence.

## Module Boundary Plan

- Owner module: not applicable; no product module changes.
- New / moved responsibilities: none.
- Facade touch points: none.
- Forbidden write-back locations: product source, Workbench UI, runtime owners,
  scheduler, apply/close, Harness templates, and ECL rules.
- Compatibility surface: unchanged.
- Boundary tests: Harness lint/status/evolve checks only.
- Follow-up split candidates: none.
- If not applicable, reason: this is a no-op Harness evolution closeout.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: controlled Harness evolution,
  archive summaries, ECL proposal/runtime boundary, module boundary,
  documentation entropy, and experience lifecycle.
- Why existing mechanisms are insufficient if a new mechanism is proposed: not
  applicable.
- Domain-specific logic location: not applicable.
- Shared cross-cutting logic location: existing docs remain sufficient.
- Local framework / state machine / projection / validation / gate avoided: no
  new mechanism.
- Future-cost reduction for similar features: avoids adding narrow rules tied
  to one implementation window.

## Planning-Discovered Gaps

None.
