# Plan: Auto Evolve Harness Phase 12O-12S Product Maintenance Evidence

## Approach

Use the pending evolution archives as evidence, classify lessons through the Experience Lifecycle, and apply only the smallest durable current-doc correction. The expected result is `keep / independent_review`: keep minimal handoff/current-plan drift corrections, retain existing generic Harness rules, and leave detailed Phase 12O-12S implementation history archive-only.

## Steps

1. Review the five candidate archive summaries named by `harness/evolution/pending.md`.
2. Write an evolution proposal under `harness/evolution/proposals/` with candidate evidence, recommendation, boundaries, and Experience Retention Scan.
3. Update handoff/current-plan docs only where stale current state changes future agent decisions.
4. Record independent review evidence from the subagent plan review and implementation close-ready review.
5. Run Harness verification and stale-current-state checks.
6. Run `scripts/harness-evolve.ps1 mark-complete -Status keep -EvalMode independent_review`.
7. Close the active ECL change after the pending evolution is complete and handoff docs are aligned.

## Decisions

- Use `keep / independent_review` because this run keeps minimal current-doc drift corrections.
- Promote no new generic Harness rule: existing Documentation Entropy, Experience Lifecycle, Close/Handoff Drift, Module Boundary, Proposal/Runtime Boundary, Scoped Workbench Action Payload, Read Model Projection, and ToolPolicy/human-gate rules already cover the lessons.
- Retain conservative product-maintenance boundaries as current guidance and product tests, not as a new runtime authority.
- Treat detailed Phase 12O-12S implementation facts as archive-only unless they change current routing decisions.

## Module Boundary Plan

- Owner module: not applicable for runtime code; this is Harness evolution documentation/evidence.
- New / moved responsibilities: no product module responsibilities added or moved.
- Facade touch points: none.
- Forbidden write-back locations: source runtime, stable memory, canonical docs, ECL rules/templates, and `README.md`.
- Compatibility surface: Harness evolution files, handoff docs, and current-plan wording only.
- Boundary tests: Harness lint, encoding lint, status/evolution checks, and stale-current-state searches.
- Follow-up split candidates: none.
- If not applicable, reason: no Workbench action execution, projections, runtime services, frontend panels, typed workflow artifacts, or cross-module workflow state are added or changed.

## Planning-Discovered Gaps

- Subagent review found that `docs/CURRENT-DEVELOPMENT-PLAN.md` still said post-Phase-12R/no pending and treated canonical patch application as wholly missing. This plan includes a minimal correction.
