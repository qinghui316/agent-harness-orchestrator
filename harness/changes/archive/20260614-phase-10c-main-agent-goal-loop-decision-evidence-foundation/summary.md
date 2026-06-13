# Phase 10C Main Agent Goal Loop Decision Evidence Foundation

## Purpose

Phase 10C turns the Phase 10B Loop Engineering / Codex goal reference alignment into a small product-code foundation: AHO will compile a non-executing `GoalLoopDecision` planning evidence artifact for the selected Change. The decision helps the main Agent explain the next legal step for a long-running Goal/Change, including conflict-aware parallel/sequential/rework/integration choices, without becoming a scheduler loop or workflow truth.

The phase adds an owned `src/goal-loop/` module and a high-impact Workbench action, `planning.goal-loop.evaluate`, that writes and returns policy evidence only. It must not start workers, create TaskRuns, allocate WorkerLeases, create worktrees or runs, run IntegrationCheck, mutate source, close a Change, create child Changes, or bypass ToolPolicyGate / Validation / Audit / IntegrationCheck / human gates.

## Scope

In scope:

- Add `GoalLoopDecision` schema/types, artifact paths, repository, compiler, Markdown renderer, and compatibility facade under `src/goal-loop/`.
- Add `planning.goal-loop.evaluate` as a scoped, high-impact, revalidated Workbench action that compiles the latest GoalLoopDecision for the selected active Change.
- Add thin Workbench action-handler glue in an owned handler module, not in broad facades.
- Update action registry, result labeling, stale-target revalidation, docs, and tests for the new non-executing planning evidence.
- Preserve `orchestrator.evaluate` as demand-worker status inspection; do not make it write GoalLoopDecision evidence.

Out of scope:

- Scheduler loop, whole-wave dispatch, slot allocator, automatic worker chain, or full parallel executor.
- Creating TaskRuns, WorkerLeases, worktrees, runs, WorkerSessions, RuntimeWorkspaces, EventSources, IntegrationChecks, child Changes, or source mutations.
- Running validation, audit, apply, close, landing, PR, merge, or IntegrationFix.
- New CLI command, HTTP route, frontend page, lazy projection, artifact-shape changes outside the new GoalLoopDecision artifacts.

## Current Status

Ready to close.

## Verification

- Focused: `npm run test -- tests/unit/goal-loop-decision.test.ts`
- Focused: `npm run test -- tests/unit/workflow-actions.test.ts`
- Focused: `npm run test -- tests/unit/workbench-module-boundaries.test.ts`
- Focused: `npm run test -- tests/unit/workbench-server.test.ts`
- Product: `npm run typecheck`
- Product: `npm run lint`
- Product: `npm run build`
- Product: `npm run test`
- Harness: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- Harness: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- Harness: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- Harness: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`

## Acceptance Feedback

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: two independent subagent review rounds completed before implementation; both approved the corrected Phase 10C boundary after switching from `orchestrator.evaluate` reuse to a dedicated `planning.goal-loop.evaluate` action.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable; no source-root mutation is in scope.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.
