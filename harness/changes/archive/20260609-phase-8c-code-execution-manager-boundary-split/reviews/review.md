# Review: Phase 8C Code Execution Manager Boundary Split

Status: final implementation review. No blocking findings remain.

## Findings

- Finding: `AGENTS.md` and `docs/STATUS.md` are closed after Phase 8B but need Phase 8C active handoff wording before product code edits.
- Finding: `src/code/manager.ts` mixes execution gate, run/session artifacts, context packet writing, app-server execution, Codex exec execution, live events, artifact finishing, and status helpers. The planned split is justified.
- Finding: The app-server code-run branch currently passes hard-coded `roleId: "coder-agent"` to `runCodexAppServerTurn()` even when the resolved role is `rework-coder`; this can mislabel session and active-turn metadata.
- Finding: `getCodeStatus()` still uses legacy single-active behavior. Because only CLI status uses it, this phase should preserve that compatibility behavior instead of adding scoped status.

Resolution:

- Docs now record Phase 8B closed and Phase 8C active.
- `src/code/manager.ts` now remains the compatibility facade and delegates to owned modules for types, execution gate, run session, context packet writing, live events, Codex app-server execution, Codex exec execution, artifact helpers, runtime guards, and status helpers.
- Codex app-server code execution passes the resolved `roleId` to `runCodexAppServerTurn()`; boundary tests reject reintroducing `roleId: "coder-agent"` in that branch.
- `getCodeStatus()` legacy single-active behavior is preserved in `src/code/status.ts`.

## Verification

Pre-implementation verification:

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status` - pass before change creation.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 preflight` - pass.
- `git status --short --untracked-files=all` - only unrelated `README.md`.

Final verification:

- `rg "Phase 8B is active|Current active phase: Phase 8B|harness/changes/active/phase-8b|Active implementation track: Phase 8B" AGENTS.md docs` - pass; no stale active/current Phase 8B claim.
- `rg "Phase 8C|Code Execution|code execution gate|module boundary|code manager|roleId" AGENTS.md docs harness/changes/active` - pass; expected Phase 8C wording present.
- `npm run test -- tests/unit/workbench-module-boundaries.test.ts` - pass; 13 tests.
- `npm run test -- tests/integration/cli-flow.test.ts` - pass; 38 tests.
- `npm run test -- tests/unit/workbench.test.ts` - pass; 74 tests.
- `npm run test -- tests/unit/workflow-actions.test.ts` - pass; 3 tests.
- `npm run test -- tests/unit/workbench-server.test.ts` - pass; 9 tests.
- `npm run typecheck` - pass.
- `npm run lint` - pass.
- `npm run test` - pass; 22 files / 279 tests.
- `npm run build` - pass.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` - pass.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` - pass.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` - pass.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` - pass; no pending evolution.

## Acceptance Feedback

- Real/manual acceptance performed: no.
- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: one parallel focused-test command timed out before returning results; the same tests were rerun individually with longer timeouts and passed.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Module Boundary Coverage

- Module boundary coverage applicable: yes.
- Module owners checked: code types, execution gate, run session, context, live events, app-server runner, exec runner, artifacts, status, compatibility facade.
- Moved responsibilities: types, execution gate, run session, context packet writing, live events, Codex app-server runner, Codex exec runner, artifact helpers, runtime guards, and status helpers.
- Retained facade responsibilities: `src/code/manager.ts` public exports.
- Forbidden write-back locations: CLI command definitions, Workbench actions, server routes, web UI, run artifact shapes.
- Follow-up split candidates: delivery-chain managers, external-local read-dir scope, scoped code status.
- Boundary tests or lint checks: `tests/unit/workbench-module-boundaries.test.ts` covers code facade imports, forbidden module dependencies, direct runner ownership, and app-server role metadata.
- Compatibility result: old `src/code/manager.ts` public imports remain available.
- Tested with: focused tests, full product verification, and Harness verification listed above.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- Handoff files checked: `AGENTS.md`, `docs/STATUS.md`, `docs/ARCHITECTURE.md`, `docs/RUNTIME.md`, `docs/BOUNDARIES.md`.
- Stale active-path / phase grep: completed; no stale Phase 8B active/current claim found.
- Latest archive / active path alignment: Phase 8B closed archive and Phase 8C active path.
- Pending evolution state checked: no pending evolution before Phase 8C creation.

## Proposal / Runtime Boundary Coverage

- Proposal/runtime boundary coverage applicable: yes.
- Artifact type and authority classification: coder runs are worktree proposals and run evidence, not workflow truth.
- Boundary matrix checked: readiness gate, TaskQueue graph gate, rework gate, app-server role metadata, source pollution, no-diff warnings.
- Out-of-scope execution paths checked: no scheduler, parallel execution, new action, or new route behavior.
- Stale/forged target behavior checked: existing Workbench, workflow action, CLI, and module-boundary tests passed after the split.
- Tested with: focused tests, full product verification, and Harness verification listed above.
