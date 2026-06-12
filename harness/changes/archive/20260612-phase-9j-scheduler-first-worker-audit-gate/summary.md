# Phase 9J Scheduler First Worker Audit Gate

## Purpose

Phase 9J adds the next controlled scheduler execution slice after Phase 9I. It audits only the first scheduler coder worker that already produced scheduler-owned result evidence and passed scheduler-owned validation evidence.

This phase introduces a scoped `planning.scheduler.worker.audit-first` Workbench action and `SchedulerRuntimeWorkerAudit` evidence under the existing scheduler runtime owner module. Audit approval can complete the corresponding TaskRun; audit blocked/failed only blocks the current worker path. It does not start bounded rework, a second worker, whole-wave dispatch, scheduler loop, slot allocator, apply, landing, child Changes, or the full parallel executor.

## Scope

In scope:

- Create scheduler-owned first-worker audit evidence.
- Add the Workbench action `planning.scheduler.worker.audit-first`.
- Bind scheduler audit to the exact Phase 9I validation run and worker worktree.
- Mark the TaskRun `completed` only for audit `approved` / `approved-with-notes`.
- Mark the TaskRun `blocked` for audit `blocked` / `failed`.
- Preserve existing public Run/Audit artifact shapes and Workbench action/event surfaces.

Out of scope:

- Full parallel executor, scheduler loop, slot allocator, or whole-wave dispatch.
- Bounded rework, next-worker start, apply, integration check, PR, merge, or child Change creation.
- New CLI commands, HTTP routes, public Audit JSON shape, SSE shape, or workflow-truth changes.

## Current Status

Ready to close.

Implementation and focused/full verification completed.

## Verification

Passed:

- `npm run typecheck`
- `npm run test -- tests/unit/workflow-actions.test.ts`
- `npm run test -- tests/unit/workbench-module-boundaries.test.ts`
- `npm run test -- tests/unit/audit.test.ts`
- `npm run test -- tests/unit/workbench-server.test.ts`
- `npm run test -- tests/unit/workbench.test.ts`
- `npm run lint`
- `npm run build`
- `npm run test`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: first `tests/unit/workbench.test.ts` run exposed an over-strict scheduler audit guard that assumed Audit Run metadata carried `worktree`; fixed by binding worktree through `audit.json` / validation evidence while keeping Run metadata compatibility.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.
