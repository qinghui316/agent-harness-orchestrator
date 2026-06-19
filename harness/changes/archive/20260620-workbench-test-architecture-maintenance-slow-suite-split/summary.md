# Workbench Test Architecture Maintenance Slow Suite Split

## Purpose

Split the residual Workbench maintenance/self-evolution long-path tests out of the residual Workbench unit monolith into an explicit slow Workbench suite.

This is a Workbench test architecture convergence change only. It must not change product runtime behavior, Workbench actions/projections, maintenance evidence semantics, ToolPolicyGate, source/canonical patch authority, Harness evolution, or human gates.

## Scope

In scope:

- Move the five maintenance/self-evolution tests into `tests/slow/workbench-maintenance-flow.test.ts`.
- Move maintenance-specific helper/type setup used only by those tests into the new suite.
- Reuse existing shared Workbench fixtures from `tests/unit/workbench/fixtures.ts`.
- Update explicit sequential Workbench slow-suite npm scripts.

Out of scope:

- Product runtime changes.
- Workbench behavior changes.
- Moving adjacent AgentTask/delegate/tool-policy, scheduler, Goal Loop, read-model/projection, remote landing, DemandWorker, or apply/IntegrationCheck tests.
- New test framework or broad fixture rewrite.
- Repeated full-suite verification beyond what is needed for close evidence.

## Current Status

Ready to close.

Implemented as a test-architecture convergence change only. The five maintenance/self-evolution flow tests now live in `tests/slow/workbench-maintenance-flow.test.ts`, maintenance-only helper setup moved with that suite, and `test:workbench:slow` explicitly includes the new suite.

## Verification

Passed:

- `npx eslint tests\slow\workbench-maintenance-flow.test.ts tests\unit\workbench.test.ts tests\unit\workbench\fixtures.ts`
- `npx vitest run tests\slow\workbench-maintenance-flow.test.ts`
- `npx vitest run tests\unit\workbench.test.ts`
- `npx vitest run tests\unit\workbench-demand-worker.test.ts`
- `npm run test:workbench:slow`
- `npm run typecheck`
- `npm run lint`
- `npm run test:fast`
- `npm run test:integration`
- `npm run build`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\harness-change.ps1 status`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\harness-evolve.ps1 check`

Not run:

- `npm run test:workbench`; this phase changed only Workbench test placement. Targeted residual, demand-worker, new maintenance slow suite, full explicit slow-suite contract, product checks, integration check, and Harness checks covered the changed surface without repeatedly running the entire Workbench aggregate.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: subagent plan review returned PASS and confirmed the maintenance cluster is a coherent capability-domain split. User also clarified that future verification should run necessary targeted suites first and avoid unnecessary repeated full-suite runs.
- Retries or environment failures: initial mechanical move produced import/helper drift during local editing; corrected before verification. No test environment failure recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: future test-architecture phases should continue targeted verification first and reserve repeated full Workbench aggregate runs for shared-runtime changes or clear close evidence gaps.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: active handoff docs only; no historical ledger expansion added.
- Experience lifecycle result: user feedback retained as execution guidance: use coherent capability-domain work packages and avoid unnecessary repeated full-suite runs for test-only relocation.
- Roadmap/current-direction stale language check: active handoff remains scoped to the current change until close.
- Old experience retained / merged / retired / archive-only: retained the test-strategy guidance as current execution guidance; detailed history remains in this change record.

