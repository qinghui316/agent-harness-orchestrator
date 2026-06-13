# Review: Phase 10A Scheduler User Facing Execution Surface Consolidation

Status: approved.

## Findings

- Two independent read-only subagent reviews recommended user-facing scheduler execution surface consolidation before any full parallel executor / scheduler loop work.
- Review 1 recommendation: do not directly enter full parallel executor; consolidate scheduler confirmations into main-agent stage actions while each confirmation advances at most one existing legal transition.
- Review 2 recommendation: keep plan/launch gates, collapse current worker/result/validation/audit/rework/candidate/closeout labels into user-facing stages, and move scheduler handler glue out of broad Workbench planning files.

## Verification

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- `npm run test -- tests/unit/workbench-module-boundaries.test.ts`: passed.
- `npm run test -- tests/unit/workflow-actions.test.ts`: passed.
- `npm run test -- tests/unit/workbench-server.test.ts`: passed.
- `npm run test -- tests/unit/workbench.test.ts -t "shows the scheduler first worker rework audit gate"`: passed.
- `npm run test -- tests/unit/workbench.test.ts -t "refreshes scheduler integration candidate"`: passed.
- `npm run test -- tests/unit/workbench.test.ts -t "compiles SchedulerContract"`: passed.
- `npm run test -- tests/unit/web-app.test.tsx`: passed.
- `npm run test`: first full run completed 358/359 tests and failed only `tests/unit/web-app.test.tsx > renders Chinese workbench panes and replay artifacts` on a tab `aria-selected` timing assertion; the exact failing test and full web-app file passed immediately when rerun in isolation, so this is recorded as a transient full-suite ordering/timing failure rather than a deterministic product regression.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`: passed.

## Acceptance Feedback

- Real/manual acceptance performed: no.
- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: full `npm run test` had one transient frontend tab-selection assertion; exact test and full web-app file passed on rerun.
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
- If applicable, checked scope: scheduler confirmation queue and action labels after launch.
- If applicable, tested with: `tests/unit/workbench-module-boundaries.test.ts`, selected scheduler `workbench.test.ts` projection tests, and `tests/unit/web-app.test.tsx`.
- If not applicable, reason: not applicable.

## Scoped Workbench Action Payload Coverage

- Scoped Workbench action payload coverage applicable: yes.
- If applicable, checked target ids: schedulerRunId, schedulerClaimReservationId, schedulerWorkerStartId, schedulerWorkerResultId, schedulerWorkerValidationId, schedulerWorkerAuditId, schedulerWorkerRework* ids, schedulerIntegrationCandidateId, schedulerIntegrationCheckHandoffId, schedulerIntegrationOutcomeId, schedulerRunCompletionId, schedulerRunBlockedCloseoutId, reservationIntentId, claimIntentId, taskRunId, workerLeaseId, worktreeId, runId.
- If applicable, tested action path: `tests/unit/workflow-actions.test.ts`, `tests/unit/workbench-server.test.ts`, selected scheduler `workbench.test.ts` tests.
- If applicable, duplicate action/evidence affordance check: scheduler action ids remain unchanged; confirmation labels are mapped user-facing copy only.
- If not applicable, reason: not applicable.

## Source Apply Safety Coverage

- Source apply safety coverage applicable: yes.
- If applicable, checked source project / fixture: scheduler IntegrationCheck/apply path remains existing apply-check gate.
- If applicable, checked worktree ids / result ids / integration check ids: existing scheduler IntegrationCheck/apply tests passed in selected and full-suite runs before the transient frontend failure.
- If applicable, source-root mutation gate checked: unchanged; apply/discard remains existing IntegrationCheck path.
- If applicable, out-of-scope source mutation check: no scheduler apply/discard or source mutation path added.
- If applicable, tested with: not applicable.
- If not applicable, reason: not applicable.

## Runtime Bridge Boundary Coverage

- Runtime bridge boundary coverage applicable: no.
- If applicable, checked boundary: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect external executors, Codex bridge integration, SQLite stores, Topic sessions, prompt stack composition, AHO-managed skills, or runtime projections.

## Proposal / Runtime Boundary Coverage

- Proposal/runtime boundary coverage applicable: yes.
- If applicable, artifact type and authority classification: existing scheduler runtime/evidence artifacts remain evidence only; user-facing consolidation adds no new authority.
- If applicable, boundary matrix checked: yes; Phase 10A adds copy/handler ownership only.
- If applicable, out-of-scope execution paths checked: no loop, no whole-wave dispatch, no auto apply/merge.
- If applicable, stale/forged target behavior checked: existing server/action revalidation tests passed.
- If applicable, tested with: `tests/unit/workflow-actions.test.ts`, `tests/unit/workbench-server.test.ts`, selected scheduler `workbench.test.ts` tests.
- If not applicable, reason: not applicable.

## Module Boundary Coverage

- Module boundary coverage applicable: yes.
- Future feature owner module: `src/scheduler-runtime/` for domain decisions, `src/workbench/actions/handlers/scheduler.ts` for Workbench scheduler action glue, `src/workbench/projections/read-model/confirmation/scheduler-user-surface.ts` for confirmation copy mapping.
- If applicable, module owners checked: yes.
- If applicable, moved responsibilities: scheduler action handler glue out of broad planning handler.
- If applicable, retained facade responsibilities: `handlers/index.ts` remains dispatch glue; scheduler-runtime manager remains re-export facade.
- If applicable, forbidden write-back locations: Workbench chat/server/frontend shells, CLI modules, manager facades.
- If applicable, compatibility surface: existing scheduler action ids and payload scope.
- If applicable, behavior path tested: scheduler confirmation labels, frontend labels, handler registration, and selected scheduler projection paths.
- If applicable, follow-up split candidates: true scheduler loop/slot allocator.
- If applicable, boundary tests or lint checks: `tests/unit/workbench-module-boundaries.test.ts`, `npm run lint`.
- If applicable, compatibility result: existing public action ids/payload fields preserved.
- If applicable, tested with: focused tests, typecheck, lint, build.
- If not applicable, reason: not applicable.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- If applicable, handoff files checked: AGENTS.md, docs/STATUS.md, docs/ARCHITECTURE.md, docs/RUNTIME.md, docs/WORKBENCH.md, docs/BOUNDARIES.md.
- If applicable, stale active-path / phase grep: passed; no stale Phase 9Z active claim found.
- If applicable, latest archive / active path alignment: passed after docs update and `harness-change.ps1 reindex`.
- If applicable, pending evolution state checked: `harness-evolve.ps1 check` reports no pending evolution.
- If not applicable, reason: not applicable.

## Remote Handoff Acceptance Coverage

- Remote handoff coverage applicable: no.
- If applicable, checked provider/repository/action boundary: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect Draft PR creation/update, PR feedback refresh, provider capability detection, remote checks/reviews, or remote handoff evidence.
