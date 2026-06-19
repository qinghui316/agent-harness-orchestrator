# Plan: Workbench Test Architecture Remote Landing Slow Suite Split

## Approach

Move one coherent Workbench capability domain into a slow suite: the remote
landing / provider handoff chain. Keep the migration mechanical where possible:
copy the existing assertions, extract only the fake GitHub CLI helper into the
existing fixture owner, and leave unrelated domains in the residual unit file.

## Steps

1. Move the minimal fake GitHub CLI helper into
   `tests/unit/workbench/fixtures.ts` and export it with the existing temp-dir
   lifecycle.
2. Create `tests/slow/workbench-remote-landing-flow.test.ts` for the moved
   remote landing / PR / post-merge / PR feedback flow scenarios.
3. Remove those migrated tests and the now-unneeded remote provider helper/imports
   from `tests/unit/workbench.test.ts`.
4. Update Workbench npm scripts so `test:workbench` runs the residual file plus
   all Workbench slow suites, and `test:workbench:slow` runs all Workbench slow
   suites.
5. Validate the targeted suite, residual suite, script layering, full product
   checks, and ECL checks.

## Decisions

- Include the local landing-readiness test in the slow remote-handoff suite
  because it is the direct precondition for PR draft preparation and remote
  landing controls.
- Keep the pure `classifies Draft PR feedback for main-agent rework decisions`
  test in the residual unit file because it covers a small PR feedback
  classifier, not the slow provider handoff flow.
- Do not split demand worker, maintenance, Goal Loop prompt, apply, or
  IntegrationCheck tests in this change.

## Module Boundary Plan

- Owner module: Workbench test suite structure, with shared test setup owned by
  `tests/unit/workbench/fixtures.ts`.
- New / moved responsibilities: remote handoff flow coverage moves to
  `tests/slow/workbench-remote-landing-flow.test.ts`; fake GitHub CLI setup
  becomes a shared fixture.
- Facade touch points: none in product source; existing manager imports are used
  only by tests.
- Forbidden write-back locations: product runtime modules, Workbench runtime
  managers, bridge/frontend glue, and `README.md`.
- Compatibility surface: npm test scripts and existing test assertions.
- Boundary tests: residual Workbench suite and slow Workbench suites must both
  pass.
- Follow-up split candidates: demand worker, maintenance apply, remaining
  Goal Loop prompt slow tests, and apply/IntegrationCheck domains.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: existing Vitest suites, npm test
  script layering, and `tests/unit/workbench/fixtures.ts`.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new
  mechanism is proposed.
- Domain-specific logic location: remote handoff assertions stay in the new slow
  suite.
- Shared cross-cutting logic location: fake CLI and temp project setup stay in
  the fixture owner.
- Local framework / state machine / projection / validation / gate avoided: no
  new test runner, state model, projection helper layer, or gate abstraction.
- Future-cost reduction for similar features: future Workbench capability splits
  can reuse the same fixture owner and slow-suite script glob.

## Planning-Discovered Gaps

- Subagent plan review passed before ECL creation. It recommended keeping the
  scope to the remote/provider handoff chain, treating local landing readiness
  explicitly, validating Windows glob behavior, and avoiding a new fixture
  framework.
