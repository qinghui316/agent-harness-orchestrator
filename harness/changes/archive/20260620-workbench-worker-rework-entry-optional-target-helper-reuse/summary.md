# workbench-worker-rework-entry-optional-target-helper-reuse

## Purpose

Reuse the existing Workbench action optional-string target helper in the scheduler worker rework entry boundary. The current `planning.scheduler.worker.rework-plan.compile` and `planning.scheduler.worker.rework-start-first` paths still repeat local optional id comparisons for request targets such as WorkerStart, WorkerResult, claim reservation, intent ids, TaskRun, WorkerLease, worktree, code run, validation run, and optional audit evidence.

This is an Architecture Growth Control / Core Mechanism Reuse slice: strengthen the existing `src/workbench/actions/active-target.ts` helper owner instead of letting each Workbench scheduler action keep private scalar target validators.

## Scope

In scope:

- Replace equivalent repeated optional string target checks in `src/workbench/actions/boundary.ts` for:
  - `planning.scheduler.worker.rework-plan.compile`
  - `planning.scheduler.worker.rework-start-first`
- Preserve explicit required-id, stale-runtime, status, audit-branch, existing-plan, and existing-start checks.
- Add focused module-boundary test assertions proving these two paths adopt `assertWorkbenchActionOptionalStringTarget`.

Out of scope:

- No changes to scheduler-runtime artifacts, action ids, request payload shape, Workbench projections, UI copy, ToolPolicyGate, IntegrationCheck, apply/close gates, or scheduler execution authority.
- No expansion into `planning.scheduler.worker.rework-reconcile-result`, `planning.scheduler.worker.rework-validate-first`, or `planning.scheduler.worker.rework-audit-first`.
- No new helper, validator, local framework, or state machine.

## Current Status

Completed.

## Verification

- `npx vitest run tests/unit/workbench-module-boundaries.test.ts` - passed, 37 tests.
- `npm run typecheck` - passed.
- `npm run lint` - passed.
- `npm run build` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` - passed after active handoff alignment.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` - passed, no pending evolution before close.

Full `npm run test` skipped because this helper-adoption-only change did not alter runtime behavior, action payload shape, projection shape, scheduler execution path, IntegrationCheck, apply/close gates, or package script membership. Targeted Workbench module-boundary coverage plus typecheck/lint/build covers the touched boundary.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: handoff-only at close; no process-rule or roadmap expansion intended.
- Experience lifecycle result: not an auto-evolve change; no old experience promoted or retired in current docs.
- Roadmap/current-direction stale language check: not applicable.
- Old experience retained / merged / retired / archive-only: not applicable.

