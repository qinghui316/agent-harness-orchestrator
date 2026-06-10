# Review: Phase 8J Scoped TaskRun WorkerLease Boundary Split

Status: passed.

## Findings

- No blocking issues found after implementation.
- `src/task-run/manager.ts` is now a compatibility facade over owned modules.
- Scoped evidence matching is hardened: reconcile matches coder Run evidence by
  `taskRunId + changeId`, runtime callers pass TaskRun `changeId/taskId` to
  started/completion updates, and workflow-result links reject cross-Change or
  cross-task binding.
- Workbench task graph projection and TaskQueue/WorkflowRun paths remained
  compatible in focused and full tests.

## Verification

- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run test -- tests/unit/workbench-module-boundaries.test.ts` passed: 20 tests.
- `npm run test -- tests/unit/workflow-actions.test.ts` passed: 4 tests.
- `npm run test -- tests/unit/workbench-server.test.ts` passed: 9 tests.
- `npm run test -- tests/unit/workbench.test.ts` passed after assertion repair: 82 tests.
- `npm run test` passed: 22 test files, 298 tests.
- `npm run build` passed.
- Drift check for stale Phase 8I active/current claims passed with no matches.
- Phase 8J language check found expected TaskRun/WorkerLease boundary language.
- `scripts/lint-ecl.ps1` passed.
- `scripts/lint-encoding.ps1` passed.
- `scripts/harness-change.ps1 reindex` passed.
- `scripts/harness-evolve.ps1 check` passed with no pending evolution.

## Acceptance Feedback

- Real/manual acceptance performed: no.
- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: first focused `workbench.test.ts` run failed on a new test assertion that expected explicit `undefined` fields for omitted JSON properties. The assertion was corrected; rerun and full suite passed.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Worktree Diff Artifact Coverage

- New-file / untracked worktree diff coverage applicable: no.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect worktree-backed diff behavior.

## Read Model Projection Coverage

- Workbench / GUI read-model projection coverage applicable: yes.
- If applicable, checked scope: TaskRun / WorkerLease task graph projection and next actions.
- If applicable, tested with: `npm run test -- tests/unit/workbench.test.ts`; `npm run test`.
- If not applicable, reason: not applicable.

## Scoped Workbench Action Payload Coverage

- Scoped Workbench action payload coverage applicable: no.
- If applicable, checked target ids: not applicable.
- If applicable, tested action path: not applicable.
- If applicable, duplicate action/evidence affordance check: not applicable.
- If not applicable, reason: change does not add or change Workbench live/server UI actions that depend on explicit target ids.

## Runtime Bridge Boundary Coverage

- Runtime bridge boundary coverage applicable: no.
- If applicable, checked boundary: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect external executors, Codex bridge integration, SQLite stores, Topic sessions, prompt stack composition, AHO-managed skills, or runtime projections.

## Proposal / Runtime Boundary Coverage

- Proposal/runtime boundary coverage applicable: no.
- If applicable, artifact type and authority classification: not applicable.
- If applicable, boundary matrix checked: not applicable.
- If applicable, out-of-scope execution paths checked: not applicable.
- If applicable, stale/forged target behavior checked: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not introduce or change planning proposals, decomposition plans, readiness manifests, workflow plans, recovery material, scheduler-readiness artifacts, or similar proposal/runtime boundary artifacts.

## Module Boundary Coverage

- Module boundary coverage applicable: yes.
- If applicable, module owners checked: `src/task-run/*`.
- If applicable, moved responsibilities: schemas/types, paths/artifacts, repository, lease service, start/retry, reconcile, workflow-result, guards.
- If applicable, retained facade responsibilities: `src/task-run/manager.ts` public exports.
- If applicable, forbidden write-back locations: manager facade, Workbench, server, web UI, CLI command modules.
- If applicable, follow-up split candidates: workflow-artifacts manager, change manager.
- If applicable, boundary tests or lint checks: `npm run test -- tests/unit/workbench-module-boundaries.test.ts`; `npm run lint`.
- If applicable, compatibility result: old `src/task-run/manager.ts` imports remain available.
- If applicable, tested with: `npm run test -- tests/unit/workbench-module-boundaries.test.ts`; `npm run test`.
- If not applicable, reason: not applicable.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- If applicable, handoff files checked: `AGENTS.md`, `docs/STATUS.md`, `docs/ARCHITECTURE.md`, `docs/RUNTIME.md`, `docs/BOUNDARIES.md`.
- If applicable, stale active-path / phase grep: passed; no stale Phase 8I active/current matches.
- If applicable, latest archive / active path alignment: Phase 8I archive and Phase 8J active paths recorded.
- If applicable, pending evolution state checked: `scripts/harness-evolve.ps1 check` passed with no pending evolution.
- If not applicable, reason: not applicable.

## Remote Handoff Acceptance Coverage

- Remote handoff coverage applicable: no.
- If applicable, checked provider/repository/action boundary: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect Draft PR creation/update, PR feedback refresh, provider capability detection, remote checks/reviews, or remote handoff evidence.
