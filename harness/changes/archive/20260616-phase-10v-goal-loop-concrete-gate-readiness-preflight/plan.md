# Plan: Phase 10V Goal Loop Concrete Gate Readiness Preflight

## Approach

Implement a narrow, non-executing readiness bridge from Goal Loop evidence to the current concrete Workbench gate.

The Goal Loop owner module will compile and persist a `GoalLoopGateReadinessPreflight` artifact from selected Change context, latest packet/policy lineage, current gate snapshot, packet freshness, and dynamic concrete gate required-target validation. Workbench, server, and frontend/projection code will only expose the action, pass scoped payloads, and render evidence summaries.

## Steps

1. Update handoff docs for Phase 10U archived / Phase 10V active and record the non-executing boundary.
2. Add Goal Loop types/schema/paths/repository/rendering/compiler for concrete gate readiness preflight.
3. Add `planning.goal-loop.gate-readiness.prepare` to workflow action registry, required targets, scope extraction, target id extraction, live/high-impact/revalidated sets.
4. Add Workbench action handler glue that calls the Goal Loop compiler and writes assistant card + decision/audit evidence.
5. Add stale-target revalidation/server boundary checks for packet/policy/current gate parity.
6. Add confirmation projection glue so the preflight action appears only as a secondary action on the matching concrete gate.
7. Add or update focused tests for Goal Loop compiler, workflow action registry/scope, Workbench projection/action behavior, server stale revalidation, and module boundaries.
8. Run focused and full verification, update review/tasks/summary, then close/git if clean.

## Decisions

- Use readiness/preflight naming, not invocation, because this stage does not call the concrete action.
- Keep the concrete gate as the only primary executable confirmation. The new action is secondary evidence preparation.
- Treat `planning.goal-loop.*` concrete targets as invalid to prevent recursive Goal Loop preparation.
- Let the prepare action itself remain high-impact/revalidated for audit and stale safety, while explicitly recording that it is not ToolPolicy authorization for the concrete gate.

## Module Boundary Plan

- Owner module: `src/goal-loop/`.
- New / moved responsibilities: `GoalLoopGateReadinessPreflight` type/schema, path helpers, repository read/write, Markdown rendering, and compiler/guard logic.
- Facade touch points: `src/goal-loop/manager.ts` re-export only; Workbench handler calls owner module; server revalidation and projection attach thin glue.
- Forbidden write-back locations: `src/workbench/chat.ts`, `src/workbench/manager.ts`, `src/workbench/projections/read-model.ts`, `src/server/workbench-server.ts`, `src/web/src/App.tsx`, CLI modules, broad types/index barrels, and domain manager facades for main implementation.
- Compatibility surface: existing Goal Loop actions and artifacts remain unchanged; current primary confirmation queue shape stays compatible; new action adds scoped payload fields.
- Boundary tests: `tests/unit/workbench-module-boundaries.test.ts`, `tests/unit/workflow-actions.test.ts`, `tests/unit/workbench.test.ts`, `tests/unit/workbench-server.test.ts`, and Goal Loop focused tests.
- Follow-up split candidates: if future phases implement actual gate invocation, place execution orchestration in a new owned module and require a fresh phase with separate ToolPolicy/human gate semantics.
- If not applicable, reason: not applicable; module boundary coverage is required.

## Planning-Discovered Gaps

- The action name must avoid "invocation" semantics. Use `planning.goal-loop.gate-readiness.prepare`.
- Existing Goal Loop gate parity logic appears in multiple places; this phase may add a small reusable helper if needed, but it must not broaden into a refactor-only phase.
- The concrete gate target validation needs to reuse existing workflow action required-target validation rather than trust packet scope alone.
