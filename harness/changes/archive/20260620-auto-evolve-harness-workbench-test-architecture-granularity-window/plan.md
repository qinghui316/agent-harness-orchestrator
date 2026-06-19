# Plan: Auto Evolve Harness Workbench Test Architecture Granularity Window

## Approach

Review the pending evolution window as Harness process evidence, not product implementation scope. The candidate summaries already reinforce existing core-reuse and test-architecture convergence rules. The only new actionable lesson is phase granularity for future Workbench test splits: when boundaries are already clear, prefer one complete capability domain or a small group of adjacent domains rather than a very small 10-test slice.

Plan outcome: create a keep proposal, record independent review, run Harness checks, mark evolution complete, then update handoff docs to no-active/no-pending.

## Steps

1. Review `harness/evolution/pending.md` and the five candidate archive summaries.
2. Ask a subagent to review this evolution plan before writing the proposal/results.
3. Write `harness/evolution/proposals/20260620-workbench-test-architecture-granularity-window-keep.md`.
4. Record independent review in this change's `reviews/review.md`.
5. Run Harness checks and `scripts/harness-evolve.ps1 mark-complete -Status keep -EvalMode independent_review`.
6. Update `AGENTS.md` and `docs/STATUS.md` to no active change / no pending evolution after the evolution closes.
7. Reindex, run final status/evolution checks, and close this ECL change.

## Decisions

- Tentative decision: `keep`. Existing Harness rules are sufficient; record the Workbench test-architecture granularity lesson without new rules/templates/lint/product changes.
- The lesson belongs in the evolution proposal, review, active summary, and final handoff's next-resume wording, not in a long current-doc history section.

## Module Boundary Plan

- Owner module: not applicable.
- New / moved responsibilities: none.
- Facade touch points: none.
- Forbidden write-back locations: product runtime/source modules, Workbench runtime code, bridge/front-end glue, ECL rule templates unless independently justified.
- Compatibility surface: existing Harness evolution files and handoff docs only.
- Boundary tests: Harness lint/status/evolution checks.
- Follow-up split candidates: none.
- If not applicable, reason: this change records Harness evolution evidence and does not add product modules.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: Harness evolution pending/proposal/results flow, ECL structured change, Documentation Entropy, Experience Lifecycle, Architecture Growth Control/Core Mechanism Reuse.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new mechanism proposed.
- Domain-specific logic location: Workbench test-architecture lesson stays in the evolution record and next-resume guidance.
- Shared cross-cutting logic location: existing Harness evolution record flow.
- Local framework / state machine / projection / validation / gate avoided: no new local framework, state machine, projection, validation system, or gate.
- Future-cost reduction for similar features: future test convergence should use appropriately sized capability-domain slices to reduce ECL overhead while preserving closeability.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

- None blocking.
