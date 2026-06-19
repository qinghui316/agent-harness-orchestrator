# Spec: Workbench Test Architecture Goal Loop Prompt Slow Suite Split

## Goal

Split the remaining long-running Goal Loop prompt/runtime evidence scenarios out of the residual Workbench unit suite so `tests/unit/workbench.test.ts` becomes smaller by capability domain and slow prompt flows are isolated in the slow Workbench layer.

This is a test architecture change only. It must preserve existing Goal Loop, Workbench, scheduler, validation, audit, and human-gate behavior.

## Users

- AHO maintainers and future agents working on Workbench test architecture.
- Product developers who need faster, clearer targeted Workbench validation while preserving full slow-suite coverage.

## Acceptance Criteria

- AC-001: The three actual `runCodexChat` / `runOrchestratorPlan` Goal Loop prompt/runtime evidence tests are moved from `tests/unit/workbench.test.ts` into a dedicated slow suite.
- AC-002: `tests/unit/workbench.test.ts` keeps pure projection and short Workbench tests, including the scheduler terminal handoff prompt evidence unit test.
- AC-003: The new slow suite reuses existing shared Workbench fixtures rather than creating a new local framework or duplicating scheduler setup.
- AC-004: Workbench slow test scripts run the new suite explicitly and sequentially, without glob-dependent behavior.
- AC-005: Product runtime behavior, workflow truth, ToolPolicyGate, stale revalidation, validation/audit, IntegrationCheck, and human gates are unchanged.

## Non-Goals

- Changing `src/goal-loop`, Workbench projections, action payloads, prompt rendering, scheduler runtime, or product authority boundaries.
- Splitting demand worker, maintenance, apply/IntegrationCheck, or read-model/projection tests in this change.
- Introducing a new test framework, broad fixture rewrite, or source behavior refactor.

## Constraints

- Reuse `tests/unit/workbench/fixtures.ts` for shared fake Codex and scheduler setup where possible.
- Keep the slow suite list explicit in `package.json`.
- Do not stage or modify the unrelated untracked `README.md`.
- Keep this change closeable as a narrow Architecture Growth Control / test architecture convergence slice.

## Risks

- Import drift while moving tests between unit and slow suite paths.
- Slow test runtime remains high even after isolation; this change improves layering, not total scenario cost.
- Package script order must remain deterministic on Windows.
