# Auto Evolve Proposal: Phase 9N-9R Scheduler Integration Evidence

## Window

Reviewed archived changes:

- `harness/changes/archive/20260612-phase-9n-scheduler-first-worker-rework-validation-gate/summary.md`
- `harness/changes/archive/20260612-phase-9o-scheduler-first-worker-rework-audit-gate/summary.md`
- `harness/changes/archive/20260613-phase-9p-scheduler-worker-integration-candidate-bridge/summary.md`
- `harness/changes/archive/20260613-phase-9q-scheduler-integrationcheck-handoff/summary.md`
- `harness/changes/archive/20260613-phase-9r-scheduler-integration-outcome-bridge/summary.md`

## Recommendation

Status: `modify`

EvalMode: `subagent_review`

Add narrow Harness template/lint coverage. Do not add a new broad scheduler, workflow-truth, non-execution, or IntegrationCheck authority rule.

## Rationale

The reviewed product boundaries are mostly sound:

- Scheduler worker and rework artifacts remain scheduler-owned evidence, not workflow truth.
- Rework validation/audit stay scoped to the same worker worktree and exact validation/audit lineage.
- Scheduler integration candidates do not run IntegrationCheck or apply source-root changes.
- Scheduler IntegrationCheck handoff delegates to the existing IntegrationCheck engine instead of creating a second engine.
- Scheduler integration outcome records only IntegrationCheck terminal/applied/discarded results and preserves existing IntegrationCheck apply/discard as the only source-root mutation gate.
- Future feature module-boundary rules already require owned modules and forbid writing main implementation logic back into broad facades.

The subagent review identified two targeted Harness gaps:

1. `docs/ECL.md` already has Source Apply Safety Acceptance, but the review template did not have a dedicated section for recording source-root mutation gate evidence or non-applicability.
2. Archived reviews could retain stale closeout text such as `Status: in progress`, `Verification Pending`, or unresolved implementation findings after a change was closed.

## Changes

- Add `Source Apply Safety Coverage` to `harness/templates/change/reviews/review.md`.
- Update `docs/ECL.md` to require source apply safety coverage in `reviews/review.md` and to document stale closeout lint coverage.
- Extend `scripts/lint-ecl.ps1` so archived reviews, and close-ready active reviews, cannot retain stale status, pending verification, or unresolved implementation finding text.
- Repair stale closeout text in the archived Phase 9Q review.

## Non-Goals

- No product code changes.
- No scheduler runtime behavior changes.
- No Workbench action, HTTP route, CLI command, UI, IntegrationCheck, apply/discard, landing, PR, merge, scheduler execution, parallel executor, child Change, ODWF runtime, or cache/replay behavior.

## Validation Plan

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status`

## Follow-Up

No product-code follow-up is required from this evolution. Future source-root apply or IntegrationCheck boundary changes should fill the new `Source Apply Safety Coverage` section explicitly.
