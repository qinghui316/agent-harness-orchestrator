# Phase 8C Code Execution Manager Boundary Split

## Purpose

Repair post-8B handoff drift, then split the mixed `src/code/manager.ts` implementation into owned code-execution modules while keeping `src/code/manager.ts` as the compatibility facade. The split isolates execution gate checks, run session/artifact setup, context packet writing, Codex app-server execution, Codex exec execution, live event forwarding, artifact summarization, and status helpers.

This phase also fixes one scoped metadata boundary: Codex app-server code runs must pass the resolved `roleId` into `runCodexAppServerTurn()` so rework-coder runs are not recorded as coder-agent sessions or active turns.

This phase does not add runtime capability, CLI commands, Workbench actions, routes, scheduler behavior, parallelism, multi-Change automation, ODWF JavaScript runtime, or cache/replay.

## Scope

In scope:

- Repair Phase 8B close drift in handoff and architecture/runtime/boundary docs.
- Split `src/code/manager.ts` into code execution domain modules and keep the facade compatible.
- Preserve `startCodeRun()`, `getCodeStatus()`, `listCodeRuns()`, `showCodeRun()`, public types, artifact paths, run JSON shape, event names, CLI output, Workbench behavior, workflow-runtime behavior, and code execution gate semantics.
- Pass the resolved `roleId` through the Codex app-server code-run branch.
- Add module-boundary and behavior tests for the facade split and role metadata fix.

Out of scope:

- New CLI/API/Workbench action surfaces.
- Runtime scheduler, parallel execution, multi-Change auto creation, ODWF runtime, executable workflow scripts, or cache/replay.
- External-local Codex read-dir tightening.
- Changing legacy `getCodeStatus()` single-active compatibility behavior.

## Current Status

Ready to close.

## Verification

List commands and outcomes.

Pre-implementation checks:

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status` - pass; no active change before this phase.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 preflight` - pass.
- `git status --short --untracked-files=all` - only unrelated `README.md`.

Completed verification:

- `rg "Phase 8B is active|Current active phase: Phase 8B|harness/changes/active/phase-8b|Active implementation track: Phase 8B" AGENTS.md docs` - pass; no stale active/current Phase 8B claim.
- `rg "Phase 8C|Code Execution|code execution gate|module boundary|code manager|roleId" AGENTS.md docs harness/changes/active` - pass; expected Phase 8C wording present.
- `npm run test -- tests/integration/cli-flow.test.ts` - pass.
- `npm run test -- tests/unit/workbench.test.ts` - pass.
- `npm run test -- tests/unit/workflow-actions.test.ts` - pass.
- `npm run test -- tests/unit/workbench-module-boundaries.test.ts` - pass.
- `npm run test -- tests/unit/workbench-server.test.ts` - pass.
- `npm run typecheck` - pass.
- `npm run lint` - pass.
- `npm run test` - pass; 22 files / 279 tests.
- `npm run build` - pass.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` - pass.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` - pass.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` - pass; index regenerated.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` - pass; no pending evolution, 4 archived changes since last completion with threshold 5.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: one parallel focused-test command timed out before returning results; the same tests were rerun individually with longer timeouts and passed.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

