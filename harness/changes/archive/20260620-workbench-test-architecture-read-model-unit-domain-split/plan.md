# Plan: Workbench Test Architecture Read Model Unit Domain Split

## Approach

Move the selected Workbench read-model/projection unit cluster into a dedicated unit suite. Keep the change mechanical: relocate tests and read-model-only helper code, update explicit npm script composition, and leave product runtime code untouched.

## Steps

1. Create `tests/unit/workbench-read-model.test.ts` using the existing Workbench fixture lifecycle from `tests/unit/workbench/fixtures.ts`.
2. Move the coherent read-model/projection tests out of `tests/unit/workbench.test.ts`, covering topic list/detail, snapshot shell, parent transcript projection, semantic thread stream, stream replay, role summaries, approval/decision projections, metadata forgery safety, and TaskGraph projection evidence.
3. Stop extraction before `disables task run actions for archived topics without losing TaskGraph facts`; TaskRun/TaskQueue runtime action-validation tests remain in the residual suite.
4. Move only read-model/projection-specific helper setup needed by the extracted tests into the new suite or reuse existing fixture helpers.
5. Update `package.json` so `test:workbench` explicitly runs the new suite and `test:fast` excludes it.
6. Verify targeted suites and the Workbench aggregate contract without repeated full slow-suite runs unless evidence shows a gap.

## Decisions

- The scope is read-model/projection unit coverage only; scheduler, Goal Loop, maintenance, apply/IntegrationCheck, remote landing, DemandWorker, and runtime action-validation tests stay where they are or in their existing suites.
- Reference project source is not needed because this is local test architecture maintenance with no new product design.
- Full `npm run test:workbench` should run once to prove explicit script composition. Repeated full Workbench aggregate runs are not required unless verification reveals a gap.

## Module Boundary Plan

- Owner module: not applicable for product runtime; test ownership moves to a dedicated read-model/projection unit suite.
- New / moved responsibilities: read-model/projection regression coverage moves from the residual unit monolith to `tests/unit/workbench-read-model.test.ts`.
- Facade touch points: none.
- Forbidden write-back locations: no product `src/` files, Workbench facades, Harness templates, or reference project files.
- Compatibility surface: `npm run test:workbench` continues to include the moved coverage through explicit script composition.
- Boundary tests: targeted read-model suite, residual Workbench suite, demand-worker suite if needed for neighboring Workbench-specific coverage, and the aggregate Workbench script.
- Follow-up split candidates: remaining TaskRun/TaskQueue runtime/action-validation domain can become a later capability-domain split if boundaries remain clear.
- If not applicable, reason: product module-boundary coverage is not applicable because no product runtime code changes.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: existing Workbench unit test staging and shared `tests/unit/workbench/fixtures.ts` lifecycle helpers.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new mechanism is proposed.
- Domain-specific logic location: read-model/projection tests and read-model-only helpers live in the new read-model unit suite.
- Shared cross-cutting logic location: existing shared Workbench fixtures remain in `tests/unit/workbench/fixtures.ts`.
- Local framework / state machine / projection / validation / gate avoided: no new fixture framework, local state machine, projection system, validation gate, or artifact protocol is introduced.
- Future-cost reduction for similar features: future Workbench read-model/projection changes can run a focused suite first instead of searching or running the residual Workbench monolith.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

None blocking. Subagent plan review returned PASS and recommended keeping the migrated scope to the coherent read-model/projection cluster, stopping before TaskRun/TaskQueue action-validation tests, avoiding reference-source inspection, and adding the new suite explicitly to `test:workbench` while excluding it from `test:fast`.
