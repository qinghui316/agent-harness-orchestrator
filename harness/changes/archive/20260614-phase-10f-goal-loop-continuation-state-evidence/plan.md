# Plan: Phase 10F Goal Loop Continuation State Evidence

## Approach

Extend the existing `GoalLoopIteration` artifact rather than adding a new
canonical state file. Two independent subagent reviews recommended this
modified scope because the project already has a per-evaluation journal and a
new state artifact could be confused with workflow truth.

The implementation will add additive fields to `GoalLoopIteration`: a
continuation state, a control-policy snapshot, a conservative budget/accounting
signal, resume preconditions, and an optional suppression reason. These fields
are computed in `src/goal-loop/compiler.ts` from the current decision and
evidence snapshot.

## Steps

1. Update docs handoff for Phase 10F active.
2. Extend Goal Loop types and schemas with continuation-state fields.
3. Compute continuation-state fields in the Goal Loop compiler.
4. Render the new fields in Goal Loop iteration Markdown and Workbench summary
   text where applicable.
5. Update focused tests for Goal Loop artifacts, Workbench fallback behavior,
   workflow action scope, and module boundaries.
6. Run verification, update ECL closeout notes, close, and commit.

## Decisions

- Do not create a standalone `GoalLoopState` artifact in 10F.
- Do not add a Workbench action. `planning.goal-loop.evaluate` remains the only
  entrypoint.
- Do not copy Codex thread goal runtime semantics; only borrow the idea of a
  continuation state snapshot and evidence-first completion audit.
- Treat budget/accounting as `unknown` unless AHO has a canonical evidence
  source.

## Module Boundary Plan

- Owner module: `src/goal-loop/`.
- New / moved responsibilities: continuation state typing, schema validation,
  compiler derivation, and Markdown rendering.
- Facade touch points: `src/goal-loop/manager.ts` remains re-export facade;
  Workbench goal-loop handler consumes the existing compiler result.
- Forbidden write-back locations: Workbench handler implementation, Workbench
  confirmation projection, server routes, web UI shell, CLI command modules,
  scheduler-runtime worker-start modules, and source mutation/apply/close code.
- Compatibility surface: existing `GoalLoopDecision` and `GoalLoopIteration`
  paths remain; `GoalLoopIteration` gains additive fields.
- Boundary tests: `tests/unit/workbench-module-boundaries.test.ts` plus focused
  Goal Loop and workflow-action tests.
- Follow-up split candidates: none.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

- Subagent review 1 scored `88/100` and recommended proceeding only if the
  state is a derived evidence snapshot, not a lifecycle authority.
- Subagent review 2 scored `86/100` and recommended extending
  `GoalLoopIteration` rather than introducing a separate artifact.
- Workbench text still mentions writing only `GoalLoopDecision`; this phase must
  update it to Decision + Iteration + continuation state evidence.
