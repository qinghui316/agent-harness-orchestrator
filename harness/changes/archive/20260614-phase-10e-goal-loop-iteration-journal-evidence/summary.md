# Phase 10E Goal Loop Iteration Journal Evidence

## Purpose

Phase 10E turns the one-off `GoalLoopDecision` fallback evaluation into a durable Goal Loop iteration journal. Each explicit user-confirmed `planning.goal-loop.evaluate` action should still only evaluate the long-running Goal/Change, but it must also write a scoped `GoalLoopIteration` evidence record that links the previous iteration/decision to the current decision.

This keeps the project aligned with Loop Engineering and Codex `goal` continuation ideas without adding an autonomous loop controller, scheduler loop, source mutation, or recommended-action execution. The iteration is continuation evidence only; concrete planning, scheduler, IntegrationCheck, apply, close, landing, PR, and remote actions remain separate Harness gates.

## Scope

In scope:

- Add `GoalLoopIteration` type/schema/path/repository/rendering support under `src/goal-loop/`.
- Extend `planning.goal-loop.evaluate` to write one `GoalLoopDecision` and one `GoalLoopIteration` per explicit confirmation.
- Preserve previous latest decision/iteration lineage by reading previous state before writing the current decision.
- Add action payload/scope support for `goalLoopIterationId`.
- Update Workbench result copy and decision payload to record ids/artifacts without making `recommendedAction` executable authority.
- Add focused tests for iteration lineage, fallback behavior, non-execution, and module boundaries.
- Update handoff docs for Phase 10D archived and Phase 10E active.

Out of scope:

- New Workbench action, CLI command, HTTP route, UI/lazy projection, scheduler loop, parallel executor, slot allocator, child Change, ODWF runtime, cache/replay, or source mutation.
- Executing `GoalLoopDecision.recommendedAction`.
- Putting Goal Loop evaluation in `workpad.nextAction`.
- Starting workers, TaskRuns, WorkerLeases, worktrees, runs, WorkerSessions, RuntimeWorkspaces, EventSources, IntegrationCheck, apply/close, landing, PR, merge, validation, audit, or rework from the Goal Loop action.
- Replacing Change/ECL, accepted artifacts, Run, Validation, Audit, IntegrationCheck, Apply/Close human gates, ToolPolicyGate, or Harness evolution.

## Current Status

Ready to close.

Before close, replace this with `Completed.` or `Ready to close.` and keep verification details current. The local close command rejects stale active/planning statuses.

## Verification

- `npm run typecheck` passed.
- `npm run test -- tests/unit/goal-loop-decision.test.ts` passed.
- `npm run test -- tests/unit/workflow-actions.test.ts` passed.
- `npm run test -- tests/unit/workbench-module-boundaries.test.ts` passed.
- `npm run test -- tests/unit/workbench.test.ts -t "goal loop"` passed.
- `npm run lint` passed.
- `npm run build` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` passed with no pending evolution.
- `npm run test` timed out at 364 seconds with no failure output captured.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Extra prompts or reviewer instructions: persistent goal requested two subagent logic/boundary reviews before execution; subagents recommended `modify then proceed` with scores `84/100` and `88/100`.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

