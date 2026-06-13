# Plan: Phase 9P Scheduler Worker Integration Candidate Bridge

## Approach

Use `src/scheduler-runtime/` as the owner module for the bridge. The compiler will read the selected scheduler run lineage, collect scheduler-owned approved worker audit and rework audit outputs, reject ambiguous same-claim outputs, and run the existing apply preview/readiness gate for every accepted worktree. The Workbench/server/frontend changes remain thin dispatch, projection, and display surfaces.

## Steps

1. Repair Phase 9O handoff drift and document Phase 9P as active.
2. Add `SchedulerIntegrationCandidate` types, schema/path/repository/rendering, and compiler in `src/scheduler-runtime/`.
3. Add the Workbench action, stale-target scope, action result, lazy projection, and UI summary.
4. Add focused tests for action registry, boundary imports, candidate semantics, and waiting/no-execution behavior.
5. Run product and Harness verification.

## Decisions

- Candidate compilation is evidence-only. It must not run IntegrationCheck or expose apply/merge controls.
- Scheduler evidence is not enough to become a merge target; each output must pass the existing apply preview/readiness gate.
- If original approved output and rework approved output exist for the same `claimIntentId`, the candidate records a blocked inconsistency instead of choosing one silently.

## Module Boundary Plan

- Owner module: `src/scheduler-runtime/`.
- New / moved responsibilities: scheduler integration candidate schema, compile logic, repository, artifact paths, Markdown rendering, and facade export.
- Facade touch points: `src/scheduler-runtime/manager.ts` exports the new module; Workbench action handlers call the facade as a compatibility entrypoint.
- Forbidden write-back locations: `src/workbench/chat.ts`, Workbench projection facades, server route facades, frontend shell files, CLI command modules, and `src/workflow-scheduler/` pre-execution modules.
- Compatibility surface: existing scheduler runtime artifacts/actions remain unchanged; the new action and lazy projection are additive.
- Boundary tests: module-boundary test asserts scheduler-runtime modules do not import Workbench/server/web/CLI broad facades.
- Follow-up split candidates: none.
- If not applicable, reason: applicable.

## Planning-Discovered Gaps

None.
