# Phase 8I DemandWorker Domain Boundary Split

## Purpose

Split the DemandWorker domain implementation behind the existing `src/demand-worker/manager.ts` compatibility facade. The current manager still mixes schemas, artifact paths, repository reads/writes, queue projection, slot policy, claim logic, attempt lifecycle, reconcile, and main-orchestrator decision logging.

Phase 8I is a pure module-boundary change. It keeps bounded demand worker behavior unchanged so later demand orchestration, scheduler, and multi-demand work can evolve without continuing to grow a mixed manager file.

## Scope

In scope:

- Repair post-8H documentation drift and mark Phase 8I as the active structured change.
- Record the pre-existing untracked `README.md` state and keep it excluded.
- Split DemandWorker schemas/types, paths/artifacts, repository, decisions, queue projection, slot policy, claim service, lifecycle, and reconcile into owned modules.
- Preserve the `src/demand-worker/manager.ts` public facade and current external imports.
- Add boundary and behavior regression tests for DemandWorker compatibility.

Out of scope:

- New scheduler behavior, parallel execution, automatic multi-Change creation, ODWF JavaScript runtime, cache/replay, runtime capability, CLI command, Workbench action, or HTTP route.
- DemandWorker artifact path, JSON shape, decision log shape, Workbench snapshot/projection shape, action payload, SSE, thread storage, or Harness workflow truth changes.
- Refactoring `change/manager.ts`, `task-run/manager.ts`, `workflow-artifacts/manager.ts`, or Workbench orchestration internals beyond import compatibility.

## Current Status

Ready to close.

## Verification

- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run test -- tests/unit/workbench-module-boundaries.test.ts` passed: 19 tests.
- `npm run test -- tests/unit/workbench-server.test.ts` passed: 9 tests.
- `npm run test -- tests/unit/workbench.test.ts` passed: 80 tests. The first parallel attempt timed out at 124 seconds; the single rerun completed successfully.
- `npm run test -- tests/unit/workflow-actions.test.ts` passed: 4 tests.
- `npm run test` passed: 22 test files, 295 tests.
- `npm run build` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` passed and rebuilt `harness/changes/INDEX.json`.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` passed: no pending evolution; 2 archived changes since last completion, threshold 5.
- Drift check `rg "Phase 8H is active|Current active phase: Phase 8H|harness/changes/active/phase-8h" AGENTS.md docs` returned no stale Phase 8H active claim.

## Pre-existing Carried State

- Before Phase 8I, `git status --short --untracked-files=all` showed only unrelated untracked `README.md`.
- `scripts/harness-change.ps1 status` and `preflight` reported no active change and safe to create a new structured change.
- `README.md` remains excluded from this change.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none.
- Extra prompts or reviewer instructions: none.
- Retries or environment failures: first parallel focused `workbench.test.ts` run timed out at 124 seconds; standalone rerun passed.
- Screenshots / artifacts / run ids: not applicable.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none.
