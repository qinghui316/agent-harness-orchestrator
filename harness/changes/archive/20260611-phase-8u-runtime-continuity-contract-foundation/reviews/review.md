# Review: Phase 8U Runtime Continuity Contract Foundation

Status: accepted.

## Findings

Initial review found no blocker with the plan after narrowing scope. Implementation review found no blocking issues:

- Runtime continuity is needed before real SchedulerContract-backed parallel execution.
- V1 must stay additive and code-run-only.
- Existing Codex app-server `agent-session.json` is adapter state, not an AHO WorkerSession contract.
- Validation/Audit integration, Workbench UI, permission engine, sandbox backend, and parallel executor remained out of scope.

## Verification

- Drift grep for Phase 8T active claims: passed, no matches.
- Runtime continuity docs/change grep: passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed after removing an unused type import.
- `npm run test -- tests/unit/runtime-continuity.test.ts tests/unit/workbench-module-boundaries.test.ts`: passed.
- `npm run test -- tests/integration/cli-flow.test.ts -t "records Codex coder worktree runs"`: passed.
- `npm run test`: passed, 24 test files / 328 tests.
- `npm run build`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`: passed after task/review status update.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`: passed, no pending evolution.

## Acceptance Feedback

- Real/manual acceptance performed: no.
- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Worktree Diff Artifact Coverage

- New-file / untracked worktree diff coverage applicable: no.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect worktree-backed diff behavior.

## Read Model Projection Coverage

- Workbench / GUI read-model projection coverage applicable: no.
- If applicable, checked scope: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not change Workbench snapshot, lazy projections, approval inboxes, thread/run projections, or role summaries.

## Scoped Workbench Action Payload Coverage

- Scoped Workbench action payload coverage applicable: no.
- If applicable, checked target ids: not applicable.
- If applicable, tested action path: not applicable.
- If applicable, duplicate action/evidence affordance check: not applicable.
- If not applicable, reason: change does not add or change Workbench live/server UI actions.

## Runtime Bridge Boundary Coverage

- Runtime bridge boundary coverage applicable: yes.
- If applicable, checked boundary: Codex app-server and codex exec code-run adapters write additive AHO runtime-continuity evidence while preserving raw event artifacts and run lifecycle.
- If applicable, tested with: `npm run test -- tests/unit/runtime-continuity.test.ts tests/unit/workbench-module-boundaries.test.ts`; `npm run test -- tests/integration/cli-flow.test.ts -t "records Codex coder worktree runs"`; `npm run test`.
- If not applicable, reason: not applicable.

## Proposal / Runtime Boundary Coverage

- Proposal/runtime boundary coverage applicable: yes.
- If applicable, artifact type and authority classification: WorkerSession, RuntimeWorkspace, EventSource, and AgentEventEnvelope are runtime auxiliary evidence, not workflow truth.
- If applicable, boundary matrix checked: SchedulerContract remains non-executing; runtime continuity does not create TaskRun, WorkerLease, AgentTask, worktree, run, or child Change from scheduler contracts.
- If applicable, out-of-scope execution paths checked: SchedulerContract remains non-executing; no new Workbench action, route, CLI command, TaskRun, WorkerLease, AgentTask, worktree, run, or child Change path was added.
- If applicable, stale/forged target behavior checked: runtime-continuity tests cover raw forged scope normalization and cross-change/cross-role direct read rejection.
- If applicable, tested with: `npm run test -- tests/unit/runtime-continuity.test.ts tests/unit/workbench-module-boundaries.test.ts`; `npm run test -- tests/integration/cli-flow.test.ts -t "records Codex coder worktree runs"`; `npm run test`.
- If not applicable, reason: not applicable.

## Module Boundary Coverage

- Module boundary coverage applicable: yes.
- Future feature owner module: `src/runtime-continuity/`.
- If applicable, module owners checked: `src/runtime-continuity/` owns schemas/types, paths, repository, guards, and event envelope helpers.
- If applicable, moved responsibilities: runtime-continuity schemas/types, paths, repository, guards, event-source lifecycle, and envelope append.
- If applicable, retained facade responsibilities: no new facade; code runners call owner module.
- If applicable, forbidden write-back locations: Workbench, server, web UI, CLI command modules, broad manager facades.
- If applicable, compatibility surface: existing code-run public behavior and run artifacts remain compatible.
- If applicable, behavior path tested: Codex exec code-run path writes worker session, runtime workspace, event source, and normalized event envelopes without adding those refs to `run.json`.
- If applicable, follow-up split candidates: validation/audit integration or Workbench display only if later product need appears.
- If applicable, boundary tests or lint checks: `tests/unit/workbench-module-boundaries.test.ts` covers `src/runtime-continuity/*` forbidden dependencies.
- If applicable, compatibility result: existing code-run public behavior and `run.json` compatibility preserved.
- If applicable, tested with: `npm run test -- tests/unit/runtime-continuity.test.ts tests/unit/workbench-module-boundaries.test.ts`; `npm run test -- tests/integration/cli-flow.test.ts -t "records Codex coder worktree runs"`; `npm run test`.
- If not applicable, reason: not applicable.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- If applicable, handoff files checked: `AGENTS.md`, `docs/STATUS.md`, `docs/ARCHITECTURE.md`, `docs/RUNTIME.md`, `docs/AGENT-MODEL.md`, `docs/BOUNDARIES.md`.
- If applicable, stale active-path / phase grep: passed, no Phase 8T active matches.
- If applicable, latest archive / active path alignment: Phase 8T archived and Phase 8U active are recorded.
- If applicable, pending evolution state checked: pending evolution remains none.
- If not applicable, reason: not applicable.

## Remote Handoff Acceptance Coverage

- Remote handoff coverage applicable: no.
- If applicable, checked provider/repository/action boundary: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect Draft PR creation/update, PR feedback refresh, provider capability detection, remote checks/reviews, or remote handoff evidence.
