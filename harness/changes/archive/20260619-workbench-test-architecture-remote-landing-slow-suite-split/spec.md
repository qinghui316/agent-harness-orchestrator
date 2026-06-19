# Spec: Workbench Test Architecture Remote Landing Slow Suite Split

## Goal

Split the remote landing / PR handoff Workbench scenarios out of the overloaded
`tests/unit/workbench.test.ts` file into a dedicated slow-suite file, reusing the
existing Workbench test fixture owner instead of adding another local test
framework.

## Users

- Future agents and maintainers who need to locate Workbench remote handoff
  tests by capability domain.
- Local developers who need a clearer distinction between fast Workbench unit
  coverage and slow remote-provider flow coverage.

## Acceptance Criteria

- AC-001: Remote landing, Draft PR, PR review submit, remote merge, landing
  queue, post-merge, and PR review feedback flow tests live in a dedicated
  `tests/slow/workbench-remote-landing-flow.test.ts` suite.
- AC-002: Shared test infrastructure required by that suite is owned by
  `tests/unit/workbench/fixtures.ts`; the change does not introduce a new local
  fixture framework, state machine, projection layer, or gate model.
- AC-003: `tests/unit/workbench.test.ts` keeps adjacent non-remote domains such
  as result apply, IntegrationCheck, demand worker, maintenance, Goal Loop, and
  pure PR feedback classification unless explicitly needed by the moved suite.
- AC-004: Workbench test scripts distinguish residual Workbench coverage from
  slow Workbench flow suites, and the slow script can run all
  `tests/slow/workbench-*.test.ts` suites on Windows.
- AC-005: Product runtime behavior, workflow truth, validation/audit semantics,
  ToolPolicyGate, and human gates are unchanged.

## Non-Goals

- Refactor Workbench runtime modules or product behavior.
- Split demand worker, maintenance, Goal Loop, scheduler, apply, or
  IntegrationCheck tests in this change.
- Add new public APIs, manager facades, persistence records, gates, or
  projection protocols.
- Vendor or copy reference project source.

## Constraints

- Keep `README.md` unrelated and untracked.
- Preserve existing public test intent and assertions.
- Prefer moving existing tests and reusing existing fixture helpers over
  inventing new helper layers.
- If a glob-based npm script does not work under Windows/Vitest, fall back to an
  explicit file list.

## Risks

- Broad test moves can mask behavior drift if assertions change during
  relocation.
- Glob script behavior may differ by shell; it must be validated locally.
- Extracting too much helper logic could create another local framework instead
  of reducing the monolith.
