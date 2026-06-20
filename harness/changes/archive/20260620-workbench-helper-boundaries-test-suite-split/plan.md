# Plan: workbench-helper-boundaries-test-suite-split

## Approach

Create a dedicated helper-boundary unit test file and move only pure helper assertions into it. Leave large facade/export and cross-module wiring assertions in `workbench-module-boundaries.test.ts` so the original suite remains the broad module map while the new suite becomes the fast touched-boundary target for future helper-only changes.

## Steps

1. Add `tests/unit/workbench-helper-boundaries.test.ts` with imports for helper modules and `readFileSync`.
2. Move projection summary helper tests to the new suite.
3. Move read-model `evidenceActions` / `evidenceRefs` helper tests to the new suite.
4. Move landing artifact selection helper tests to the new suite.
5. Split action target revalidation coverage: move only pure `active-target.ts` helper behavior/purity assertions, leaving the long `src/workbench/actions/boundary.ts` wiring assertions in `workbench-module-boundaries.test.ts`.
6. Remove now-unused imports from `workbench-module-boundaries.test.ts`.
7. Run targeted verification and record review/close evidence.

## Decisions

- Do not change `package.json`; Vitest will discover the new `tests/unit/*.test.ts` file through `test:fast`.
- Do not move the full action target revalidation test because its long boundary wiring assertions are broad Workbench action/module coverage.
- Treat this as test architecture convergence rather than product behavior work.

## Module Boundary Plan

- Owner module: test topology under `tests/unit/workbench-helper-boundaries.test.ts`.
- New / moved responsibilities: pure Workbench helper behavior and helper-owner purity assertions.
- Facade touch points: `tests/unit/workbench-module-boundaries.test.ts` keeps broad facade/export/wiring coverage.
- Forbidden write-back locations: product source, `package.json`, Workbench runtime/manager/facade files, and broad Workbench domain suites.
- Compatibility surface: product code and package scripts unchanged; test coverage remains equivalent.
- Boundary tests: new helper-boundary suite plus remaining module-boundary suite.
- Follow-up split candidates: none.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: Workbench test architecture direction that keeps capability-domain suites explicit and slow/large checks out of ordinary helper iteration.
- Why existing mechanisms are insufficient if a new mechanism is proposed: `workbench-module-boundaries.test.ts` is the broad module map and is too large to keep absorbing every helper-specific assertion.
- Domain-specific logic location: helper-specific tests in the new helper-boundary suite.
- Shared cross-cutting logic location: broad module/facade wiring stays in the existing module-boundary suite.
- Local framework / state machine / projection / validation / gate avoided: avoids recreating a residual Workbench test monolith for every helper change.
- Future-cost reduction for similar features: future helper-only changes can run a small helper suite plus affected domain tests instead of relying on the full module-boundary collector.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

- Subagent plan review recommended moving only pure helper assertions and leaving long action boundary wiring assertions in `workbench-module-boundaries.test.ts`.

