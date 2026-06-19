# Workbench Test Architecture Apply Integration Slow Suite Split

## Purpose

Split the local Result Review / Apply / IntegrationCheck / source-refresh Workbench flow tests out of the residual Workbench unit monolith into an explicit slow Workbench suite.

This is a Workbench test architecture convergence change only. It must not change product runtime behavior, Workbench actions/projections, ToolPolicyGate, stale revalidation, validation/audit, IntegrationCheck, source apply, close/archive, or human gates.

## Scope

In scope:

- Move the nine apply/integration/source-refresh tests into `tests/slow/workbench-apply-integration-flow.test.ts`.
- Reuse existing shared Workbench fixtures and promote `writeRawActiveChange` into a hook-free helper under `tests/unit/workbench/`.
- Update explicit sequential Workbench slow-suite npm scripts.

Out of scope:

- Product runtime changes.
- Workbench behavior changes.
- Moving unrelated conversation, maintenance, read-model/projection, TaskQueue, scheduler, Goal Loop, remote landing, DemandWorker, or AgentTask/delegate tests.
- New test framework or broad fixture rewrite.

## Current Status

Completed.

## Verification

Passed:

- `npx eslint tests\slow\workbench-apply-integration-flow.test.ts tests\unit\workbench.test.ts tests\unit\workbench\fixtures.ts tests\unit\workbench\change-fixtures.ts`
- `npx vitest run tests\slow\workbench-apply-integration-flow.test.ts`
- `npx vitest run tests\unit\workbench.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm run test:fast`
- `npm run test:integration`
- `npm run build`
- `npm run test:workbench:slow`
- `npx vitest run tests\slow\workbench-remote-landing-flow.test.ts`
- `npm run test:workbench`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\harness-change.ps1 status`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\harness-evolve.ps1 check`

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: subagent plan review returned PASS and confirmed the scope is a coherent adjacent capability-domain slice.
- Retries or environment failures: one `npm run test:workbench` attempt hit the existing remote landing slow test's 30s per-test timeout in a repeated full run; the same remote landing suite passed on immediate targeted rerun, and the final isolated full `npm run test:workbench` passed.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: future test-architecture phases should prefer targeted verification first and reserve repeated full Workbench runs for shared-runtime changes or final close evidence.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: active handoff docs only; no historical ledger expansion planned.
- Experience lifecycle result: user feedback retained as next-stage execution guidance: use larger capability-domain work packages when boundaries are clear, and avoid unnecessary repeated full-suite runs for test-only relocation.
- Roadmap/current-direction stale language check: active handoff remains scoped to Workbench test architecture convergence.
- Old experience retained / merged / retired / archive-only: retained current-stage evidence only; no archive-ledger expansion.
