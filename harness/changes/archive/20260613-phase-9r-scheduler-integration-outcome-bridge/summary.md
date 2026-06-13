# Phase 9R Scheduler Integration Outcome Bridge

## Purpose

Phase 9R closes the gap after Phase 9Q: once scheduler-owned ready worktrees have been handed to the existing IntegrationCheck engine, the scheduler runtime needs a scoped outcome record that explains what happened next without duplicating or bypassing IntegrationCheck apply/discard behavior.

This phase adds scheduler-owned outcome evidence for IntegrationCheck terminal states and source-root apply/discard consumption. It does not implement a new IntegrationCheck engine, apply command, landing path, PR handoff, next-worker dispatch, scheduler loop, slot allocator, or full parallel executor.

## Scope

In scope:

- Add `SchedulerIntegrationOutcome` evidence under the existing `src/scheduler-runtime/` owner module.
- Reconcile the latest scheduler IntegrationCheck handoff with the current existing `IntegrationCheckRecord`.
- Record terminal outcomes for applied, discarded, blocked, conflict, validation-failed, audit-failed, stale-result, or failed IntegrationCheck states.
- Preserve the existing IntegrationCheck `passed` apply/discard confirmation as the only source-root mutation path.
- Add Workbench summary/lazy projection for scheduler integration outcome evidence.
- Add action registry, stale-target, scope-payload, and module-boundary coverage.

Out of scope:

- No new IntegrationCheck engine.
- No source-root apply or discard implementation.
- No aggregate validation or aggregate audit changes.
- No landing package, Draft PR, remote merge, or post-merge behavior.
- No next worker, whole-wave dispatch, scheduler loop, slot allocator, WorkerLease allocation, or full parallel executor behavior.
- No child Change creation, ODWF JavaScript runtime, cache/replay, or SQLite canonical scheduler state.

## Current Status

Completed.

## Verification

Completed:

- `npm run typecheck` - pass.
- `npm run lint` - pass.
- `npm run test -- tests/unit/workflow-actions.test.ts` - pass.
- `npm run test -- tests/unit/workbench-module-boundaries.test.ts` - pass.
- `npm run test -- tests/unit/scheduler-integration-outcome.test.ts` - pass.
- `npm run test -- tests/unit/workbench-server.test.ts` - pass.
- `npm run test -- tests/unit/workbench.test.ts` - pass; rerun with extended timeout after an initial 120s timeout.
- `npm run test` - pass, 25 files / 341 tests.
- `npm run build` - pass.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` - pass.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` - pass.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` - pass.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` - pass; no pending evolution.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.
