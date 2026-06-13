# Plan: Phase 10E Goal Loop Iteration Journal Evidence

## Approach

Keep the existing Workbench surface and action id. The user still confirms `planning.goal-loop.evaluate`; the implementation writes additional AHO-owned iteration evidence so repeated evaluations become an auditable continuation chain.

## Implementation Steps

1. Update handoff docs.
   - `AGENTS.md` and `docs/STATUS.md` record Phase 10D archived, Phase 10E active, active change path, and pending evolution none.
   - Architecture/runtime/workbench/boundary docs record `GoalLoopIteration` as non-executing continuation evidence.

2. Add Goal Loop iteration domain support in `src/goal-loop/`.
   - Extend `types.ts` with `GoalLoopIteration`, authority/status/trigger/verdict types.
   - Extend `schemas.ts`.
   - Extend `paths.ts` for latest and versioned iteration artifacts.
   - Extend `repository.ts` with refs/write/read/latest helpers and strict Change scope checks.
   - Extend `rendering.ts` with Markdown rendering.
   - Add compiler helper that reads previous latest decision/iteration before writing current evidence and returns both artifacts.

3. Update Workbench action glue.
   - `src/workbench/actions/handlers/goal-loop.ts` calls the new iteration-aware compiler.
   - Result payload includes `goalLoopDecision` and `goalLoopIteration`, both with `executionStarted=false`.
   - Workbench decision payload records ids/artifacts and high-level verdict; it must not copy recommendedAction into executable action scope.

4. Update workflow action scope plumbing.
   - Add `goalLoopIterationId?: string` to action/request scope types.
   - Include it in scope payload, target id fallback, strict/compatible scope checks, and workflow result scope extraction.
   - Keep required target for `planning.goal-loop.evaluate` as `changeId`.

5. Update user-facing text.
   - Action result summary says a Goal Loop iteration was recorded and no execution started.
   - Fallback confirmation copy stays clear that the action records observe/reason evidence only.

6. Add focused tests.
   - `tests/unit/goal-loop-decision.test.ts` covers first/second iteration lineage and non-execution fields.
   - `tests/unit/workbench.test.ts` covers action result payload and no runtime side effects.
   - `tests/unit/workflow-actions.test.ts` covers `goalLoopIterationId` scope/target propagation.
   - `tests/unit/workbench-module-boundaries.test.ts` covers iteration modules under `src/goal-loop/*`.

## Module Boundary Plan

- Owner module: `src/goal-loop/`.
- New responsibilities: iteration schema, artifact paths, repository, rendering, and iteration-aware compile/write orchestration.
- Facade touch points: `src/goal-loop/manager.ts` only re-exports public symbols.
- Forbidden write-back locations: `src/workbench/chat.ts`, Workbench projection facades, server route facades, frontend shell, scheduler-runtime worker modules, workflow-scheduler manager/facade, CLI command modules.
- Compatibility surface: existing `planning.goal-loop.evaluate` action id and fallback confirmation remain.
- Boundary tests: extend `workbench-module-boundaries.test.ts` for iteration modules and no Workbench/server/web/CLI imports.
- Follow-up split candidates: none expected; do not add a Goal Loop controller in this phase.

## Verification Plan

- Focused tests:
  - `npm run test -- tests/unit/goal-loop-decision.test.ts`
  - `npm run test -- tests/unit/workflow-actions.test.ts`
  - `npm run test -- tests/unit/workbench.test.ts`
  - `npm run test -- tests/unit/workbench-module-boundaries.test.ts`
- Full gates:
  - `npm run typecheck`
  - `npm run lint`
  - `npm run test`
  - `npm run build`
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`

## Risk Controls

- Avoid `completed` as an iteration status; use `recorded` plus explanatory continuation verdict.
- Capture previous ids before writing the new decision.
- Keep recommended action as an artifact snapshot only; do not surface it as a fallback executable action.
- If any runtime artifact is created by evaluation, treat it as a bug.
