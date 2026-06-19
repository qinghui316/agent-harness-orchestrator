# Spec: Workbench Test Architecture Task Runtime Domain Split

## Goal

Reduce the residual Workbench unit-test monolith by extracting one coherent capability domain: TaskRun / TaskQueue / WorkflowRun / typed-workflow runtime guard and action-validation coverage.

## Users

- Future AHO agents changing TaskRun, TaskQueue, WorkflowRun, typed workflow artifacts, or Workbench scoped action validation.
- Maintainers who need targeted Workbench validation without running unrelated Goal Loop, remote, maintenance, or demand-worker scenarios on every iteration.

## Acceptance Criteria

- AC-001: A new `tests/unit/workbench-task-runtime.test.ts` owns the TaskRun, WorkerLease, TaskQueue, WorkflowRun, typed-workflow artifact guard, and related Workbench action fail-closed coverage currently embedded in `tests/unit/workbench.test.ts`.
- AC-002: Shared helper code needed by the moved tests lives in the existing `tests/unit/workbench/fixtures.ts` owner rather than being duplicated in the new suite.
- AC-003: `tests/unit/workbench.test.ts` no longer carries the moved TaskRun/TaskQueue runtime domain tests, but retains unrelated residual Workbench domains such as proposal feedback, Goal Loop, demand-worker, AgentTask, and broad scheduler planning flow tests.
- AC-004: `package.json` keeps Workbench capability suites explicit: `test:workbench` runs the new suite, while `test:fast` continues to exclude explicit Workbench suites unless intentionally changed by a future phase.
- AC-005: Product source behavior, Workbench action semantics, public APIs, and runtime managers are unchanged.

## Non-Goals

- No product behavior changes.
- No new Workbench runtime, scheduler loop, queue behavior, Goal Loop behavior, or source apply behavior.
- No broad fixture framework redesign.
- No movement of unrelated residual Workbench domains in this phase.

## Constraints

- Follow Architecture Growth Control: strengthen the existing shared fixture owner instead of creating a second local fixture framework.
- Keep test names and assertions behavior-preserving unless an import/owner move requires mechanical cleanup.
- Use targeted verification first; reserve full Workbench aggregate for close evidence rather than every edit loop.

## Risks

- Moving helpers can accidentally make residual tests depend on the wrong temporary directory owner.
- The TaskQueue runtime cluster overlaps with Workpad projection and scheduler artifact guard coverage; boundaries must be recorded so future splits remain clear.
- `test:fast` could accidentally become slower if the new explicit Workbench suite is not excluded.
