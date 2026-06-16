# Spec: Auto Evolve Harness Phase 10R 10V Goal Loop Gate Evidence

## Goal

Evaluate whether the Phase 10R-10V Goal Loop controller/gate evidence work exposed a reusable Harness rule, template, or lint gap.

Default expected outcome is `noop/subagent_review`: current Goal Loop Boundary, Module Boundary, Runtime Bridge Boundary, ToolPolicy/human gate, workflow-truth, and documentation entropy rules already cover this pattern unless review finds a specific missing constraint.

## Users

- Future agents working on Goal Loop and Workbench gate evidence.
- AHO maintainers who need Harness evolution results to be explicit and auditable.

## Acceptance Criteria

- AC-001: `harness/evolution/pending.md` is handled through a structured ECL change and removed by `mark-complete`.
- AC-002: Evolution proposal records the Phase 10R-10V review window and recommendation.
- AC-003: Independent subagent review records recommendation, score, scope, and limitations.
- AC-004: Result is `noop/subagent_review` unless a concrete uncovered Harness rule gap is found.
- AC-005: No product code, runtime behavior, Workbench action, route, CLI command, UI, scheduler execution, source mutation, or artifact shape changes are introduced.
- AC-006: Handoff docs end with active change none, pending Harness evolution none, and latest Harness evolution pointing to this archive.
- AC-007: Harness verification passes.
- AC-008: `README.md` remains unrelated and untracked.

## Non-Goals

- Do not add a new Goal Loop product feature.
- Do not change `src/` product code.
- Do not add a new Harness lint/template rule unless review finds a concrete gap.
- Do not re-open Phase 10R-10V implementation details outside the evolution review.

## Constraints

- Use subagent review because pending evolution handling is authorized by the active goal.
- Treat reference projects as evidence only.
- Keep current handoff docs compact; archived summaries own historical detail.

## Risks

- Overfitting risk: adding a new ECL rule for every Goal Loop phase would increase Harness noise without improving safety.
- Underfitting risk: if preflight/gate evidence created a new execution-authority ambiguity, it should be captured in ECL now.
- Handoff drift risk: closing 10V created pending evolution and active state changes that must be reflected before git.
