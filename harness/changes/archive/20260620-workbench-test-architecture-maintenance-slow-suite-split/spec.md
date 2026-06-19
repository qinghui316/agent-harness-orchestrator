# Spec: Workbench Test Architecture Maintenance Slow Suite Split

## Goal

Split the residual Workbench maintenance/self-evolution flow tests out of `tests/unit/workbench.test.ts` into an explicit slow Workbench suite.

This continues Workbench test architecture convergence with a coherent capability-domain slice. It must preserve product runtime behavior and keep the maintenance confirmation/apply chain in the explicit slow Workbench contract.

## Users

- AHO maintainers and future agents working on maintenance/self-evolution Workbench behavior.
- Product developers who need targeted regression coverage for maintenance ledger, closeout review windows, canonical update decisions, canonical patch application gates, and scoped maintenance apply without searching the residual Workbench monolith.

## Acceptance Criteria

- AC-001: The complete residual Workbench maintenance/self-evolution cluster is moved from `tests/unit/workbench.test.ts` into `tests/slow/workbench-maintenance-flow.test.ts`.
- AC-002: Maintenance-specific helper/type setup used only by that cluster moves with the new suite, without creating a new shared fixture framework.
- AC-003: The new suite reuses the existing Workbench fixture lifecycle from `tests/unit/workbench/fixtures.ts`.
- AC-004: `npm run test:workbench:slow` explicitly includes the new maintenance slow suite, and the residual unit suite no longer owns maintenance long-path coverage.
- AC-005: Product runtime behavior, Workbench behavior, maintenance evidence semantics, ToolPolicyGate, human gates, source/canonical patch apply authority, and Harness evolution behavior are unchanged.

## Non-Goals

- Product runtime changes.
- Workbench projection/action/server/frontend behavior changes.
- Harness rule/template changes.
- Moving adjacent AgentTask/delegate/tool-policy tests, scheduler tests, Goal Loop tests, read-model/projection tests, remote landing tests, DemandWorker tests, or apply/IntegrationCheck tests in this change.
- New test framework or broad fixture rewrite.
- Repeated full-suite verification beyond what is needed for close evidence.

## Constraints

- Treat this as Architecture Growth Control / test architecture convergence, not feature implementation.
- Keep the moved scope exactly to the five maintenance/self-evolution flow tests identified in planning.
- Reuse existing shared Workbench fixtures where their hook lifecycle fits.
- Keep `README.md` unrelated and untracked.
- Preserve explicit sequential Workbench slow-suite scripts; avoid glob patterns that have failed on Windows/Vitest.
- Do not inspect or edit reference project source unless a new design question appears; this is relocation of existing local tests.

## Risks

- Import drift while moving a multi-test maintenance cluster.
- Accidentally moving adjacent AgentTask/delegate tests and broadening the stage.
- Dropping the new suite from the explicit Workbench slow contract.
- Duplicating fixture helpers instead of keeping maintenance-only helpers local to the new suite.

