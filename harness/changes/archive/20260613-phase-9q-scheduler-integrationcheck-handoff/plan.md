# Plan: Phase 9Q Scheduler IntegrationCheck Handoff

## Approach

Implement 9Q as a bridge, not a new integration subsystem.

The scheduler-owned module will read and verify the latest `SchedulerIntegrationCandidate`, compare its ready targets to current apply readiness, and then delegate to the existing IntegrationCheck service with exact explicit worktree ids. It will write `SchedulerIntegrationCheckHandoff` evidence that links scheduler lineage to the created IntegrationCheck result.

Workbench and server code will only expose the action, enforce stale-target revalidation, display a concise confirmation/summary, and lazy-load the evidence. The existing IntegrationCheck result confirmation remains responsible for apply/discard.

## Steps

1. Repair ECL/handoff drift.
   - Fill active `summary.md`, `spec.md`, `plan.md`, `tasks.md`, and `reviews/review.md`.
   - Update `AGENTS.md` and `docs/STATUS.md` to record Phase 9Q as active.

2. Add scheduler-owned handoff artifact support.
   - Extend `src/scheduler-runtime/types.ts` with `SchedulerIntegrationCheckHandoff`.
   - Extend schemas, paths, repository, rendering, and manager facade exports.
   - Store handoff artifacts under the SchedulerRun runtime area so they remain scheduler-owned sidecar evidence.

3. Implement `src/scheduler-runtime/integration-check-handoff.ts`.
   - Resolve selected Change with `resolveRunnableChangeTarget(... allowLegacyActiveFallback: false)`.
   - Read SchedulerRun/runtime lineage, runtime state, latest claim reservation, and requested/latest `SchedulerIntegrationCandidate`.
   - Require candidate `status="ready"`, `readyCount >= 2`, no duplicate ready worktrees, and latest candidate id match.
   - Re-run apply preview/readiness for each candidate ready target and verify `worktreeId + diffHash + sourceHead` still match the candidate.
   - Call `runIntegrationCheck(project, exactReadyWorktreeIds)` only after all scheduler and target guards pass.
   - Write a handoff artifact containing candidate refs, ready target refs, IntegrationCheck id/status/artifact refs, and `executionStarted: false`.
   - Define idempotency: if a handoff already exists for the same scheduler candidate and exact ready target set, return existing evidence instead of running a duplicate IntegrationCheck.

4. Wire Workbench action and stale revalidation.
   - Add action `planning.scheduler.integration-check.run`.
   - Require `changeId + schedulerRunId + schedulerIntegrationCandidateId`.
   - Add action to registry, live allow-list, high-impact set, revalidated set, target id extraction, strict compatible target matching, result metadata, action labels, server/frontend request types, and typed workflow action union.
   - Add boundary revalidation that rejects missing/latest mismatch/stale candidate before action execution.

5. Update Workbench projections and confirmation queue.
   - After a ready `SchedulerIntegrationCandidate`, show scheduler-scoped handoff as the primary confirmation.
   - Suppress the ordinary auto-discovered `apply-check.run` candidate when it would cover the same scheduler-ready target set without scheduler handoff scope.
   - After handoff/IntegrationCheck exists, keep existing IntegrationCheck apply/discard confirmation behavior unchanged.
   - Add lazy projection for handoff details if needed by existing typed workflow projection patterns.

6. Add tests.
   - Extend action registry and module-boundary tests.
   - Add Workbench/read-model tests for primary confirmation and bypass suppression.
   - Add server/action tests for stale/forged/cross-change/not-ready/ready-count guards.
   - Add behavior tests proving handoff calls explicit IntegrationCheck targets and does not create apply/landing/PR/merge/worker artifacts.

7. Verify and close.
   - Run focused tests.
   - Run full product and Harness verification.
   - Update summary/review verification results.
   - Close the change, handle pending evolution if generated, and commit intended files only; keep untracked `README.md` out.

## Decisions

- Owner module: `src/scheduler-runtime/`.
- IntegrationCheck remains owned by `src/integration-check/`; 9Q delegates to it.
- Handoff is a high-impact Workbench action because it runs real IntegrationCheck evidence and may trigger aggregate validation/audit and IntegrationFix through the existing service.
- No new user-facing scheduler execution layer is introduced. This is still a Harness confirmation gate into existing IntegrationCheck.
- Existing apply/discard confirmation remains the only source-root apply gate after IntegrationCheck.

## Module Boundary Plan

- Owner module: `src/scheduler-runtime/`.
- New / moved responsibilities: scheduler integration handoff guard, handoff artifact schema/repository/rendering, exact target extraction, candidate-target drift checks, idempotency.
- Facade touch points: `src/scheduler-runtime/manager.ts` re-exports the new owner module; Workbench action handler calls the owner module; read-model/frontend only summarize/display.
- Forbidden write-back locations: `src/workbench/chat.ts`, `src/workbench/manager.ts`, `src/workbench/projections/read-model.ts`, `src/server/workbench-server.ts`, `src/web/src/App.tsx`, `src/cli/program.ts`, `src/types/index.ts`, and IntegrationCheck internals except import-compatible usage.
- Compatibility surface: existing IntegrationCheck manager/service APIs remain compatible; existing `apply-check.run/apply/discard` behavior remains compatible.
- Boundary tests: module-boundary test asserts new scheduler-runtime handoff module does not import Workbench/server/web/CLI or implement IntegrationCheck internals; manager facade remains thin.
- Follow-up split candidates: none for 9Q. Later phases may handle scheduler next-worker dispatch or integration candidate batching after 9Q proves the existing IntegrationCheck handoff.

## Planning-Discovered Gaps

- Subagent review found the active 9Q ECL artifacts were still template `TBD`; fixed before implementation.
- Subagent review found a possible bypass through ordinary auto-discovered `apply-check.run`; implementation must suppress or scope that confirmation when a ready scheduler candidate covers the same target set.
- Subagent review found candidate target hash/source-head drift must be checked before handoff, not assumed from the old candidate artifact.
