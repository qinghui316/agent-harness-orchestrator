# Spec: Auto Evolve Harness Phase 9R 9V Scheduler Integration Apply Evidence

## Goal

Evaluate whether the Phase 9R-9V scheduler integration/apply evidence window reveals a durable Harness rule gap. The evaluation must be evidence-backed, independently reviewed by a subagent, and completed through `harness-evolve mark-complete`.

## Users

- Future AHO agents relying on Harness rules to avoid unsafe scheduler/apply boundaries.
- Maintainers deciding whether product guard fixes should become process rules.

## Acceptance Criteria

- AC-001: `harness/evolution/pending.md` is handled and removed by `mark-complete`.
- AC-002: Evolution proposal records the Phase 9R-9V review window and the noop/modify rationale.
- AC-003: Independent subagent review records recommendation, score, limitations, and evidence considered.
- AC-004: Results are logged in `harness/evolution/results.tsv`.
- AC-005: Docs end with active change none, pending evolution none, latest product Phase 9V archived, and latest Harness evolution pointing to this archived change.
- AC-006: No product runtime or behavior changes are introduced.
- AC-007: Harness verification passes.

## Non-Goals

- Do not modify product code.
- Do not add scheduler/apply features, runtime behavior, Workbench actions, routes, CLI commands, UI, or parallel execution.
- Do not add heuristic lint based only on file size or subjective complexity.

## Constraints

- AHO workflow truth remains Change/ECL, accepted artifacts, Run/Validation/Audit, IntegrationCheck, apply/close human gates, and audited evidence.
- If the review recommends `modify`, apply only the smallest rule/template/lint delta that is directly supported by the reviewed archive evidence.
- `README.md` remains unrelated and untracked.

## Risks

- Overfitting one product guard fix into permanent process could make future work slower without improving safety.
- Failing to complete `mark-complete` would leave stale pending maintenance for the next agent.
