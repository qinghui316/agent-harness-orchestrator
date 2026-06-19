# Plan: Auto-evolve Harness Helper Reuse Window

## Approach

Evaluate the candidate archives as a helper-reuse evidence window. Record a
`keep` proposal because current rules already cover the repeated lesson, then
complete the pending evolution machinery without changing product runtime or
Harness rules.

## Steps

1. Record the independent subagent recommendation and proposal.
2. Update active handoff to this auto-evolve change and record stale handoff as
   Documentation Entropy / Close-Handoff Drift evidence.
3. Validate ECL, encoding, reindex, and evolution state.
4. Run `scripts/harness-evolve.ps1 mark-complete -Status keep -EvalMode independent_review`.
5. Mark tasks/review close-ready, close the change, update final handoff, and
   rerun validation.

## Decisions

- Recommendation: `keep`.
- No ECL/template/lint/doc expansion is proposed because the repeated lessons
  merge into existing Core Mechanism Reuse and Module Boundary rules.
- `README.md` remains unrelated/untracked.

## Module Boundary Plan

- Owner module: not applicable; this auto-evolve evaluates process evidence and
  does not add product modules.
- New / moved responsibilities: none.
- Facade touch points: none.
- Forbidden write-back locations: product runtime modules, Workbench, Scheduler,
  Goal Loop, ToolPolicyGate, human gates, source root, reference projects, and
  `README.md`.
- Compatibility surface: Harness evolution files, active/STATUS handoff, and
  ECL close behavior.
- Boundary tests: Harness lint/status/evolution checks.
- Follow-up split candidates: none.
- If not applicable, reason: no product module behavior changes.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: current Harness evolution flow,
  Documentation Entropy, Experience Lifecycle, Module Boundary, and Core
  Mechanism Reuse rules.
- Why existing mechanisms are insufficient if a new mechanism is proposed: not
  applicable; no new mechanism is proposed.
- Domain-specific logic location: not applicable.
- Shared cross-cutting logic location: existing `docs/ECL.md` rules and change
  review templates remain the durable process owners.
- Local framework / state machine / projection / validation / gate avoided:
  avoids turning each helper-reuse example into a new narrow Harness rule.
- Future-cost reduction for similar features: future agents can continue using
  the current general reuse/ownership rules without reading duplicated
  implementation-specific current-doc text.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

None yet.
