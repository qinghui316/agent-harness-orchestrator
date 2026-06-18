# Spec: auto-evolve-harness-source-convergence-architecture-growth-control

## Goal

Complete the pending Harness evolution generated after the maintenance/canonical source-convergence archive threshold and decide whether current Harness rules need a durable update.

## Users

- Future AHO agents reading current Harness rules and handoff docs.
- Maintainers deciding whether repeated source-convergence lessons should become rules, templates, lint checks, or archive-only evidence.

## Acceptance Criteria

- AC-001: The evolution proposal reviews the pending trigger snapshot and later relevant source-convergence archives, not only the stale trigger list.
- AC-002: The proposal includes an Experience Retention Scan covering Promote, Retain, Merge, Retire, and Archive-only decisions, including stale-memory checks across current docs/templates.
- AC-003: Independent review or scoring evaluates the proposal before any `keep` result is recorded.
- AC-004: If no uncovered repeated gap is found, no new ECL rule/template/lint/product-runtime change is made.
- AC-005: `harness/evolution/results.tsv`, `harness/evolution/state.json`, and `harness/evolution/pending.md` are updated only through `scripts/harness-evolve.ps1 mark-complete`.
- AC-006: Final handoff docs show no active change, no pending evolution, the latest product archive, the latest Harness evolution archive, and the next resume point consistently.
- AC-007: Harness verification passes.

## Non-Goals

- Do not implement product runtime, Workbench, Goal Loop, Scheduler, source apply, canonical rewrite, or reference-project behavior.
- Do not add rules, templates, lints, or current-doc prose unless the evidence shows an uncovered repeated gap.
- Do not duplicate detailed archive narratives into `AGENTS.md`, `docs/STATUS.md`, `docs/ECL.md`, templates, or roadmap docs.
- Do not hand-edit generated `harness/changes/INDEX.json`.

## Constraints

- Pending evolution is a maintenance reminder, not workflow truth.
- Acting on pending evolution requires proposal, independent review, validation, results logging, and `mark-complete`.
- `mark-complete` is the only in-scope writer for clearing `harness/evolution/pending.md` and updating `harness/evolution/state.json`.
- Current AHO workflow truth remains Change/ECL, accepted artifacts, Run, Validation, Audit, IntegrationCheck, Apply/Close human gates, and Harness evolution records.
- `README.md` remains unrelated and untracked.

## Risks

- Treating the pending trigger snapshot as the entire evidence window could miss later source-convergence lessons.
- Adding another overlapping rule could worsen documentation entropy instead of improving future agent behavior.
- Recording `keep` without independent review would violate the Harness evolution rule.
- Closing without final handoff correction would leave active/pending drift for the next agent.

