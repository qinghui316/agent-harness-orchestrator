# Spec: Workbench Test Architecture Demand Worker Unit Domain Split

## Goal

Split the DemandWorker-focused Workbench tests out of the residual Workbench monolith so `tests/unit/workbench.test.ts` continues shrinking by capability domain while `npm run test:workbench` remains the full Workbench contract.

This is a test architecture change only. It must preserve existing DemandWorker, Workbench projection, action, ToolPolicy, validation, audit, IntegrationCheck, human gate, and product runtime behavior.

## Users

- AHO maintainers and future agents working on Workbench test architecture.
- Product developers who need targeted DemandWorker regression coverage without searching the residual Workbench monolith.

## Acceptance Criteria

- AC-001: The complete 10-test DemandWorker cluster is moved from `tests/unit/workbench.test.ts` into `tests/unit/workbench-demand-worker.test.ts`.
- AC-002: The new suite reuses existing Workbench fixture helpers and does not create a new test framework.
- AC-003: `npm run test:workbench` explicitly includes the new DemandWorker suite and remains the full Workbench contract.
- AC-004: `npm run test:fast` excludes the new DemandWorker suite to avoid duplicate coverage in the root `npm run test` chain.
- AC-005: Product runtime behavior and workflow truth are unchanged.

## Non-Goals

- Changing `src/demand-worker`, Workbench projections, action handlers, manager facades, ToolPolicyGate, human gates, or product runtime behavior.
- Moving maintenance, apply/IntegrationCheck, read-model/projection, AgentTask, Goal Loop, scheduler, or remote tests in this change.
- Updating reference projects or copying reference source.
- Reclassifying the Workbench contract documented in `docs/DEVELOPMENT.md`.

## Constraints

- Keep the change closeable as a narrow Architecture Growth Control / Workbench test architecture convergence slice.
- Prefer `tests/unit/workbench/fixtures.ts` for shared temp project and planning bundle helpers.
- Keep `README.md` unrelated and untracked.
- If package scripts change, preserve root `npm run test` coverage without duplicate Workbench domain execution.

## Risks

- Import drift while moving the clustered tests.
- Accidentally dropping the new suite from the Workbench contract if scripts are not updated carefully.
- Over-expanding into maintenance/apply/IntegrationCheck test domains.
