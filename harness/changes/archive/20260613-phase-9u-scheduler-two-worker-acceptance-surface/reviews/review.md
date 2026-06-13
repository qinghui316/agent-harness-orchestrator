# Review: Phase 9U Scheduler Two Worker Acceptance Surface

Status: accepted.

## Findings

- Subagent logic review (`019ebff5-12ab-7ce3-9832-303150e3aac3`) recommended Phase 9U as the next step: verify the two-worker happy path before adding scheduler loops or executor behavior. It identified residual transcript labels that still say `first worker` and should become current-worker wording.
- Subagent module review (`019ebff5-4871-7e21-8ade-b05a562db25d`) agreed with Phase 9U but warned not to add second-worker state logic to Workbench. Scheduler path decisions must stay in `src/scheduler-runtime/*`; Workbench may only map projections/actions/copy.
- Focused acceptance found and fixed a scheduler IntegrationCandidate guard mismatch: audit `RunMetadata` currently does not carry worktree metadata, so scheduler candidate evidence now validates audit run scope by run id/change/runtime while keeping worktree scope on validation, worktree metadata, and scheduler-owned audit evidence.
- Focused acceptance found and fixed a Workpad projection fallback bug: after a refreshed candidate reached two ready targets, the UI could fall back to `planning.scheduler.plan.prepare` instead of showing the IntegrationCheck handoff. Existing scheduler runtime progress now prevents that launch-confirmation fallback.

## Verification

- `npm run test -- tests/unit/workbench.test.ts -t "carries a second scheduler worker"`: passed.
- `npm run test -- tests/unit/workbench-module-boundaries.test.ts`: passed.
- `npm run test -- tests/unit/workflow-actions.test.ts`: passed.
- `npm run test -- tests/unit/workbench-server.test.ts`: passed.
- `npm run test -- tests/unit/scheduler-integration-outcome.test.ts`: passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- `npm run test`: passed after rerunning with a longer timeout; the first full-test attempt hit the local 5-minute tool timeout without failure details.

## Acceptance Feedback

- Real/manual acceptance performed: no.
- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: persistent user goal authorizes subagent self-review before execution; this review records both subagent findings.
- Retries or environment failures: first full `npm run test` attempt exceeded a 5-minute command timeout; rerun with a longer timeout passed.
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
- If applicable, checked scope: scheduler worker transcript labels, Workpad next action, confirmation queue, candidate refresh, and IntegrationCheck handoff projection.
- If applicable, tested with: `npm run test -- tests/unit/workbench.test.ts -t "carries a second scheduler worker"`, `npm run test -- tests/unit/workbench-module-boundaries.test.ts`, and `npm run test`.
- If not applicable, reason: not applicable.

## Scoped Workbench Action Payload Coverage

- Scoped Workbench action payload coverage applicable: yes.
- If applicable, checked target ids: `changeId`, `schedulerRunId`, `schedulerClaimReservationId`, `reservationIntentId`, `claimIntentId`, `schedulerWorkerStartId`, `schedulerWorkerResultId`, `schedulerWorkerValidationId`, `schedulerWorkerAuditId`, `schedulerIntegrationCandidateId`, and IntegrationCheck target `worktreeIds`.
- If applicable, tested action path: two-worker scheduler start/result/validation/audit, candidate refresh, and IntegrationCheck handoff.
- If applicable, duplicate action/evidence affordance check: repeated internal checkpoint actions stay hidden from the primary user surface; ready candidate shows IntegrationCheck handoff rather than plan prepare fallback.
- If not applicable, reason: not applicable.

## Source Apply Safety Coverage

- Source apply safety coverage applicable: yes.
- If applicable, checked source project / fixture: scheduler two-worker temporary project fixture.
- If applicable, checked worktree ids / result ids / integration check ids: first and second scheduler worktree ids are both present in refreshed candidate ready targets and IntegrationCheck result targets.
- If applicable, source-root mutation gate checked: IntegrationCheck handoff only; no apply/discard/landing/merge behavior should run.
- If applicable, out-of-scope source mutation check: acceptance test asserts no WorkflowRun, TaskQueue, AgentTask, extra worktrees, apply, landing, or merge path is created.
- If applicable, tested with: `npm run test -- tests/unit/workbench.test.ts -t "carries a second scheduler worker"`.
- If not applicable, reason: not applicable.

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
- Future feature owner module: `src/scheduler-runtime/` for scheduler path decisions; Workbench read-model only for label/projection mapping.
- If applicable, module owners checked: scheduler candidate readiness logic remains in `src/scheduler-runtime/*`; Workbench changes are limited to projection labels and next-action mapping.
- If applicable, moved responsibilities: none expected.
- If applicable, retained facade responsibilities: existing facades remain compatibility surfaces only.
- If applicable, forbidden write-back locations: `src/workbench/chat.ts`, server facade, frontend shell, broad manager facades.
- If applicable, compatibility surface: Workbench action ids and payload shape unchanged.
- If applicable, behavior path tested: two-worker current-worker gates through IntegrationCheck handoff.
- If applicable, follow-up split candidates: Workbench worker-path status classification if future work expands it.
- If applicable, boundary tests or lint checks: `npm run test -- tests/unit/workbench-module-boundaries.test.ts`.
- If applicable, compatibility result: old action ids and payload shape remain compatible.
- If applicable, tested with: focused tests plus full `npm run test`.
- If not applicable, reason: not applicable.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- If applicable, handoff files checked: AGENTS.md and docs updated for Phase 9U active.
- If applicable, stale active-path / phase grep: pending final close drift check.
- If applicable, latest archive / active path alignment: pending final close.
- If applicable, pending evolution state checked: no pending Harness evolution at implementation time.
- If not applicable, reason: not applicable.

## Remote Handoff Acceptance Coverage

- Remote handoff coverage applicable: no.
- If applicable, checked provider/repository/action boundary: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect Draft PR creation/update, PR feedback refresh, provider capability detection, remote checks/reviews, or remote handoff evidence.

