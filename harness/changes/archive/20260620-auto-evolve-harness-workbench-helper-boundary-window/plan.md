# Plan: auto-evolve-harness-workbench-helper-boundary-window

## Approach

Complete the pending evolution as a single bounded maintenance stage. Use the existing Harness evolution proposal/results flow, record the subagent approval, mark the evolution complete as `keep / independent_review`, and repair only handoff state drift. Do not add rules or product behavior unless evidence shows a real uncovered repeated lesson.

## Steps

1. Write `harness/evolution/proposals/20260620-workbench-helper-boundary-window-keep.md`.
2. Record the independent subagent approval in review evidence.
3. Run `harness-evolve.ps1 mark-complete -Status keep -EvalMode independent_review`.
4. Update `AGENTS.md` and `docs/STATUS.md` after pending is removed so final handoff points to no active change, no pending evolution, the latest product archive, and this Harness evolution archive.
5. Run Harness checks and close/archive the auto-evolve change.

## Decisions

- Proposed result: `keep / independent_review`.
- Durable rule change: none planned.
- Product source/package changes: none.
- Verification scope: Harness lifecycle and handoff checks only.

## Module Boundary Plan

- Owner module: Harness evolution evidence (`harness/evolution/proposals/`, `harness/evolution/results.tsv`, `harness/evolution/state.json`) and handoff docs.
- New / moved responsibilities: none.
- Facade touch points: none.
- Forbidden write-back locations: product source, Workbench runtime, scheduler runtime, Goal Loop runtime, ToolPolicyGate, human-gate implementations, package scripts, and unrelated `README.md`.
- Compatibility surface: Harness lifecycle files and handoff docs.
- Boundary tests: Harness lint/status/evolve checks.
- Follow-up split candidates: none.
- If not applicable, reason: no product module boundary changes.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: existing Harness evolution proposal/results flow; ECL rules for Core Mechanism Reuse, Module Boundary, Read Model Projection, targeted verification, Documentation Entropy, Experience Lifecycle, workflow truth, ToolPolicyGate, and human gates.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new mechanism is proposed.
- Domain-specific logic location: candidate archive summaries and this proposal.
- Shared cross-cutting logic location: existing `docs/ECL.md` rules.
- Local framework / state machine / projection / validation / gate avoided: avoids adding another helper-specific Harness rule or test-architecture phase.
- Future-cost reduction for similar features: clears pending evolution while preserving product-function-first momentum.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

- Subagent plan review returned `APPROVE` and specifically called out that `AGENTS.md` and `docs/STATUS.md` still pointed at the old product active change after close, so handoff cleanup is required.
