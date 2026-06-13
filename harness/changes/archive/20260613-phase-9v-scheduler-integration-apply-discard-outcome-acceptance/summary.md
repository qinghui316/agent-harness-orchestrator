# Phase 9V Scheduler Integration Apply Discard Outcome Acceptance

## Purpose

Phase 9V verifies and tightens the last scheduler integration bridge after Phase 9U's two-worker handoff: scheduler-owned IntegrationCheck handoff must still return to the existing `apply-check.apply` / `apply-check.discard` human gate, and scheduler outcome reconciliation must only record the result after that existing gate changes IntegrationCheck state.

This phase is acceptance plus a narrow scoped guard fix. It does not add scheduler apply/discard, new source-root mutation paths, next-worker dispatch, whole-wave dispatch, slot allocation, merge/PR behavior, child Changes, or a full parallel executor.

## Scope

In scope:

- Update handoff docs to record Phase 9U archived and Phase 9V active.
- Add a direct-call guard in `src/scheduler-runtime/integration-outcome.ts` that re-reads latest `SchedulerIntegrationCandidate` and verifies it matches the handoff/runtime/ready target lineage before outcome reconciliation.
- Add focused unit coverage for stale/mismatched candidate rejection.
- Add Workbench acceptance coverage that proves scheduler IntegrationCheck handoff exposes existing apply/discard confirmation, and after existing apply/discard the scheduler outcome reconcile records `applied` / `discarded`.

Out of scope:

- No scheduler-owned apply/discard action.
- No new IntegrationCheck engine or source-root mutation gate.
- No next-worker dispatch, whole-wave dispatch, scheduler loop, slot allocator, child Change, landing, PR, merge, or full parallel executor.
- No artifact path or JSON shape changes.

## Current Status

Ready to close.

Before close, replace this with `Completed.` or `Ready to close.` and keep verification details current. The local close command rejects stale active/planning statuses.

## Verification

- `npm run test -- tests/unit/scheduler-integration-outcome.test.ts`: passed.
- `npm run test -- tests/unit/workbench.test.ts -t "carries a second scheduler worker"`: passed.
- `npm run test -- tests/unit/workbench-module-boundaries.test.ts`: passed.
- `npm run test -- tests/unit/workflow-actions.test.ts`: passed.
- `npm run test -- tests/unit/workbench-server.test.ts`: passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- `npm run test`: passed, 25 files / 347 tests.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`: passed, no pending evolution.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

