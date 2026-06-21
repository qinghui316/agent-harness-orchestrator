# Spec: workbench-verification-signal-stability

## Goal

Make Workbench aggregate verification a trustworthy product-health signal by removing the known slow-suite timeout and aggregate-only DOM fetch mock flake, while preserving existing Workbench manual-loop coverage.

## Users

- Developers and agents advancing AHO Workbench product changes.
- Reviewers deciding whether a Workbench change is product-red or test-red.

## Acceptance Criteria

- AC-001: `npm run test:workbench` has explicit Workbench unit, slow, and aggregate script layers and no longer depends on one residual monolithic scheduler slow file.
- AC-002: The previous `tests/slow/workbench-scheduler-flow.test.ts` scenarios are split into at least three named slow suites covering two-worker integration, discard completion, and worker rework, without removing the scheduler/runtime/source-safety assertions those scenarios already had.
- AC-003: `tests/slow/workbench-demand-to-execution-golden-flow.test.ts` is included in Workbench slow/aggregate verification.
- AC-004: `tests/unit/web-app.test.tsx` does not use a brittle global `fetch` spy wait as the primary UI success condition for the run-graph tab; DOM state is the primary assertion and fetch calls are auxiliary.
- AC-005: Fetch stubs and mock state in the App DOM tests remain isolated across tests.
- AC-006: No product behavior, runtime authority, scheduler capability, full-auto mode, or new evidence family is added unless diagnostics prove a real product bug and the fix is recorded here.
- AC-007: Required targeted, aggregate, product, and Harness verification commands are run or any inability to run them is explicitly recorded with reason.

## Non-Goals

- Implementing full-auto task mode.
- Implementing scheduler loops, slot allocators, parallel executor behavior, child Change auto creation, whole-wave dispatch, or automatic apply/close.
- Reworking Workbench UX or runtime behavior for its own sake.
- Weakening scheduler/runtime/source-safety assertions to make tests pass.
- Adding new evidence, summary, Goal Loop, or prompt-context layers.
- Touching the untracked `README.md`.

## Constraints

- Keep changes bounded to test topology, test fixtures/waits, package scripts, and close/handoff documentation.
- If a real product bug is found, record the finding in this active change before making the smallest product fix.
- Do not hand-edit `harness/changes/INDEX.json`; regenerate it.
- Preserve UTF-8 file handling.

## Risks

- The old scheduler slow suite may hide multiple independent slow points; splitting improves attribution but may expose a real hang in one scenario.
- Aggregate DOM flakes can be caused by jsdom cleanup, global mocks, async React work, or test order; the fix must avoid simply replacing one brittle wait with another.
- Package script changes can accidentally drop coverage; script membership must be checked directly.
