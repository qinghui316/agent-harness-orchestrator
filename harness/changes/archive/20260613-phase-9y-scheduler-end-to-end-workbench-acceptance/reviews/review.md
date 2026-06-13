# Review: Phase 9Y Scheduler End to End Workbench Acceptance

Status: approved.

## Findings

- Pre-implementation subagent review round 1: Go with stricter acceptance. Phase 9Y should verify Workbench end-to-end recovery/confirmation behavior, not add scheduler runtime.
- Pre-implementation subagent review round 2: Go with acceptance hardening. Required checks include applied/discarded terminal branches, cold-read projection recovery, confirmation queue honesty, source apply safety, and no broad-facade implementation.

## Verification

- `npm run test -- tests/unit/scheduler-run-completion.test.ts` passed.
- `npm run test -- tests/unit/workbench.test.ts -t "carries a second scheduler worker|records discarded SchedulerRun completion"` passed.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run test -- tests/unit/workbench.test.ts` passed.
- `npm run test -- tests/unit/workflow-actions.test.ts` passed.
- `npm run test -- tests/unit/workbench-module-boundaries.test.ts` passed.
- `npm run test -- tests/unit/workbench-server.test.ts` passed.
- `npm run test` passed.
- `npm run build` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` passed: no pending evolution.

## Acceptance Feedback

- Real/manual acceptance performed: automated equivalent.
- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: initial combined focused test command timed out before useful output; split/focused and full verification passed after refining the terminal completion queue assertion.
- Screenshots / artifacts / run ids: no manual screenshot; automated Workbench snapshot and lazy projection assertions cover the user-visible confirmation queue and SchedulerRunCompletion surface.
- External source/state safety: verified by applied/discarded terminal Workbench acceptance; discard leaves source files and git status unchanged; scheduler handoff/outcome/completion remain sourceMutated false.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Worktree Diff Artifact Coverage

- New-file / untracked worktree diff coverage applicable: no.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect worktree-backed diff behavior.

## Read Model Projection Coverage

- Workbench / GUI read-model projection coverage applicable: yes.
- If applicable, checked scope: Scheduler Workpad projection, confirmation queue, lazy SchedulerRunCompletion projection, cold-read snapshot recovery.
- If applicable, tested with: `npm run test -- tests/unit/workbench.test.ts`; `npm run test -- tests/unit/workbench.test.ts -t "carries a second scheduler worker|records discarded SchedulerRun completion"`.
- If not applicable, reason: not applicable.

## Scoped Workbench Action Payload Coverage

- Scoped Workbench action payload coverage applicable: yes.
- If applicable, checked target ids: `changeId`, `schedulerRunId`, `schedulerIntegrationCandidateId`, `schedulerIntegrationCheckHandoffId`, `schedulerIntegrationOutcomeId`, `schedulerRunCompletionId`, `applyCheckId`, `worktreeIds`.
- If applicable, tested action path: Workbench action chain through scheduler IntegrationCheck handoff, existing apply/discard, SchedulerIntegrationOutcome, and SchedulerRunCompletion.
- If applicable, duplicate action/evidence affordance check: completion leaves no executable start-next / worker / IntegrationCheck / outcome follow-up scheduler action; IntegrationCheck `passed` exposes only existing apply/discard confirmation.
- If not applicable, reason: not applicable.

## Source Apply Safety Coverage

- Source apply safety coverage applicable: yes.
- If applicable, checked source project / fixture: `tests/unit/workbench.test.ts` temporary git repository with `src/module-a.ts` and `src/module-b.ts`.
- If applicable, checked worktree ids / result ids / integration check ids: scheduler IntegrationCheck handoff targets and `applyCheckId`.
- If applicable, source-root mutation gate checked: existing `apply-check.apply` only.
- If applicable, out-of-scope source mutation check: discard and scheduler outcome/completion actions leave source unchanged / `sourceMutated: false`.
- If applicable, tested with: `npm run test -- tests/unit/workbench.test.ts`; `npm run test -- tests/unit/workbench.test.ts -t "carries a second scheduler worker|records discarded SchedulerRun completion"`.
- If not applicable, reason: not applicable.

## Runtime Bridge Boundary Coverage

- Runtime bridge boundary coverage applicable: no.
- If applicable, checked boundary: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect external executors, Codex bridge integration, SQLite stores, Topic sessions, prompt stack composition, AHO-managed skills, or runtime projections.

## Proposal / Runtime Boundary Coverage

- Proposal/runtime boundary coverage applicable: yes.
- If applicable, artifact type and authority classification: SchedulerRunCompletion, SchedulerIntegrationOutcome, SchedulerIntegrationCheckHandoff, SchedulerIntegrationCandidate are evidence/projection artifacts; IntegrationCheck apply/discard remains the source mutation gate.
- If applicable, boundary matrix checked: yes.
- If applicable, out-of-scope execution paths checked: no scheduler loop, whole-wave dispatch, slot allocator, new IntegrationCheck engine, scheduler-owned apply/discard, landing/PR/merge, child Change.
- If applicable, stale/forged target behavior checked: existing focused tests plus full suite; no new target semantics added.
- If applicable, tested with: `npm run test`, focused Workbench acceptance, workflow action registry tests.
- If not applicable, reason: not applicable.

## Module Boundary Coverage

- Module boundary coverage applicable: yes.
- Future feature owner module: test-owned acceptance; minimal product fixes only in responsible owner modules.
- If applicable, module owners checked: `tests/unit/workbench.test.ts`, `src/scheduler-runtime/*`, `src/workbench/projections/read-model/*`, `src/integration-check/*` if fixes are required.
- If applicable, moved responsibilities: none planned.
- If applicable, retained facade responsibilities: public facades remain thin entry/export/composition surfaces.
- If applicable, forbidden write-back locations: `src/workbench/chat.ts`, `src/server/workbench-server.ts`, `src/workbench/projections/read-model.ts`, `src/web/src/App.tsx`, manager facades, action registry facades.
- If applicable, compatibility surface: existing Workbench actions/projections, IntegrationCheck apply/discard, SchedulerRunCompletion artifacts.
- If applicable, behavior path tested: Workbench scheduler apply and discard terminal chains through SchedulerRunCompletion, source non-mutation assertions, confirmation queue terminal filtering, and lazy projection reads.
- If applicable, behavior path tested: Workbench action chain, SchedulerRunCompletion owner module, confirmation queue projection.
- If applicable, follow-up split candidates: none.
- If applicable, boundary tests or lint checks: `npm run test -- tests/unit/workbench-module-boundaries.test.ts`; `npm run lint`.
- If applicable, compatibility result: compatible; no public action or artifact shape changed.
- If applicable, tested with: focused and full verification commands listed above.
- If not applicable, reason: not applicable.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- If applicable, handoff files checked: `AGENTS.md`, `docs/STATUS.md`, `docs/ARCHITECTURE.md`, `docs/RUNTIME.md`, `docs/WORKBENCH.md`, `docs/BOUNDARIES.md`.
- If applicable, stale active-path / phase grep: checked before close; no stale Phase 9X active/current claim remains in handoff docs.
- If applicable, latest archive / active path alignment: Phase 9Y active path aligned before close; final archive alignment will be checked by close/status.
- If applicable, pending evolution state checked: `scripts/harness-evolve.ps1 check` passed with no pending evolution.
- If not applicable, reason: not applicable.

## Remote Handoff Acceptance Coverage

- Remote handoff coverage applicable: no.
- If applicable, checked provider/repository/action boundary: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect Draft PR creation/update, PR feedback refresh, provider capability detection, remote checks/reviews, or remote handoff evidence.

