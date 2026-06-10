# Plan: Phase 8J Scoped TaskRun WorkerLease Boundary Split

## Approach

Use a compatibility-facade refactor. First repair docs drift and write the ECL
record. Then move TaskRun responsibilities into focused modules with minimal
logic changes. While moving, harden the scoped evidence checks around coder Run
matching and workflow-result completion. Keep existing callers on the facade
unless a caller needs to supply scoped context for safety.

## Steps

1. Record baseline dirty state and verify active change context.
2. Update AGENTS/docs STATUS and architecture/runtime/boundary docs for Phase
   8J.
3. Inspect TaskRun callers and identify where scoped context is already
   available.
4. Create TaskRun internal modules: schemas/types, paths/artifacts,
   repository, lease-service, guards, start-retry, reconcile, workflow-result.
5. Convert `src/task-run/manager.ts` to a facade re-exporting existing public
   symbols.
6. Harden scoped evidence matching:
   - coder Run evidence requires matching `taskRunId` and `changeId`;
   - mark-started/running/completion paths validate the owning Change when
     scoped context is available;
   - workflow-result links are only persisted when consistent with the TaskRun.
7. Add/extend boundary and behavior tests.
8. Run focused tests, full product verification, and Harness verification.
9. Update the active change review/summary with final verification and any
   residual risks.

## Decisions

- Preserve `src/task-run/manager.ts` as the stable public import path for this
  phase.
- Treat TaskRun / WorkerLease as coordination evidence only; workflow truth
  remains the accepted Change/ECL -> Run -> validation/audit -> human-gated
  chain.
- Keep scoped hardening fail-closed. If evidence cannot be proven to belong to
  the TaskRun's Change, do not attach it.

## Planning-Discovered Gaps

- Existing public signatures for `markTaskRunStarted()` and
  `finishTaskRunFromWorkflowResult()` are unscoped. Implementation should keep
  compatibility but add scoped options or overload-safe wrappers where callers
  have Change context.
