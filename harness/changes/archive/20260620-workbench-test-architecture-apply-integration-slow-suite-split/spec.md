# Spec: Workbench Test Architecture Apply Integration Slow Suite Split

## Goal

Split the local Result Review / Apply / IntegrationCheck / source-refresh Workbench flow tests out of the residual Workbench unit monolith into an explicit slow Workbench suite.

This continues Workbench test architecture convergence with a larger adjacent capability-domain slice than the previous DemandWorker split. It must preserve product runtime behavior and keep `npm run test:workbench` as the full Workbench contract.

## Users

- AHO maintainers and future agents working on Workbench apply/integration safety.
- Product developers who need targeted regression coverage for source apply, IntegrationCheck, IntegrationFix, and source refresh behavior without searching the residual Workbench monolith.

## Acceptance Criteria

- AC-001: The complete local Result Review / Apply / IntegrationCheck / source-refresh cluster is moved from `tests/unit/workbench.test.ts` into `tests/slow/workbench-apply-integration-flow.test.ts`.
- AC-002: The new suite reuses existing shared Workbench fixture helpers and does not create a new local fixture framework.
- AC-003: Shared raw active Change fixture setup needed by both residual and moved tests is owned by a hook-free helper under `tests/unit/workbench/`.
- AC-004: `npm run test:workbench:slow` explicitly includes the new slow suite, and `npm run test:workbench` remains the full Workbench contract.
- AC-005: Product runtime behavior, Workbench behavior, ToolPolicyGate, stale revalidation, validation/audit, IntegrationCheck, apply/close gates, and human gates are unchanged.

## Non-Goals

- Product runtime changes.
- Workbench projection/action/server/frontend behavior changes.
- ToolPolicyGate, stale revalidation, validation/audit, IntegrationCheck, source apply, close/archive, landing, PR, remote, scheduler, Goal Loop, or Harness evolution behavior changes.
- Moving supplemental-input, linked-follow-up, maintenance, read-model/projection, TaskQueue, scheduler, Goal Loop, remote landing, DemandWorker, or AgentTask/delegate tests in this change.
- New test framework or broad fixture rewrite.

## Constraints

- Treat this as Architecture Growth Control / test architecture convergence, not feature implementation.
- Use existing shared Workbench fixture helpers where their hook lifecycle fits, and use a hook-free helper for utilities that the residual monolith must import.
- Keep `README.md` unrelated and untracked.
- Preserve explicit sequential Workbench slow-suite scripts; avoid glob patterns that have failed on Windows/Vitest.
- Do not inspect or edit reference project source unless a new design question appears; this is relocation of existing local tests.

## Risks

- Import drift while moving a multi-test cluster.
- Accidentally dropping the new suite from the explicit Workbench contract.
- Moving tests outside the apply/integration/source-refresh boundary and making the stage too broad.
- Duplicating fixture helpers instead of strengthening a shared test helper owner.
