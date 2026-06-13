# Plan: Phase 10C Main Agent Goal Loop Decision Evidence Foundation

## Approach

Implement a contract-first, non-executing Goal Loop policy layer. The core implementation lives in `src/goal-loop/` and compiles `GoalLoopDecision` from selected Change evidence. Workbench only dispatches the action and reports the artifact result.

The first version will be intentionally conservative: it reads active Change context plus available planning/scheduler/runtime evidence and classifies the next step as a recommendation, not an execution. It may point to an existing action type only when the required scoped ids are known. Otherwise it returns a wait, blocked, human-gate, or planning-needed recommendation.

## Steps

1. Update handoff docs for Phase 10C active and remove stale Phase 10B active claims.
2. Add `src/goal-loop/`:
   - `types.ts`
   - `schemas.ts`
   - `paths.ts`
   - `repository.ts`
   - `compiler.ts`
   - `rendering.ts`
   - `manager.ts`
3. Add `planning.goal-loop.evaluate` action registration, required-target handling, high-impact/stale revalidation, result labeling, and owned handler glue.
4. Implement conservative decision compilation:
   - accepted planning missing -> planning needed / human gate
   - scheduler launch evidence ready -> recommend existing scheduler action only with ids
   - scheduler path blocked/exhausted -> blocked or human gate
   - integration/apply/close-ready states remain recommendations only
   - ambiguous/conflicting evidence -> wait or blocked, never parallel start
5. Add unit and boundary tests for artifacts, no-execution behavior, action registry, stale target handling, module boundaries, and `orchestrator.evaluate` compatibility.
6. Run focused and full verification, update review/summary/tasks, close, and commit.

## Decisions

- Use a new action `planning.goal-loop.evaluate`, not `orchestrator.evaluate`, because compiling planning evidence should be high-impact and stale-revalidated.
- Keep `orchestrator.evaluate` as existing demand-worker status inspection for compatibility.
- Keep Goal Loop evidence separate from scheduler runtime. `src/goal-loop/` decides policy; `src/workflow-scheduler/` and `src/scheduler-runtime/` own scheduler evidence and execution gates.
- Do not add a UI/lazy projection in this phase unless needed by existing action-result reporting.

## Module Boundary Plan

- Owner module: `src/goal-loop/`.
- New / moved responsibilities: GoalLoopDecision schema/type, artifact path, repository read/write, compiler, Markdown renderer, manager facade.
- Facade touch points: `src/goal-loop/manager.ts` re-exports owner modules; `src/workbench/actions/handlers/goal-loop.ts` is thin dispatch glue.
- Forbidden write-back locations: `src/workbench/chat.ts`, `src/workbench/actions/handlers/index.ts` main logic, `src/workbench/demand-workers/orchestration.ts`, `src/server/workbench-server.ts`, `src/web/src/App.tsx`, `src/workflow-scheduler/manager.ts`, `src/scheduler-runtime/manager.ts`, CLI command modules.
- Compatibility surface: existing `orchestrator.evaluate`, scheduler actions, demand-worker actions, Run/Validation/Audit/IntegrationCheck/Apply behavior unchanged.
- Boundary tests: `workbench-module-boundaries.test.ts` checks owner files, forbidden imports, forbidden execution function names, handler glue shape, and `orchestrator.evaluate` non-contamination.
- Follow-up split candidates: none.
- If not applicable, reason: applicable.

## Planning-Discovered Gaps

- Second-round subagent review required explicit active `changeId` revalidation for `planning.goal-loop.evaluate`; this is now part of AC-006.
- Second-round subagent review required `executionStarted` to be a literal false in schema; this is now part of AC-003.
- Second-round subagent review required recommended existing action types to carry required scope ids; this is now part of AC-005.
