# Plan: Phase 8L Scoped WorkflowRun Boundary Split

## Implementation Strategy

1. Repair handoff docs for Phase 8L active state and latest evolution archive.
2. Add WorkflowRun guard helpers that validate requested `changeId`, persisted
   run `changeId`, queue binding, and event row scope.
3. Split `src/workflow-run/manager.ts` into owned modules while keeping the
   existing facade exports stable.
4. Update TaskQueue / workflow-runtime imports only where needed to use the
   facade or new modules without creating reverse dependencies.
5. Extend unit tests for misplaced WorkflowRun, forged event rows, canonical
   event append, cross-queue sync rejection, facade compatibility, and module
   boundaries.
6. Run focused tests, full product verification, and Harness verification.

## Module Boundary

`src/workflow-run/manager.ts` remains the compatibility facade. Owned modules:

- `schemas.ts` / `types.ts`: WorkflowRun and recovery key schemas/types.
- `paths.ts`: workflow run and event journal paths.
- `guards.ts`: Change scope, queue binding, and event row assertions.
- `repository.ts`: read/write/list/get latest WorkflowRun.
- `events.ts`: append and read WorkflowRun events.
- `recovery-key.ts`: build and recompute recovery keys.
- `proposal-start-validation.ts`: validate TaskQueueProposal/Readiness/Graph
  start input and source hashes.
- `lifecycle-sync.ts`: create/bind/sync/resume WorkflowRun lifecycle.
- `stage-resume.ts`: derive StageResumeVerdict.
- `summary.ts`: summarize WorkflowRun for projections.

New modules must not import the facade, Workbench, server routes, web UI, or CLI
command modules.

## Behavior Notes

- Strict APIs throw on invalid scope: `readWorkflowRun()`,
  `readWorkflowRunEvents()`, event append, lifecycle sync, and resume.
- Projection listing skips invalid/misplaced runs so the Workbench shell remains
  usable while refusing to display bad evidence.
- Event append copies only allowed payload fields and sets canonical
  `workflowRunId`, `changeId`, `type`, and `timestamp` from the WorkflowRun and
  call site.
- Queue lifecycle sync rejects if existing `run.queueRunId` or
  `queue.workflowRunId` points at another object.

## Verification Plan

Focused:

- `npm run test -- tests/unit/workbench.test.ts`
- `npm run test -- tests/unit/workbench-server.test.ts`
- `npm run test -- tests/unit/workflow-actions.test.ts`
- `npm run test -- tests/unit/workbench-module-boundaries.test.ts`

Full:

- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run build`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`

## Follow-Up

Likely remaining module cleanup is `src/run/manager.ts` and
`src/change/manager.ts`. After those, avoid more broad modularization phases and
prefer local refactors attached to concrete product features.
