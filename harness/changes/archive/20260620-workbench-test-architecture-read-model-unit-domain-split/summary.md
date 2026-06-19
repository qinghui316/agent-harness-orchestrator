# Workbench Test Architecture Read Model Unit Domain Split

## Purpose

Split a coherent Workbench read-model/projection unit-test domain out of the residual `tests/unit/workbench.test.ts` monolith into an explicit unit suite.

This is a test architecture convergence change only. It must not change product runtime behavior, Workbench projections/actions, transcript semantics, approval semantics, task graph semantics, ToolPolicyGate, source/canonical apply authority, Harness evolution, or human gates.

## Scope

In scope:

- Move the topic/snapshot/thread/transcript/stream/roles/approval/taskgraph projection cluster into `tests/unit/workbench-read-model.test.ts`.
- Reuse existing shared Workbench fixtures from `tests/unit/workbench/fixtures.ts`.
- Move only read-model/projection-specific helper setup needed by the extracted tests.
- Update explicit Workbench test script staging so `test:workbench` includes the new suite and `test:fast` continues to exclude Workbench-specific suites.

Out of scope:

- Product runtime changes.
- Workbench behavior changes.
- Moving TaskRun/TaskQueue runtime action validation tests, scheduler tests, Goal Loop tests, maintenance tests, apply/IntegrationCheck tests, remote landing tests, or DemandWorker tests.
- New test framework or broad fixture rewrite.
- Repeated full-suite verification beyond what is needed for close evidence.

## Current Status

Ready to close.

Implemented as a test-architecture convergence change only. The selected Workbench read-model/projection cluster now lives in `tests/unit/workbench-read-model.test.ts`, while scheduler/PR-feedback unit tests and TaskRun/TaskQueue runtime/action-validation coverage remain in the residual Workbench unit suite. `test:workbench` explicitly includes the new suite.

## Verification

Passed:

- `npx eslint tests\unit\workbench-read-model.test.ts tests\unit\workbench.test.ts tests\unit\workbench\fixtures.ts`
- `npx vitest run tests\unit\workbench-read-model.test.ts`
- `npx vitest run tests\unit\workbench.test.ts`
- `npx vitest run tests\unit\workbench-demand-worker.test.ts`
- `npm run test:workbench`
- `npm run typecheck`
- `npm run lint`
- `npm run test:fast`
- `npm run build`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\harness-evolve.ps1 check`

Pending final close check:

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\harness-change.ps1 status`

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: subagent plan review returned PASS and confirmed the read-model/projection cluster is a coherent larger capability-domain split.
- Retries or environment failures: first migration pass exposed import/helper drift in local tests; fixed before close. No test environment failure recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: keep targeted verification first for test-only relocation; run the relevant aggregate contract once when it proves script coverage. This phase ran `npm run test:workbench` once because the aggregate script changed.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: active handoff docs only; no historical ledger expansion added.
- Experience lifecycle result: retain the current test strategy guidance: use coherent capability-domain work packages and avoid unnecessary repeated full-suite runs.
- Roadmap/current-direction stale language check: active handoff remains scoped to the current change until close.
- Old experience retained / merged / retired / archive-only: retained targeted-verification guidance as current execution guidance; detailed history remains in this change record.
