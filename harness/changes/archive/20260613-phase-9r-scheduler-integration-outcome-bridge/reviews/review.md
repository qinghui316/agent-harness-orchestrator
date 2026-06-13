# Review: Phase 9R Scheduler Integration Outcome Bridge

Status: reviewed for implementation.

## Findings

No blocker remains after planning review. Two authorized read-only subagent reviews agreed that the outcome bridge is the right next boundary after Phase 9Q, provided it does not duplicate IntegrationCheck apply/discard and it fail-closes on applied/discarded evidence conflicts.

## Independent Review

- EvalMode: subagent_review.
- Reviewer scope: scheduler IntegrationCheck outcome bridge, existing apply/discard authority, module boundary, Workbench user-surface clarity.
- Recommendation: proceed with narrow implementation in `src/scheduler-runtime/`, with P0 coverage for passed-without-outcome, applied worktree verification, discarded/applied conflict rejection, and no duplicate scheduler apply affordance.
- Score: 85/100 aggregate from two reviews (`84/100` boundary review, `86/100` implementation/test review).
- Limitations: reviews were read-only and did not run tests. They focused on current code and reference-boundary consistency.

Key review notes:

- `SchedulerIntegrationOutcome` is scheduler runtime accounting evidence, not IntegrationCheck authority, apply authorization, landing approval, PR authority, or workflow truth.
- IntegrationCheck `passed` must keep using existing IntegrationCheck apply/discard confirmation; scheduler must not add a second apply/discard surface.
- Outcome reconcile must reread the current `IntegrationCheckRecord`, not rely on the status captured in handoff.
- Discarded outcome must reject if any handoff target has applied evidence or the check has `appliedAt`; this guards against misleading discarded state after source mutation.
- Main implementation belongs in `src/scheduler-runtime/integration-outcome.ts`; Workbench/server/frontend changes must stay thin.

## Verification

Focused verification completed so far:

- `npm run typecheck` - pass.
- `npm run test -- tests/unit/workflow-actions.test.ts` - pass.
- `npm run test -- tests/unit/workbench-module-boundaries.test.ts` - pass.
- `npm run test -- tests/unit/scheduler-integration-outcome.test.ts` - pass.
- `npm run test -- tests/unit/workbench-server.test.ts` - pass.
- `npm run test -- tests/unit/workbench.test.ts` - pass with extended timeout; the first 120s run timed out before result, rerun completed 94/94 tests in about 204s.

Full verification:

- `npm run lint` - pass after removing one unused type import.
- `npm run test` - pass, 25 files / 341 tests.
- `npm run build` - pass.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` - pass.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` - pass.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` - pass.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` - pass, no pending evolution; 4 archived changes since last completion.
- Drift grep for stale Phase 9Q active/current claims - no matches.
- Drift grep for Phase 9R / SchedulerIntegrationOutcome / scheduler integration outcome - matches in docs and active change.

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
- If not applicable, reason: change does not affect worktree-backed diff rendering; it only reads existing IntegrationCheck/worktree readiness evidence.

## Read Model Projection Coverage

- Workbench / GUI read-model projection coverage applicable: yes.
- If applicable, checked scope: scheduler integration outcome summary and lazy projection after IntegrationCheck terminal/consumed states.
- If applicable, tested with: `npm run typecheck`, `npm run test -- tests/unit/workbench.test.ts`, `npm run test -- tests/unit/workbench-server.test.ts`, and `npm run test -- tests/unit/scheduler-integration-outcome.test.ts`.
- If not applicable, reason: not applicable.

## Scoped Workbench Action Payload Coverage

- Scoped Workbench action payload coverage applicable: yes.
- If applicable, checked target ids: `changeId`, `schedulerRunId`, `schedulerIntegrationCheckHandoffId`, `schedulerIntegrationOutcomeId`, `applyCheckId`, ready worktree ids.
- If applicable, tested action path: `tests/unit/workflow-actions.test.ts` and Workbench read-model/server focused tests.
- If applicable, duplicate action/evidence affordance check: passed by implementation review and tests; IntegrationCheck `passed` returns waiting/no outcome and Workbench only exposes outcome reconcile after terminal/applied/discarded state.
- If not applicable, reason: not applicable.

## Runtime Bridge Boundary Coverage

- Runtime bridge boundary coverage applicable: no.
- If applicable, checked boundary: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect Codex bridge, external executor adapters, runtime-continuity sidecars, or worker process execution.

## Proposal / Runtime Boundary Coverage

- Proposal/runtime boundary coverage applicable: yes.
- If applicable, artifact type and authority classification: `SchedulerIntegrationOutcome` is scheduler runtime accounting evidence; it is not IntegrationCheck authority, apply authorization, landing approval, PR authority, or workflow truth.
- If applicable, boundary matrix checked: yes.
- If applicable, out-of-scope execution paths checked: no apply/discard implementation, no worker dispatch, no scheduler loop, no landing/PR.
- If applicable, stale/forged target behavior checked: yes, through server revalidation and scheduler integration outcome behavior tests.
- If applicable, tested with: focused tests listed in Verification.
- If not applicable, reason: not applicable.

## Module Boundary Coverage

- Module boundary coverage applicable: yes.
- Future feature owner module: `src/scheduler-runtime/`.
- If applicable, module owners checked: yes.
- If applicable, moved responsibilities: outcome schema/type/path/repository/rendering/reconciliation.
- If applicable, retained facade responsibilities: scheduler-runtime manager re-exports only.
- If applicable, forbidden write-back locations: Workbench chat/manager/read-model facade, server facade, frontend shell, integration-check manager, workflow-scheduler manager.
- If applicable, compatibility surface: existing IntegrationCheck/apply/discard APIs and Workbench confirmation shapes.
- If applicable, behavior path tested: yes.
- If applicable, follow-up split candidates: none.
- If applicable, boundary tests or lint checks: `tests/unit/workbench-module-boundaries.test.ts`.
- If applicable, compatibility result: pass.
- If not applicable, reason: not applicable.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- If applicable, handoff files checked: `AGENTS.md`, `docs/STATUS.md`, architecture/runtime/workbench/boundaries docs as needed.
- If applicable, stale active-path / phase grep: passed; no stale Phase 9Q active/current claim.
- If applicable, latest archive / active path alignment: passed for Phase 9R active.
- If applicable, pending evolution state checked: passed; `harness-evolve check` reports no pending evolution.
- If not applicable, reason: not applicable.

## Remote Handoff Acceptance Coverage

- Remote handoff coverage applicable: no.
- If applicable, checked provider/repository/action boundary: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect Draft PR creation/update, PR feedback refresh, provider capability detection, remote checks/reviews, or remote handoff evidence.
