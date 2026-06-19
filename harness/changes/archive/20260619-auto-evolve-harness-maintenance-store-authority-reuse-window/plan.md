# Plan: auto-evolve-harness-maintenance-store-authority-reuse-window

## Approach

Treat the pending window as a Harness evolution evaluation, not as product implementation. The candidate archives repeat a known pattern: move local maintenance behavior into existing owner modules and preserve workflow truth/human gates. Existing ECL rules already name this pattern, so the planned outcome is `keep / independent_review` unless validation reveals a missing durable rule.

## Steps

1. Read `harness/evolution/pending.md`, candidate archive summaries, existing ECL rules, and recent results.
2. Obtain independent subagent evaluation before applying any evolution decision.
3. Write an evolution proposal under `harness/evolution/proposals/`.
4. Record review, Experience Retention Scan, and result rationale in active change review.
5. Run Harness checks and `harness-evolve mark-complete -Status keep -EvalMode independent_review`.
6. Confirm pending evolution is removed, close/archive, update handoff docs, and commit.

## Decisions

- Proposed result: `keep`.
- Eval mode: `independent_review`.
- Durable Harness delta: none.
- Rationale: ECL 13.6, 13.7, 15, 16, and 17 already cover module ownership, core mechanism reuse, controlled evolution, documentation entropy, and experience lifecycle.

## Module Boundary Plan

- Owner module: Harness evolution evidence under `harness/evolution/` plus ECL change files.
- New / moved responsibilities: none; this is evaluation and result recording.
- Facade touch points: none.
- Forbidden write-back locations: product source, Workbench, bridge/frontend, manager facades, ECL rules/templates, and current docs except minimal handoff updates.
- Compatibility surface: pending evolution lifecycle and `results.tsv` format.
- Boundary tests: Harness lint/status/evolve checks.
- Follow-up split candidates: none.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: Harness evolution proposal/review/results flow.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new mechanism is proposed.
- Domain-specific logic location: candidate archive examples remain archive-only.
- Shared cross-cutting logic location: existing ECL Core Mechanism Reuse and Module Boundary rules.
- Local framework / state machine / projection / validation / gate avoided: avoids creating another narrow helper-specific Harness rule.
- Future-cost reduction for similar features: reinforces that repeated convergence windows should first check existing reusable rules before adding docs.

## Planning-Discovered Gaps

- Subagent independent review returned PASS for `keep / independent_review`; no missing Harness rule/template/lint/product runtime change found.
