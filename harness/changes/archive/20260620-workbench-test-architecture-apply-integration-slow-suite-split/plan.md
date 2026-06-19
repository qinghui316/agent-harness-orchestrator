# Plan: Workbench Test Architecture Apply Integration Slow Suite Split

## Approach

Move the existing local apply/integration safety chain as one coherent slow Workbench suite:

- result review apply gate and selected-demand worktree scoping;
- applied-result auto-finalization;
- multi-ready-result IntegrationCheck queueing;
- IntegrationCheck execution without source-root mutation;
- forged IntegrationCheck target rejection;
- bounded IntegrationFix after aggregate validation failure;
- source HEAD drift and dirty source refresh behavior.

Promote `writeRawActiveChange` into a hook-free Workbench test helper because the moved suite and residual suite both need it. Reuse existing fixture exports for temp project state, git setup, accepted artifacts, and validation/audit hash fixtures in the new slow suite.

## Steps

1. Add/export `writeRawActiveChange` in a hook-free helper under `tests/unit/workbench/` and update residual uses in `tests/unit/workbench.test.ts` to import it.
2. Move the nine apply/integration/source-refresh tests from `tests/unit/workbench.test.ts` to `tests/slow/workbench-apply-integration-flow.test.ts`.
3. Update imports in the new slow suite and remove unused imports from the residual suite.
4. Update `package.json` so `test:workbench:slow` runs the new suite explicitly and sequentially.
5. Verify targeted lint/tests, full Workbench scripts, product checks, and Harness checks.
6. Record independent close-ready review before close.

## Decisions

- Keep supplemental input and archived follow-up demand tests in the residual suite because they are conversation/feedback lifecycle rather than apply/integration safety.
- Put the new suite under `tests/slow/` because these tests exercise git worktrees, apply gates, IntegrationCheck, and IntegrationFix flows.
- Do not change product `src/` code.

## Module Boundary Plan

- Owner module: not applicable for product code; test helper owners are `tests/unit/workbench/fixtures.ts` for lifecycle fixtures and a hook-free helper for raw Change file setup.
- New / moved responsibilities: moved test coverage only; `writeRawActiveChange` becomes a shared hook-free helper.
- Facade touch points: none.
- Forbidden write-back locations: product `src/` runtime, Workbench runtime modules, manager facades, bridge/frontend glue.
- Compatibility surface: npm script names and Workbench test contract.
- Boundary tests: moved suite, residual suite, full `test:workbench`.
- Follow-up split candidates: none.
- If not applicable, reason: no product module behavior changes.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: existing Workbench slow-suite staging, existing Workbench fixture helpers where lifecycle-compatible, a shared hook-free test helper for raw Change setup, existing Workbench action/snapshot APIs, existing apply/IntegrationCheck tests.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new mechanism proposed.
- Domain-specific logic location: apply/integration flow tests live in `tests/slow/workbench-apply-integration-flow.test.ts`.
- Shared cross-cutting logic location: lifecycle-aware shared setup stays in `tests/unit/workbench/fixtures.ts`; raw Change file setup lives in a hook-free helper under `tests/unit/workbench/`.
- Local framework / state machine / projection / validation / gate avoided: no new test framework, state machine, projection system, validation gate, or protocol.
- Future-cost reduction for similar features: future apply/integration safety changes can run a targeted slow suite without searching the residual Workbench monolith.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

- None blocking.
