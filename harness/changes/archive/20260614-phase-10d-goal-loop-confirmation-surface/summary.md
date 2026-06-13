# Phase 10D Goal Loop Confirmation Surface

## Purpose

Phase 10D connects the Phase 10C non-executing `GoalLoopDecision` evidence to the ordinary Workbench confirmation surface. The goal is small and user-facing: when a selected active Change has no more specific current confirmation item, Workbench may show a single `评估目标循环` confirmation that runs `planning.goal-loop.evaluate` and records the main Agent's next-step decision.

This phase does not implement an autonomous loop controller. A GoalLoopDecision can explain or recommend an existing action, but it must not execute that recommendation, hide the separate human gate, start workers, run IntegrationCheck, mutate source, or close a Change.

## Scope

In scope:

- Add an owned Workbench confirmation helper for Goal Loop evaluation.
- Add the helper to confirmation queue assembly only as a fallback when no more specific current confirmation exists.
- Keep `planning.goal-loop.evaluate` scoped to selected active `changeId`.
- Add focused read-model, action-scope, and module-boundary tests.
- Update docs and ECL handoff for Phase 10D.

Out of scope:

- Scheduler loop, start-all, whole-wave dispatch, slot allocator, or automatic worker chain.
- Automatically executing `GoalLoopDecision.recommendedAction`.
- Creating TaskRuns, WorkerLeases, worktrees, runs, WorkerSessions, RuntimeWorkspaces, EventSources, IntegrationChecks, child Changes, apply/close records, landing/PR/merge records, or source mutations.
- New CLI command, HTTP route, frontend page, lazy projection, artifact-shape change, or new scheduler runtime behavior.

## Current Status

Ready to close.

## Verification

- `npm run test -- tests/unit/workbench-module-boundaries.test.ts` passed.
- `npm run test -- tests/unit/workflow-actions.test.ts` passed.
- `npm run test -- tests/unit/goal-loop-decision.test.ts` passed.
- `npm run test -- tests/unit/workbench.test.ts` passed.
- `npm run test -- tests/unit/workbench-server.test.ts` passed.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run test` passed.
- `npm run build` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` passed with no pending evolution.

## Acceptance Feedback

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: persistent goal required two subagent review rounds before implementation; both completed and supported fallback-only implementation.
- Retries or environment failures: full `workbench.test.ts` initially exposed two existing long scheduler scenarios exceeding their prior 120s test budget on Windows; their per-test timeout was raised to 300s and both passed individually and in the full suite.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable; no source-root mutation is in scope.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.
