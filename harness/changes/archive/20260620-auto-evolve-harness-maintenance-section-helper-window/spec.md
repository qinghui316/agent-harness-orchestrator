# Spec: auto-evolve-harness-maintenance-section-helper-window

## Goal

Evaluate the pending Harness evolution evidence window and decide whether current Harness rules, templates, or docs need a small evidence-backed update.

## Users

- Future agents using AHO's ECL/Harness workflow.
- Maintainers relying on compact current docs rather than archive-ledger accumulation.

## Acceptance Criteria

- AC-001: The five candidate archive summaries are reviewed against current ECL, Architecture Growth Control, Documentation Entropy, Experience Lifecycle, and Workbench test-strategy rules.
- AC-002: A proposal records a keep/change/noop decision with an Experience Retention Scan.
- AC-003: Independent review evaluates the proposal before `mark-complete`.
- AC-004: `harness/evolution/results.tsv` records the result and pending evolution is cleared.
- AC-005: Active ECL, handoff docs, and Harness checks are close-ready without promoting archive narrative into current docs.

## Non-Goals

- Product source, Workbench runtime, scheduler, Goal Loop, ToolPolicyGate, human gates, ECL rule/template/lint changes unless the evidence shows a real reusable gap.
- Copying detailed phase narratives into `AGENTS.md`, `docs/STATUS.md`, `docs/ECL.md`, or `docs/CURRENT-DEVELOPMENT-PLAN.md`.

## Constraints

- Follow Controlled Evolution: evidence, proposal, independent review, validation, results row, and `mark-complete`.
- Treat `harness/evolution/pending.md` as a trigger snapshot; verify against current archive evidence.
- Keep current docs compact; use archive summaries for historical detail.

## Risks

- Over-promoting repeated implementation examples could make current docs grow append-only.
- Marking keep without an Experience Retention Scan would violate current ECL.
- Forgetting `mark-complete` would leave pending evolution and block final handoff/git.
