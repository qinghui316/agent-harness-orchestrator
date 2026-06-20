# Spec: Auto-Evolve Harness Controlled Scheduler Continuation Window Noop

## Goal

Evaluate the pending Harness evolution window for five controlled Scheduler archive changes and decide whether any durable Harness rule, template, lint, script, handoff, or current-doc delta is warranted.

## Users

- Primary: future agents relying on ECL and review templates to continue controlled Scheduler / Goal Loop work without bypassing stale-target, human-gate, or workflow-truth boundaries.
- Secondary: maintainers who need Harness evolution to remember repeated lessons without growing current docs unnecessarily.

## Acceptance Criteria

- AC-001: The five candidate archives from `harness/evolution/pending.md` are reviewed against current ECL/review-template coverage.
- AC-002: A proposal records the recommendation, independent review evidence, and Experience Retention Scan.
- AC-003: If no new rule/template/lint/docs delta is justified, the result is recorded as `noop / independent_review` rather than adding duplicate process text.
- AC-004: `scripts/harness-evolve.ps1 mark-complete` appends the results row and removes `harness/evolution/pending.md`; no manual duplicate results row is written.
- AC-005: Validation and handoff docs confirm no pending evolution remains and no stale closed active change path remains current.

## Non-Goals

- Product code or runtime behavior changes.
- New Scheduler, Goal Loop, Workbench, ToolPolicy, source apply, close, merge, IntegrationCheck, remote, or Harness automation behavior.
- Broad documentation compression or ECL rule rewriting.
- Turning phase-specific controlled Scheduler details into current docs.

## Constraints

- Auto-evolve starts from archived evidence and must use proposal, independent review, validation, results logging, and mark-complete.
- Current docs remain compact derived memory; detailed history stays in archive summaries and `harness/changes/INDEX.json`.
- A noop result is valid only after Experience Retention Scan classifies relevant lessons.

## Risks

- Adding another narrow rule could duplicate existing ECL coverage and increase process drag.
- Marking noop without naming retained/archive-only lessons would weaken Harness evolution memory.
- Manually editing `results.tsv` in addition to `mark-complete` would duplicate results.
- Forgetting handoff repair after mark-complete would leave stale active/pending state in current docs.
