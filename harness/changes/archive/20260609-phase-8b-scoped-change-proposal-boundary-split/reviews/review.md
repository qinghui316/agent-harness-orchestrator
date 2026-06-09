# Review: Phase 8B Scoped Change Proposal Boundary Split

Status: passed after implementation.

## Findings

- Resolved: `AGENTS.md`, `docs/STATUS.md`, `docs/ARCHITECTURE.md`, `docs/RUNTIME.md`, and `docs/BOUNDARIES.md` now record Phase 8A archived and Phase 8B active.
- Resolved: Workbench `change.spec.propose` and `change.plan.propose` pass selected `changeId` into proposal runs.
- Resolved: Proposal preparation resolves the Change target once and uses the selected Change path for active files, target hashes, and prompt context.
- Resolved: `acceptPlanProposal()` now checks `spec.md`, `plan.md`, and `tasks.md` target hashes before writing canonical files.
- Resolved: `src/change/proposals.ts` is a compatibility facade over owned proposal-domain modules.

## Verification

Pre-implementation verification:

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status` - pass before change creation.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 preflight` - pass.
- `git status --short --untracked-files=all` - only unrelated `README.md`.

Final verification:

- `rg "Phase 8A is active|Current active phase: Phase 8A|harness/changes/active/phase-8a|Active implementation track: Phase 8A" AGENTS.md docs` - pass.
- `rg "Phase 8B|Change Proposal|selected-demand|stale spec|proposal domain|module boundary" AGENTS.md docs harness/changes/active` - pass.
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
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` - pass.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` - pass; no pending evolution.

## Acceptance Feedback

- Real/manual acceptance performed: no.
- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Module Boundary Coverage

- Module boundary coverage applicable: yes.
- Module owners checked: proposal schemas, paths/hashes, repository, parser/renderer, prompt builders, runner, acceptance, compatibility facade.
- Moved responsibilities: schemas, paths/hashes, repository, parser/renderer, prompt builders, runner, acceptance, and service orchestration moved under `src/change/proposals/*`.
- Retained facade responsibilities: `src/change/proposals.ts` public exports.
- Forbidden write-back locations: CLI command definitions, server route behavior, Workbench UI, proposal artifact shapes.
- Follow-up split candidates: `src/code/manager.ts`, external-local read-dir scope.
- Boundary tests or lint checks: `tests/unit/change-proposals.test.ts` and `tests/unit/workbench-module-boundaries.test.ts`.
- Compatibility result: old `src/change/proposals.ts` imports remain available.
- Tested with: focused tests, full product verification, Harness verification.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- Handoff files checked: `AGENTS.md`, `docs/STATUS.md`, `docs/ARCHITECTURE.md`, `docs/RUNTIME.md`, `docs/BOUNDARIES.md`.
- Stale active-path / phase grep: pass; no stale Phase 8A active/current claims.
- Latest archive / active path alignment: Phase 8A closed archive and Phase 8B active path.
- Pending evolution state checked: no pending evolution before Phase 8B creation.

## Proposal / Runtime Boundary Coverage

- Proposal/runtime boundary coverage applicable: yes.
- Artifact type and authority classification: Spec/Plan proposals are candidates, not canonical truth.
- Boundary matrix checked: scoped proposal generation, stale accept, explicit accept-only canonical writes.
- Out-of-scope execution paths checked: no runtime execution, scheduler, worktree, or TaskQueue behavior changes.
- Stale/forged target behavior checked: stale hash and scoped change tests cover spec/plan proposal generation and accept guards.
- Tested with: focused tests, full product verification, Harness verification.
