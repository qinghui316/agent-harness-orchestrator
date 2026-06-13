# Phase 9P Scheduler Worker Integration Candidate Bridge

## Purpose

Phase 9P bridges completed scheduler worker outputs back into the existing AHO multi-worktree integration safety chain. It compiles scheduler-owned `SchedulerIntegrationCandidate` evidence from scheduler worker audit or rework audit results, then re-runs the existing apply readiness gate for each candidate worktree before it can become a future IntegrationCheck target.

This phase does not start another worker, run IntegrationCheck, apply changes, merge branches, or create new execution state. The artifact is merge-preparation evidence only.

## Scope

In scope:

- Repair Phase 9O to Phase 9P handoff drift in AGENTS/status/runtime/workbench/boundary docs.
- Add scheduler-runtime owned `SchedulerIntegrationCandidate` schema, repository, renderer, compiler, facade export, and lazy projection support.
- Add Workbench action `planning.scheduler.integration-candidate.compile` requiring `changeId + schedulerRunId`.
- Accept only scheduler-owned audit `approved` / `approved-with-notes` outputs.
- Re-check every candidate worktree through `previewWorktreeApply()` and `classifyApplyReadiness()`.
- Preserve full scheduler/action/decision/audit scope ids.

Out of scope:

- Starting a next worker, whole wave, scheduler loop, slot allocator, or full parallel executor.
- Running Validation, Audit, bounded rework, IntegrationCheck, aggregate validation, or aggregate audit.
- Applying to source root, landing, Draft PR, PR review, remote merge, or branch cleanup.
- Creating WorkflowRun, TaskQueueRun, AgentTask, child Change, new worktree, new run, WorkerLease, WorkerSession, RuntimeWorkspace, or EventSource.

## Current Status

Completed.

Phase 9P is implemented and verified. The scheduler integration candidate bridge is active in product code, and the change is ready to archive.

## Verification

Passed:

- `npm run typecheck`
- `npm run lint`
- `npm run test -- tests/unit/workflow-actions.test.ts tests/unit/workbench-module-boundaries.test.ts`
- `npm run test -- tests/unit/workbench.test.ts tests/unit/workbench-server.test.ts`
- `npm run test -- tests/unit/web-app.test.tsx`
- `npm run test`
- `npm run build`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`

Note: the first full `npm run test` attempt hit a transient `web-app.test.tsx` tab-selection assertion; the isolated web-app test and full test rerun both passed.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.
