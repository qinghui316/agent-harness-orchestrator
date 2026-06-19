# Plan: Workbench Test Architecture Demand Worker Unit Domain Split

## Approach

Move only the DemandWorker Workbench test cluster into a dedicated unit-domain suite. Keep behavior assertions intact, reuse the shared Workbench fixtures, and update npm scripts so the new unit-domain suite is part of the explicit Workbench contract while remaining excluded from `test:fast`.

## Steps

1. Create `tests/unit/workbench-demand-worker.test.ts` with the 10 DemandWorker tests.
2. Remove those tests from `tests/unit/workbench.test.ts` and prune now-unused imports only after lint identifies them.
3. Update `package.json` so `test:workbench` runs residual `workbench.test.ts`, the new DemandWorker suite, and slow Workbench suites in order.
4. Update `test:fast` to exclude the new DemandWorker suite, avoiding duplicate execution under root `npm run test`.
5. Run targeted and staged product/Harness verification.
6. Complete independent close-ready review before closing.

## Decisions

- Plan review: subagent `019edf5f-fe92-73e1-bed0-c40ecfb2c56a` first rejected the plan because `test:workbench` would have stopped representing the full Workbench contract if the new suite only ran under `test:fast`.
- Corrected plan review: the same subagent returned PASS after the plan was revised to include the new suite in `test:workbench` and exclude it from `test:fast`.
- Reference source: no reference project source is needed because this is a relocation of existing project tests, not a product behavior design.

## Module Boundary Plan

- Owner module: test architecture only; moved coverage belongs under a focused unit-domain Workbench test file.
- New / moved responsibilities: `tests/unit/workbench-demand-worker.test.ts` owns DemandWorker Workbench projection/action regression tests.
- Facade touch points: none.
- Forbidden write-back locations: `src/demand-worker`, Workbench action handlers/projections, server/frontend glue, manager facades, and product runtime modules.
- Compatibility surface: `npm run test`, `npm run test:fast`, and `npm run test:workbench` coverage semantics.
- Boundary tests: new DemandWorker unit suite, residual Workbench suite, Workbench aggregate script.
- Follow-up split candidates: maintenance apply, apply/IntegrationCheck, and read-model/projection domain suites.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: existing Vitest unit suite structure, explicit npm script staging, and shared `tests/unit/workbench/fixtures.ts`.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new mechanism is proposed.
- Domain-specific logic location: DemandWorker assertions move to the new unit-domain test file.
- Shared cross-cutting logic location: existing Workbench fixture module remains shared helper owner.
- Local framework / state machine / projection / validation / gate avoided: no new local framework, state machine, projection, validation path, or gate is introduced.
- Future-cost reduction for similar features: future agents can inspect/run DemandWorker Workbench coverage independently and continue splitting other domains without touching product runtime.

## Planning-Discovered Gaps

- `tests/unit/workbench.test.ts` still contains maintenance, apply/IntegrationCheck, read-model/projection, AgentTask, Goal Loop unit, and typed workflow clusters after this split; those remain follow-up work.
