# Phase 8B Scoped Change Proposal Boundary Split

## Purpose

Repair post-8A handoff drift, then fix two Change Proposal boundary bugs: Workbench proposal runs must bind the selected demand `changeId`, and plan proposal acceptance must fail closed when `spec.md` changed after proposal generation. After the boundary fixes, split the mixed `src/change/proposals.ts` implementation into owned proposal-domain modules while keeping the existing facade and public behavior compatible.

This phase is scoped bug repair plus refactor only. It does not add CLI commands, Workbench actions, HTTP routes, runtime scheduling, parallel execution, automatic child Changes, ODWF JavaScript runtime, or cache/replay.

## Scope

In scope:

- Repair Phase 8A close drift in handoff and architecture/runtime/boundary docs.
- Add scoped `changeId` support to proposal runs and pass selected Workbench demand ids into proposal actions.
- Ensure proposal context, active files, and target hashes come from the resolved selected Change.
- Extend `acceptPlanProposal()` stale checks to include `spec.md`, `plan.md`, and `tasks.md`.
- Split `src/change/proposals.ts` into schemas, paths/hashes, repository, parser/renderer, prompt builders, runner, and acceptance modules.
- Preserve `src/change/proposals.ts` as the compatibility facade.
- Add focused tests for scoped proposal runs, stale accept guards, facade compatibility, and module boundaries.

Out of scope:

- New CLI/API/Workbench action surfaces.
- Runtime scheduler, parallel execution, multi-Change auto creation, ODWF runtime, executable workflow scripts, or cache/replay.
- External-local Codex read-dir tightening.
- Migrating CLI/server/Workbench approval imports away from the facade.

## Current Status

Ready to close.

## Verification

Pre-implementation checks:

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status` - pass; no active change before this phase.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 preflight` - pass.
- `git status --short --untracked-files=all` - only unrelated `README.md`.

Final verification:

- `rg "Phase 8A is active|Current active phase: Phase 8A|harness/changes/active/phase-8a|Active implementation track: Phase 8A" AGENTS.md docs` - pass; no stale active/current claims.
- `rg "Phase 8B|Change Proposal|selected-demand|stale spec|proposal domain|module boundary" AGENTS.md docs harness/changes/active` - pass; expected boundary wording present.
- `npm run test -- tests/unit/change-proposals.test.ts` - pass; 13 tests.
- `npm run test -- tests/unit/workbench-module-boundaries.test.ts` - pass; 12 tests.
- `npm run test -- tests/integration/cli-flow.test.ts` - pass; 38 tests.
- `npm run test -- tests/unit/workbench.test.ts` - pass; 74 tests.
- `npm run test -- tests/unit/workbench-server.test.ts` - pass; 9 tests.
- `npm run typecheck` - pass.
- `npm run lint` - pass.
- `npm run test` - pass; 22 files, 278 tests.
- `npm run build` - pass.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` - pass.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` - pass.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` - pass; INDEX regenerated.
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
