# Plan: Phase 9C SchedulerRun Journal Shell Human Gated Launch Record

## Approach

Follow the existing scheduler evidence pattern. Add SchedulerRun as the next owned artifact in `src/workflow-scheduler/`, then add thin Workbench action/projection/frontend wiring.

## Steps

1. Add SchedulerRun types/schema/paths/repository/rendering/journal helpers.
2. Add compile/prepare logic that validates latest checked LaunchPreflight and full lineage/source hashes.
3. Wire `planning.scheduler.run.prepare` through Workbench action handlers, action registry, scope helpers, server revalidation, and frontend request types.
4. Extend Workbench read model, lazy projection, summaries, confirmation queue, thread labels, and frontend workpad display.
5. Update docs and tests, then run focused and full verification.

## Decisions

- Use `planning.scheduler.run.prepare` rather than `start`/`launch` naming to avoid implying execution.
- Use SchedulerRun status `prepared | blocked | abandoned`.
- Preserve the non-execution boundary: SchedulerRun is journal/recovery evidence only.
- Future executor ToolPolicyGate is recorded as required, not already authorized.

## Module Boundary Plan

- Owner module: `src/workflow-scheduler/`.
- New / moved responsibilities: SchedulerRun artifact, journal, guard, rendering, and prepare compiler.
- Facade touch points: `src/workflow-scheduler/manager.ts` re-exports only; Workbench/server/frontend call through existing facades.
- Forbidden write-back locations: `src/workbench/chat.ts`, Workbench read-model facade, server facade, frontend shell, runtime managers.
- Compatibility surface: existing scheduler artifacts/actions remain compatible; add one new Workbench action and lazy projection.
- Boundary tests: workflow-scheduler dependency check, action scope/registry consistency, non-execution artifact absence.
- Follow-up split candidates: none.
- If not applicable, reason: applicable.

## Planning-Discovered Gaps

- Current 9C implementation should first commit the completed Phase 8W-9B Harness evolution handoff state so it is not mixed with product changes.
