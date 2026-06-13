# Plan: Phase 10A Scheduler User Facing Execution Surface Consolidation

## Approach

Use the existing scheduler runtime modules as the source of truth for legal transitions. Phase 10A changes the Workbench surface and handler ownership, not the scheduler runtime semantics.

The implementation will add a small scheduler user-surface mapper for confirmation labels/summaries and move scheduler action handler glue from the broad planning handler file into a dedicated Workbench scheduler handler module. Existing action ids and request payload shapes remain the compatibility surface.

## Steps

1. Update docs and active ECL artifacts for Phase 10A.
2. Add a scheduler user-surface mapper for internal action -> user-facing stage label / summary / risk language.
3. Apply the mapper in typed workflow confirmation projection and frontend action labels without changing action ids.
4. Move scheduler action handler functions into `src/workbench/actions/handlers/scheduler.ts`; keep `handlers/index.ts` as dispatch glue.
5. Add/tighten module-boundary tests and Workbench confirmation tests.
6. Run focused verification, then full product and Harness checks.
7. Close the ECL change and commit, keeping unrelated `README.md` untracked.

## Decisions

- Do not introduce an aggregate `planning.scheduler.*` action that can run multiple high-impact transitions in one click.
- Keep existing internal scheduler action ids for server and audit compatibility.
- Treat label consolidation as user-surface honesty, not as a new authority layer.

## Module Boundary Plan

- Owner module: `src/scheduler-runtime/` remains domain owner for scheduler legality and evidence. Workbench scheduler UI/action glue belongs in `src/workbench/actions/handlers/scheduler.ts` and `src/workbench/projections/read-model/confirmation/scheduler-user-surface.ts`.
- New / moved responsibilities: user-facing scheduler stage copy and scheduler Workbench action handler glue.
- Facade touch points: `src/workbench/actions/handlers/index.ts` dispatch map, `src/workbench/projections/read-model/confirmation/typed-workflow.ts`, frontend action-label helper, docs/status.
- Forbidden write-back locations: `src/workbench/chat.ts`, `src/server/workbench-server.ts`, `src/web/src/App.tsx`, `src/workbench/manager.ts`, scheduler-runtime manager facade, workflow-scheduler manager facade, CLI command modules.
- Compatibility surface: existing `planning.scheduler.*` action ids, Workbench action request/response shape, decision/audit scope, thread storage, SSE/live events, scheduler artifacts.
- Boundary tests: `tests/unit/workbench-module-boundaries.test.ts`, `tests/unit/workflow-actions.test.ts`, `tests/unit/workbench.test.ts`, `tests/unit/workbench-server.test.ts`.
- Follow-up split candidates: true scheduler loop/slot allocator remains a later product phase after this user-surface consolidation is stable.

## Planning-Discovered Gaps

- Current scheduler confirmation projection exposes many internal labels after launch. This is a UX/product-boundary gap, not a workflow-truth gap.
- `src/workbench/actions/handlers/planning.ts` still owns a large block of scheduler action handler glue; moving it reduces future regression risk.
