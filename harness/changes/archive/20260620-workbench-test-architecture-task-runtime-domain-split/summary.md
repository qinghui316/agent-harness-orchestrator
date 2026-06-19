# Workbench Test Architecture Task Runtime Domain Split

## Purpose

Split the TaskRun / TaskQueue / WorkflowRun / typed-workflow runtime guard coverage out of the residual Workbench unit monolith into a dedicated capability-domain suite.

This is a test-architecture convergence change only. It should preserve product behavior while making future Workbench runtime/action-validation changes targetable without repeatedly running the whole residual Workbench suite during iteration.

## Scope

In scope:

- Move the coherent TaskRun, WorkerLease, TaskQueue, WorkflowRun, typed-workflow artifact guard, and related Workbench action fail-closed tests from `tests/unit/workbench.test.ts` into `tests/unit/workbench-task-runtime.test.ts`.
- Include the direct TaskQueue reconcile case that continues the same runtime domain after the initial queue blocker cluster.
- Move low-level SchedulerContract and workflow artifact hash tests only as typed workflow/runtime artifact guard coverage.
- Reuse `tests/unit/workbench/fixtures.ts` as the shared Workbench fixture owner for moved helper builders and record writers.
- Keep `npm run test:fast` excluding explicit Workbench capability suites and add the new suite to the `npm run test:workbench` contract.

Out of scope:

- Product behavior, Workbench UI/API/action semantics, runtime managers, source apply behavior, scheduler execution, Goal Loop behavior, and broad fixture redesign.
- The large Workbench scheduler planning/runtime flow test remains in the residual suite or a later scheduler/planning split.
- Proposal feedback, multi-Workpad memory isolation, Goal Loop, DemandWorker, AgentTask, and broader Workbench residual domains remain follow-up candidates unless helper sharing requires import updates.

## Current Status

Ready to close.

## Verification

- PASS: `npx vitest run tests/unit/workbench-task-runtime.test.ts` (24 tests).
- PASS: `npx vitest run tests/unit/workbench.test.ts` (30 tests) after moving residual fixture usage to the shared fixture lifecycle.
- PASS: `npx eslint tests/unit/workbench.test.ts tests/unit/workbench-task-runtime.test.ts tests/unit/workbench/fixtures.ts`.
- PASS: `npm run typecheck`.
- PASS: `npm run lint`.
- PASS: `npm run test:fast` (346 tests; excludes explicit Workbench capability suites including the new task-runtime suite).
- PASS: `npm run build`.
- PASS: `npm run test:workbench` (read-model, task-runtime, residual Workbench, demand-worker, and slow Workbench suites; ~682 seconds).
- PASS: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`.
- PASS: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`.
- PASS: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`.
- PASS: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` (no pending evolution; 4 archived changes since last completion, threshold 5).

## Acceptance Feedback

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: `npm run test:workbench` is intentionally slow because slow Workbench scheduler and Goal Loop prompt flows are included; future iteration should use targeted suites first and reserve the aggregate for close evidence or script-contract changes.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: not applicable.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: not applicable.
- Old experience retained / merged / retired / archive-only: not applicable.
