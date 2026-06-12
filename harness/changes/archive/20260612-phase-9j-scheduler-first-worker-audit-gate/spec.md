# Spec: Phase 9J Scheduler First Worker Audit Gate

## Goal

Add a scoped audit gate for the first scheduler worker path. After Phase 9I validation passes, a user-confirmed Workbench action should run one audit against the same worker worktree, bind it to the exact scheduler validation evidence, and write scheduler-owned audit evidence.

## Users

- Developers using Workbench to supervise the first controlled scheduler worker slice.
- Future scheduler runtime implementers who need durable, scoped evidence before allowing rework or next-worker execution.

## Acceptance Criteria

- AC-001: Docs and active change record Phase 9I archived and Phase 9J active.
- AC-002: `planning.scheduler.worker.audit-first` requires `changeId + schedulerRunId + schedulerWorkerValidationId`.
- AC-003: The action accepts only `SchedulerRuntimeWorkerValidation(status="passed")`.
- AC-004: Audit runs on the same worktree as the scheduler worker and binds to the exact validation run recorded by Phase 9I.
- AC-005: Unrelated generic validation/audit evidence is not auto-bound into scheduler audit.
- AC-006: Audit `approved` / `approved-with-notes` writes scheduler audit evidence and marks the TaskRun `completed`.
- AC-007: Audit `blocked` / `failed` writes scheduler audit evidence and marks the TaskRun `blocked`.
- AC-008: Repeated audit for the same WorkerValidation returns existing scheduler-owned evidence without rerunning.
- AC-009: Forged, stale, cross-Change, cross-run, wrong-worktree, wrong-code-gate, or mismatched TaskRun/WorkerLease evidence fails closed.
- AC-010: Workbench shows the audit gate after passed validation and does not expose rework, next-worker, whole-wave, slot, lease, apply, or merge controls.
- AC-011: New scheduler runtime modules do not depend on Workbench/server/web/CLI broad facades.
- AC-012: No full parallel executor, scheduler loop, slot allocator, child Change, new worktree, new coder run, apply, integration check, PR, or merge behavior is introduced.

## Non-Goals

- No bounded rework.
- No second worker or whole-wave execution.
- No scheduler loop or slot allocator.
- No new public CLI/API route.
- No public Audit artifact shape change.

## Constraints

- `SchedulerRuntimeWorkerAudit` is scheduler-owned evidence, not workflow truth.
- Existing Run/Audit artifacts remain the independent audit evidence source.
- AHO workflow truth remains Change/ECL, accepted artifacts, Run/Validation/Audit, Apply/Close human gates.
- Main implementation must live in `src/scheduler-runtime/worker-audit.ts`.

## Risks

- Risk: generic audit selection by worktree could accidentally bind unrelated evidence. Mitigation: pass and verify the exact validation run id.
- Risk: TaskRun state could be completed without scheduler audit evidence. Mitigation: fail closed if TaskRun is already completed and no scheduler-owned audit exists.
- Risk: Workbench could expose next-worker or rework too early. Mitigation: tests cover confirmation queue and first-screen projection.
