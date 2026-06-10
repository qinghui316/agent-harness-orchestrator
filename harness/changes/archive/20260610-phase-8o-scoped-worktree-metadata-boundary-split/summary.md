# Phase 8O Scoped Worktree Metadata Boundary Split

## Purpose

Repair post-Phase 8N documentation drift, harden Worktree metadata scope checks, and split the Worktree manager into owned domain modules behind the existing compatibility facade.

Worktree metadata is shared by code execution, validation, audit, apply, landing, and integration evidence. This phase keeps existing Worktree artifact paths and JSON shapes unchanged while ensuring forged, misplaced, or cross-project metadata cannot enter status projections or mutation paths.

## Scope

In scope:

- Update handoff docs to record Phase 8N closed and Phase 8O active.
- Add Worktree metadata guards for filename/JSON id, project id, and checkout root scope.
- Make list/projection paths skip invalid metadata and direct read/update/delete paths fail closed.
- Split `src/worktree/manager.ts` into owned Worktree modules while preserving public imports.
- Add regression and module-boundary tests for the new guard behavior.

Out of scope:

- New runtime capability, CLI command, Workbench action, HTTP route, scheduler, parallel execution, multi-Change automation, ODWF runtime, or cache/replay.
- Validation or Audit manager decomposition beyond necessary import compatibility.
- Any change to Worktree artifact paths, JSON shape, status values, or apply semantics.
- Untracked `README.md`.

## Current Status

Completed. Ready to close after user approval.

## Verification

- `rg "Phase 8N is active|Current active phase: Phase 8N|harness/changes/active/phase-8n" AGENTS.md docs` returned no matches.
- `rg "Phase 8O|Worktree metadata|worktree boundary|module boundary|scope guard" AGENTS.md docs harness/changes/active` returned expected Phase 8O boundary language.
- `npm run test -- tests/unit/worktree.test.ts tests/unit/workbench-module-boundaries.test.ts` passed: 2 files, 29 tests.
- `npm run test -- tests/unit/validation.test.ts tests/unit/audit.test.ts` passed: 2 files, 13 tests.
- `npm run test -- tests/unit/workbench.test.ts tests/integration/cli-flow.test.ts` passed: 2 files, 128 tests.
- `npm run test -- tests/unit/workbench-server.test.ts` passed: 1 file, 9 tests.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run test` passed: 23 files, 316 tests.
- `npm run build` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` passed: no pending evolution; 4 archived changes since last completion, threshold is 5.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: one combined focused test command timed out at 124 seconds without output; the same coverage was rerun in smaller batches and passed.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.
