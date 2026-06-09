# Review: Phase 8I DemandWorker Domain Boundary Split

Status: passed.

## Findings

- Planning review found no need for new runtime behavior. The implementation keeps Phase 8I limited to module ownership: `src/demand-worker/manager.ts` is now a compatibility facade, with persistence, queue projection, slot policy, claim, lifecycle, reconcile, and decision logging in owned modules.
- Scope review keeps Phase 8I limited to DemandWorker. Workbench orchestration, TaskRun, Change, and workflow-artifact managers remain out of scope.

## Verification

- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run test -- tests/unit/workbench-module-boundaries.test.ts` passed.
- `npm run test -- tests/unit/workbench-server.test.ts` passed.
- `npm run test -- tests/unit/workbench.test.ts` passed after a standalone rerun with longer timeout.
- `npm run test -- tests/unit/workflow-actions.test.ts` passed.
- `npm run test` passed.
- `npm run build` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` passed.

## Acceptance Feedback

- Real/manual acceptance performed: no.
- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: first parallel focused `workbench.test.ts` run timed out at 124 seconds; standalone rerun passed.
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
- If applicable, checked scope: DemandWorker queue/projection behavior must remain compatible.
- If applicable, tested with: `npm run test -- tests/unit/workbench.test.ts`; `npm run test`.
- If not applicable, reason: not applicable.

## Scoped Workbench Action Payload Coverage

- Scoped Workbench action payload coverage applicable: no.
- If applicable, checked target ids: not applicable.
- If applicable, tested action path: not applicable.
- If applicable, duplicate action/evidence affordance check: not applicable.
- If not applicable, reason: Phase 8I adds no Workbench action and changes no action payload shape.

## Runtime Bridge Boundary Coverage

- Runtime bridge boundary coverage applicable: yes.
- If applicable, checked boundary: DemandWorker is local bounded coordination evidence; it must not become workflow truth or call agents during reconcile.
- If applicable, tested with: `npm run test -- tests/unit/workbench.test.ts`.
- If not applicable, reason: not applicable.

## Proposal / Runtime Boundary Coverage

- Proposal/runtime boundary coverage applicable: yes.
- If applicable, artifact type and authority classification: DemandWorker records are execution coordination evidence, not workflow truth.
- If applicable, boundary matrix checked: DemandWorker remains execution coordination evidence, not workflow truth.
- If applicable, out-of-scope execution paths checked: no Workbench actions, routes, scheduler, TaskQueue, runtime, or agent execution semantics were added.
- If applicable, stale/forged target behavior checked: not directly applicable; no new target-bearing action is added.
- If applicable, tested with: `npm run test -- tests/unit/workbench.test.ts`; `npm run test`.
- If not applicable, reason: not applicable.

## Module Boundary Coverage

- Module boundary coverage applicable: yes.
- If applicable, module owners checked: DemandWorker schemas/types, paths/artifacts, repository, decisions, queue projection, slot policy, claim service, lifecycle, and reconcile.
- If applicable, moved responsibilities: schemas/types, paths/artifacts, repository, decisions, queue projection, slot policy, claim service, lifecycle, and reconcile moved to `src/demand-worker/*`.
- If applicable, retained facade responsibilities: `src/demand-worker/manager.ts` keeps public exports.
- If applicable, forbidden write-back locations: new DemandWorker modules must not import the manager facade, Workbench, server routes, web UI, or CLI command modules.
- If applicable, follow-up split candidates: `task-run/manager.ts`, `change/manager.ts`, and `workflow-artifacts/manager.ts`.
- If applicable, boundary tests or lint checks: `tests/unit/workbench-module-boundaries.test.ts` covers facade compatibility and forbidden imports.
- If applicable, compatibility result: old `src/demand-worker/manager.ts` imports remain available.
- If applicable, tested with: `npm run test -- tests/unit/workbench-module-boundaries.test.ts`; `npm run typecheck`; `npm run lint`.
- If not applicable, reason: not applicable.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- If applicable, handoff files checked: `AGENTS.md`, `docs/STATUS.md`, `docs/ARCHITECTURE.md`, `docs/RUNTIME.md`, `docs/BOUNDARIES.md`.
- If applicable, stale active-path / phase grep: no stale Phase 8H active claim found.
- If applicable, latest archive / active path alignment: Phase 8H archived; Phase 8I active path recorded.
- If applicable, pending evolution state checked: `harness-evolve.ps1 check` reports no pending evolution.
- If not applicable, reason: not applicable.

## Remote Handoff Acceptance Coverage

- Remote handoff coverage applicable: no.
- If applicable, checked provider/repository/action boundary: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect Draft PR creation/update, PR feedback refresh, provider capability detection, remote checks/reviews, or remote handoff evidence.
