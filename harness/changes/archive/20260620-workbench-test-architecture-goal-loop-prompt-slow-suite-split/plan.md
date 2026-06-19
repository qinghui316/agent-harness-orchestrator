# Plan: Workbench Test Architecture Goal Loop Prompt Slow Suite Split

## Approach

Move only the remaining long-running Goal Loop prompt/runtime evidence scenarios into a dedicated slow Workbench suite. Keep assertions and runtime setup intact, reuse existing shared fixtures, and update the staged Workbench test script so full validation still includes the moved coverage.

## Steps

1. Create `tests/slow/workbench-goal-loop-prompt-flow.test.ts` with the three Goal Loop prompt/runtime evidence tests.
2. Remove those tests from `tests/unit/workbench.test.ts` and prune now-unused imports only when confirmed by lint.
3. Update `package.json` `test:workbench:slow` to run scheduler, remote landing, and Goal Loop prompt slow suites sequentially with explicit file paths.
4. Run targeted lint and tests, then Workbench/product/Harness close gates.
5. Complete independent close-ready review before closing the active change.

## Decisions

- Plan review: subagent `019edf5f-fe92-73e1-bed0-c40ecfb2c56a` returned PASS before ECL implementation. Required corrections: none. Adopted optional constraints: explicit sequential slow script, test-architecture-only scope, no prompt/assertion framework extraction, and complete close-gate verification by default.
- Reference source: no reference project source is needed because this is a relocation of existing project tests, not a product behavior design.

## Module Boundary Plan

- Owner module: test architecture only; moved coverage belongs under `tests/slow/` because it exercises real prompt artifact generation and fake Codex runs.
- New / moved responsibilities: the slow suite owns Goal Loop prompt/runtime evidence flow tests; `tests/unit/workbench.test.ts` retains shorter Workbench and projection coverage.
- Facade touch points: none.
- Forbidden write-back locations: product runtime modules, Workbench bridge/projection logic, Goal Loop manager, scheduler runtime, and Harness rules.
- Compatibility surface: npm scripts remain the public validation entry points; root `npm run test` must still include this coverage.
- Boundary tests: the moved tests themselves verify Goal Loop prompt evidence remains non-executing and gate-scoped.
- Follow-up split candidates: demand worker, maintenance apply, apply/IntegrationCheck, and read-model/projection domain suites.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: existing Vitest structure, explicit npm script staging, and shared Workbench fixtures.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new mechanism is proposed.
- Domain-specific logic location: Goal Loop prompt flow assertions remain in the moved slow suite.
- Shared cross-cutting logic location: existing `tests/unit/workbench/fixtures.ts` remains the shared fixture owner.
- Local framework / state machine / projection / validation / gate avoided: no new local framework, state machine, projection, validation, or gate will be introduced.
- Future-cost reduction for similar features: future agents can run or inspect Goal Loop prompt slow coverage independently from the residual Workbench unit suite.

## Planning-Discovered Gaps

- `tests/unit/workbench.test.ts` still contains other capability-domain clusters after this split; those remain follow-up work, not this change.
