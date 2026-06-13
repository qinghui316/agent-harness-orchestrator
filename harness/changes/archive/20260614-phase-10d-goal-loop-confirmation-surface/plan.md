# Plan: Phase 10D Goal Loop Confirmation Surface

## Approach

Add a small read-model confirmation helper that builds a single `planning.goal-loop.evaluate` item for the selected active Change. Wire it into `buildConfirmationQueue()` only after all existing current confirmation sources have been collected; if `queue.current` already contains anything, do not add the Goal Loop fallback. The existing Workbench action handler from Phase 10C remains responsible for compiling the actual `GoalLoopDecision`.

## Steps

1. Update docs and ECL artifacts for Phase 10D.
2. Add `src/workbench/projections/read-model/confirmation/goal-loop.ts`.
3. Wire the fallback into `src/workbench/projections/read-model/confirmation-queue.ts`.
4. Ensure action scope propagation carries `changeId` and optional `goalLoopDecisionId` without changing public shapes.
5. Add focused tests:
   - fallback appears when selected active Change has no current confirmation;
   - fallback is absent when a more specific confirmation exists;
   - executing the fallback records GoalLoopDecision but does not execute recommended action or create execution artifacts;
   - module-boundary guard keeps Goal Loop read-model glue thin.
6. Run focused, product, and Harness verification; update review/summary; close and commit.

## Decisions

- Use a fallback confirmation item instead of an always-visible primary button.
- Do not add a new frontend page or lazy projection; use existing confirmation item and thread/evidence behavior.
- Do not derive recommended-action confirmation items from `GoalLoopDecision` in this phase. Recommended actions remain projected through their existing owner modules and gates.

## Module Boundary Plan

- Owner module: `src/workbench/projections/read-model/confirmation/goal-loop.ts` for the confirmation item; `src/goal-loop/` remains the owner for decision policy and artifact writes.
- New / moved responsibilities: fallback queue item construction for `planning.goal-loop.evaluate`.
- Facade touch points: `confirmation-queue.ts` imports and calls the helper; no main logic is added to Workbench chat/server/frontend.
- Forbidden write-back locations: `src/workbench/chat.ts`, `src/workbench/actions/handlers/index.ts` main logic, `src/workbench/projections/read-model/implementation.ts`, `src/server/*`, `src/web/src/App.tsx`, scheduler runtime facades, CLI modules.
- Compatibility surface: existing concrete confirmation actions keep priority; `planning.goal-loop.evaluate` action id and handler remain compatible.
- Boundary tests: Workbench confirmation queue tests and module-boundary tests.
- Follow-up split candidates: none.

## Planning-Discovered Gaps

- Need subagent review to confirm whether fallback-only exposure is sufficient and does not confuse users by hiding existing actions.
