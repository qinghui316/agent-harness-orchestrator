# Plan: Phase 10R Goal Loop Controller Policy Refresh Surface

## Approach

Add an explicit non-primary controller refresh action that is available only beside an already-visible concrete Harness gate whose action type and target ids match the latest Goal Loop packet. The action writes a `GoalLoopControllerPolicy` artifact through `src/goal-loop/controller.ts`; Workbench projection continues to only read and display latest valid policy evidence.

## Steps

1. Fix Phase 10Q -> 10R handoff drift in docs.
2. Extend workflow action types, request payload, target/scope extraction, and stale-target revalidation for controller policy refresh.
3. Add a thin Workbench goal-loop handler for `planning.goal-loop.controller.refresh`.
4. Attach the refresh as a secondary action on matching concrete Harness gates only.
5. Update action result wording, read-model projection tests, server stale revalidation tests, and module-boundary tests.
6. Run focused and full verification, then close and commit.

## Decisions

- Use a new secondary action instead of automatic read-model writes.
- Do not add a new primary confirmation item.
- Keep controller policy compilation in `src/goal-loop`; Workbench supplies only current gate snapshot.
- Treat refresh as high-impact/revalidated because it writes durable evidence and audit scope.

## Module Boundary Plan

- Owner module: `src/goal-loop`.
- New / moved responsibilities: controller policy refresh remains a Goal Loop policy compile/write operation.
- Facade touch points: `src/goal-loop/manager.ts` remains a re-export facade; Workbench action handler calls the owner module.
- Forbidden write-back locations: `src/workbench/chat.ts`, server route facades, frontend shell, scheduler-runtime modules, workflow-scheduler modules, CLI command modules.
- Compatibility surface: existing `planning.goal-loop.evaluate` and `planning.goal-loop.feedback.evaluate` remain compatible.
- Boundary tests: Goal Loop unit tests, Workbench projection/action tests, workflow action registry tests, server stale-target tests, module-boundary tests.
- Follow-up split candidates: none.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

None yet.
