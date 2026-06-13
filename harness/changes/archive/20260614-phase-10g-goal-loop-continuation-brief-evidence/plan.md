# Plan: Phase 10G Goal Loop Continuation Brief Evidence

## Implementation Plan

1. Update handoff docs for Phase 10G active.
2. Add `GoalLoopContinuationBrief` to `src/goal-loop/types.ts` and schema
   validation to `src/goal-loop/schemas.ts`.
3. Add artifact paths and repository helpers for latest and versioned brief
   JSON/Markdown artifacts.
4. Add Markdown rendering for continuation briefs.
5. Extend `compileGoalLoopEvaluation()` to write the decision and iteration,
   re-read latest iteration, validate scope/non-execution, then write the
   continuation brief.
6. Export the new type/helpers through `src/goal-loop/manager.ts`.
7. Update the Workbench goal-loop handler to record/display the brief artifact
   while remaining a thin caller.
8. Add optional `goalLoopContinuationBriefId` scope metadata to Workbench action
   payload helpers without changing action authority.
9. Update docs for architecture/runtime/workbench/boundary references.
10. Update focused tests and run verification.

## Module Boundary Plan

- Owner module: `src/goal-loop/`.
- New responsibilities:
  - continuation brief type/schema
  - artifact path/repository helpers
  - brief rendering
  - brief derivation from latest iteration
- Facade touch points:
  - `src/goal-loop/manager.ts` re-exports public symbols only.
  - Workbench handler records the returned artifact id/ref.
- Forbidden write-back locations:
  - `src/workbench/chat.ts`
  - server route files
  - web shell files
  - CLI command modules
  - scheduler-runtime/workflow-scheduler execution modules
  - apply/close/landing/PR modules
- Compatibility surface:
  - Existing `planning.goal-loop.evaluate` action id remains unchanged.
  - Existing `GoalLoopDecision` and `GoalLoopIteration` artifact shapes remain
    readable; only additive references are allowed.
- Boundary tests:
  - New goal-loop modules do not import Workbench/server/web/CLI or execution
    modules.
  - Goal Loop evaluation creates no runtime/source-mutation artifacts.

## Subagent Review Input

Two independent read-only reviews recommended `modify` rather than a broader
controller:

- Review 1: `87/100`, proceed only as Continuation Brief Evidence; do not add
  hidden continuation turns, action/route/UI, or Codex goal runtime behavior.
- Review 2: `89/100`, prefer a separate derived brief artifact instead of
  storing long prompt text in `GoalLoopIteration`; recommended action must stay
  a snapshot and separate Harness gate.

## Verification Plan

- `npm run test -- tests/unit/goal-loop-decision.test.ts`
- `npm run test -- tests/unit/workflow-actions.test.ts`
- `npm run test -- tests/unit/workbench.test.ts -t "goal loop"`
- `npm run test -- tests/unit/workbench-module-boundaries.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`
