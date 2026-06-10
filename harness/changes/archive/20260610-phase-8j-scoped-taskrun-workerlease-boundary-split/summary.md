# Phase 8J Scoped TaskRun WorkerLease Boundary Split

## Purpose

Repair the TaskRun / WorkerLease scoped evidence boundary and split the remaining
TaskRun manager implementation into owned domain modules. TaskRun and
WorkerLease remain execution coordination evidence; they do not replace
Change/ECL, Run, validation, audit, apply, close, or human gates.

This phase is a scoped boundary fix plus refactor. It must preserve existing
artifact paths, JSON shapes, Workbench projections, action payloads, SSE/thread
behavior, and runtime behavior except for fail-closed handling of cross-change
or forged TaskRun evidence.

## Scope

In scope:

- Repair post-8I documentation drift and record Phase 8J as active.
- Harden TaskRun scoped evidence matching for reconcile, start/running marks,
  and workflow-result completion binding.
- Split `src/task-run/manager.ts` behind a compatibility facade into schemas,
  paths/artifacts, repository, lease service, start/retry, reconcile,
  workflow-result, and guard modules.
- Add/extend tests for scoped evidence, facade compatibility, and forbidden
  reverse dependencies.

Out of scope:

- No new runtime capability.
- No new CLI command, Workbench action, HTTP route, scheduler, parallel
  execution, multi-Change auto creation, ODWF JS runtime, or cache/replay.
- No intentional changes to TaskRun / WorkerLease artifact paths, JSON shapes,
  status values, Workbench projection shape, action payloads, decision/audit
  scope, SSE, or thread storage.

## Current Status

Completed.

## Verification

- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run test -- tests/unit/workbench-module-boundaries.test.ts` passed: 20 tests.
- `npm run test -- tests/unit/workflow-actions.test.ts` passed: 4 tests.
- `npm run test -- tests/unit/workbench-server.test.ts` passed: 9 tests.
- `npm run test -- tests/unit/workbench.test.ts` passed after one test assertion repair: 82 tests.
- `npm run test` passed: 22 test files, 298 tests.
- `npm run build` passed.
- Drift check `rg "Phase 8I is active|Current active phase: Phase 8I|harness/changes/active/phase-8i" AGENTS.md docs` found no stale matches.
- Drift/reference check `rg "Phase 8J|TaskRun|WorkerLease|scoped evidence|domain boundary|module boundary" AGENTS.md docs harness/changes/active` found expected Phase 8J language.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` passed: no pending evolution; 3 archived changes since last completion, threshold 5.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 close` passed and archived this change at `harness/changes/archive/20260610-phase-8j-scoped-taskrun-workerlease-boundary-split/summary.md`.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: first `npm run test -- tests/unit/workbench.test.ts` run failed on the newly added cross-change reconcile assertion because the test expected explicit `undefined` properties where the JSON object omitted them. The product behavior was correct; the assertion was repaired and the rerun passed.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.
