# Plan: Workbench Test Architecture Task Runtime Domain Split

## Approach

Use a behavior-preserving test relocation. The new suite becomes the owner for TaskRun / TaskQueue / WorkflowRun / typed-workflow runtime and scoped Workbench action guard coverage. Shared fixture builders and record writers move to the existing `tests/unit/workbench/fixtures.ts` owner so the split lowers future cost instead of creating another private test framework.

## Steps

1. Export the TaskRun / TaskQueue / WorkflowRun / typed-workflow fixture builders and record writers from `tests/unit/workbench/fixtures.ts`.
2. Create `tests/unit/workbench-task-runtime.test.ts` and move the coherent runtime/action-validation tests into it.
3. Remove the moved tests and duplicate helper implementations from `tests/unit/workbench.test.ts`, leaving unrelated residual domains in place.
4. Update `package.json` so `test:workbench` explicitly runs the new suite and `test:fast` keeps excluding explicit Workbench capability suites.
5. Run targeted verification: new suite, residual `workbench.test.ts`, TypeScript/lint checks, and the relevant Workbench aggregate once for close evidence.

## Decisions

- The direct TaskQueue reconcile case after the initial queue blocker cluster is in scope because it uses the same TaskQueue/TaskRun runtime record helpers.
- The multi-Workpad memory-isolation case remains residual because it is primarily Workpad/read-model/memory isolation even though it uses TaskQueue fixtures.
- Low-level SchedulerContract compile and workflow hash normalization may move as typed workflow/runtime artifact guard coverage. The broad Workbench scheduler planning flow remains residual for a later scheduler/planning suite split.
- This change does not alter product code or behavior.

## Module Boundary Plan

- Owner module: `tests/unit/workbench-task-runtime.test.ts` owns TaskRun / TaskQueue / WorkflowRun / typed-workflow runtime guard coverage; `tests/unit/workbench/fixtures.ts` owns shared Workbench test fixture builders and record writers.
- New / moved responsibilities: moved tests and helper exports only.
- Facade touch points: `tests/unit/workbench.test.ts` remains the residual Workbench suite for unrelated domains.
- Forbidden write-back locations: do not add new copied fixture helpers back into `tests/unit/workbench.test.ts` or the new suite when `fixtures.ts` can own them.
- Compatibility surface: test runner scripts and product behavior remain compatible.
- Boundary tests: run the new suite and residual Workbench suite.
- Follow-up split candidates: scheduler/planning flow, Goal Loop, proposal feedback, demand-worker/AgentTask residual clusters.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: existing Workbench fixture owner and explicit `test:workbench` capability-suite contract.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new cross-cutting mechanism is proposed.
- Domain-specific logic location: task-runtime assertions live in the new task-runtime suite.
- Shared cross-cutting logic location: fixture builders, temporary project access, and record-writing helpers live in `tests/unit/workbench/fixtures.ts`.
- Local framework / state machine / projection / validation / gate avoided: avoids a feature-local copy of TaskQueue/TaskRun fixture writers and avoids another private test harness.
- Future-cost reduction for similar features: future changes in TaskRun/TaskQueue runtime or scoped action validation can run the new suite directly.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

- Subagent plan review passed and recommended moving the direct TaskQueue reconcile case, keeping mixed multi-Workpad memory-isolation residual, updating `test:fast` exclusion, and leaving the broad scheduler planning flow for later.
