# Review: Phase 9K Scheduler First Worker Bounded Rework Plan Contract

## Spec / Plan Gate

- Status: implemented and verified.
- Scope check: non-executing scheduler rework planning only.
- Key planning correction: `startCodeRun()` currently creates a fresh worktree, so Phase 9K must not start rework or claim same-worktree continuation support.

## Module Boundary Coverage

- Future feature owner module: `src/scheduler-runtime/`.
- Retained facade responsibility: `src/scheduler-runtime/manager.ts` may re-export the new type/service only.
- Forbidden write-back locations: Workbench chat facade, server route facade, frontend shell, code manager, and broad manager facades.
- Behavior path tested: validation-failed scheduler worker path compiles rework plan evidence, repeated action returns existing evidence, and no execution/runtime worker artifacts are created.
- Compatibility result: old scheduler-runtime facade remains compatible; Workbench action registry, server/live action payloads, lazy projection, frontend payload helpers, and existing tests pass.
- Not applicable reason: not applicable; module boundary coverage is required.

## Verification

Passed:

- `npm run test -- tests/unit/workflow-actions.test.ts`
- `npm run test -- tests/unit/workbench-server.test.ts`
- `npm run test -- tests/unit/workbench-module-boundaries.test.ts`
- `npm run test -- tests/unit/workbench.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run test`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`

Note: the first full `npm run test` run hit one transient `tests/unit/web-app.test.tsx` assertion. The targeted rerun passed, and the subsequent full `npm run test` passed.

## Review Notes

- The phase intentionally records a rework intent contract before execution. This prevents accidental broadening into an unsafe existing-worktree code-run change.
- `SchedulerRuntimeWorkerReworkPlan` remains planning evidence only. The implementation does not call `startCodeRun()` and does not create TaskRun, WorkerLease, WorkerSession, RuntimeWorkspace, EventSource, worktree, run, AgentTask, WorkflowRun, TaskQueueRun, child Change, validation, audit, rework, next worker, apply, or merge artifacts.
