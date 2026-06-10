# Spec: Auto Evolve Harness Phase 8K 8O Boundary Evidence

## Goal

Handle the pending Harness evolution generated after Phase 8O and decide whether the Phase 8K-8O archive window requires a new reusable Harness rule.

## Users

- Future agents reading `AGENTS.md`, `docs/STATUS.md`, and ECL archive history.
- Maintainers relying on Harness evolution to separate real reusable process gaps from ordinary completed implementation phases.

## Acceptance Criteria

- AC-001: `harness/evolution/pending.md` is handled and removed by `mark-complete`.
- AC-002: Evolution proposal, review, validation notes, `results.tsv` row, and mark-complete evidence are recorded.
- AC-003: Result is `noop/dry_run` because subagent review is not explicitly authorized for this execution.
- AC-004: Docs end with active none, pending none, and latest Harness evolution pointing to this archived change.
- AC-005: No product code or runtime behavior changes are made.
- AC-006: `README.md` remains unrelated and untracked.
- AC-007: Harness verification passes, or any pre-existing failure is explicitly recorded.

## Non-Goals

- Add or modify runtime behavior, CLI commands, Workbench actions, HTTP routes, scheduler semantics, parallel execution, multi-Change automation, ODWF JavaScript runtime, or cache/replay.
- Continue product-code module splitting in this phase.
- Use subagent review without explicit user authorization.

## Constraints

- Follow `docs/ECL.md` controlled evolution rules: proposal, independent/dry-run review, validation, `results.tsv`, and `mark-complete`.
- Do not auto-apply Harness rule changes unless the archive evidence shows a concrete reusable gap.
- Do not stage or modify unrelated `README.md`.

## Risks

- False-positive process churn: adding a new Harness rule despite existing module-boundary and scoped-guard coverage.
- Handoff drift after `mark-complete`: docs must not continue to mention `harness/evolution/pending.md` as active.
- Confusing dry-run review with subagent review: the review must be explicit that no subagent was used.
