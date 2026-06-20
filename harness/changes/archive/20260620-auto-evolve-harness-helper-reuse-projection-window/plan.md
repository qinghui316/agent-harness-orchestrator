# Plan: auto-evolve-harness-helper-reuse-projection-window

## Approach

Create a keep proposal for the helper/projection reuse window. The proposal will explicitly retain existing rules and archive specific implementation details rather than adding a new rule. Apply only the narrow documentation entropy fix found during review: demote stale `Latest product` archive lookup labels in `docs/STATUS.md`.

## Steps

1. Write `harness/evolution/proposals/20260620-helper-reuse-projection-window-keep.md`.
2. Update the active change review with the independent subagent approval.
3. Fix stale `docs/STATUS.md` archive lookup labels from `Latest product` to `Previous product`.
4. Run Harness checks.
5. Run `harness-evolve.ps1 mark-complete -Status keep -EvalMode independent_review`.
6. Update `AGENTS.md` and `docs/STATUS.md` after pending is removed and close/archive this auto-evolve change.

## Decisions

- Proposed result: `keep / independent_review`.
- No new rule/template/lint/product runtime change.
- `docs/CURRENT-DEVELOPMENT-PLAN.md` does not need edits for this window.

## Module Boundary Plan

- Owner module: not applicable for product code; this is Harness evolution evidence.
- New / moved responsibilities: none.
- Facade touch points: none.
- Forbidden write-back locations: product source, Workbench runtime, scheduler runtime, Goal Loop runtime, ToolPolicyGate, and human-gate implementations.
- Compatibility surface: Harness lifecycle files, `AGENTS.md`, `docs/STATUS.md`, evolution proposal/results/state.
- Boundary tests: Harness lint/status/evolve checks.
- Follow-up split candidates: none.
- If not applicable, reason: no product module boundary changes.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: existing Harness evolution proposal/results flow; existing ECL rules for Core Mechanism Reuse, Module Boundary, Documentation Entropy, Experience Lifecycle, targeted verification, workflow truth, ToolPolicyGate, and human gates.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new mechanism is proposed.
- Domain-specific logic location: archive summaries and proposal narrative.
- Shared cross-cutting logic location: existing ECL rules and review template fields.
- Local framework / state machine / projection / validation / gate avoided: avoids adding another helper-specific Harness rule.
- Future-cost reduction for similar features: keeps helper/projection details archive-only while current rules stay compact and general.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

- Independent review found stale `Latest product` labels in `docs/STATUS.md` Archive Lookup that should be demoted to avoid stale history posing as current state.
