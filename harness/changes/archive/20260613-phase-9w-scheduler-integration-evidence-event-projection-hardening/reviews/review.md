# Review: Phase 9W Scheduler Integration Evidence Event Projection Hardening

Status: accepted.

## Findings

No blocking findings before implementation.

Independent review notes:

- Dalton: recommends 9W before further executor work because scheduler integration artifacts are not yet represented in the runtime event journal. Boundary risk is moving main logic into Workbench or implying scheduler-owned apply/discard; keep owner logic in `src/scheduler-runtime`.
- Anscombe: agrees 9W is the correct next step. It should be observability/recovery/replay hardening only, with tests proving no worker/run/worktree/TaskRun/WorkerLease or apply/discard behavior is created.

## Verification

- `npm run test -- tests/unit/scheduler-integration-outcome.test.ts` - passed.
- `npm run test -- tests/unit/workbench-module-boundaries.test.ts` - passed.
- `npm run test -- tests/unit/workbench.test.ts -t "carries a second scheduler worker through current-worker gates"` - passed.
- `npm run typecheck` - passed.
- `npm run lint` - passed.
- `npm run test` - passed.
- `npm run build` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` - passed.

## Acceptance Feedback

- Real/manual acceptance performed: no.
- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: user requested automatic phase execution after two subagent reviews, with ECL change, verification, close/git, and modular owner-module code.
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

- Workbench / GUI read-model projection coverage applicable: yes.
- If applicable, checked scope: scheduler runtime event stream and existing scheduler integration lazy/evidence projections.
- If applicable, tested with: `npm run test -- tests/unit/workbench.test.ts -t "carries a second scheduler worker through current-worker gates"` and `npm run test`.
- If not applicable, reason: not applicable.

## Scoped Workbench Action Payload Coverage

- Scoped Workbench action payload coverage applicable: no.
- If applicable, checked target ids: not applicable.
- If applicable, tested action path: not applicable.
- If applicable, duplicate action/evidence affordance check: not applicable.
- If not applicable, reason: change does not add or change Workbench live/server UI actions that depend on explicit target ids.

## Source Apply Safety Coverage

- Source apply safety coverage applicable: yes.
- If applicable, checked source project / fixture: scheduler integration handoff/outcome path.
- If applicable, checked worktree ids / result ids / integration check ids: scheduler integration candidate/handoff/outcome path preserves worktree ids and IntegrationCheck ids in event payload while existing apply/discard remains the mutation gate.
- If applicable, source-root mutation gate checked: existing IntegrationCheck apply/discard remains the only mutation path.
- If applicable, out-of-scope source mutation check: no new apply/discard or source-root mutation path was added.
- If applicable, tested with: `npm run test -- tests/unit/workbench.test.ts -t "carries a second scheduler worker through current-worker gates"` and `npm run test`.
- If not applicable, reason: not applicable.

## Runtime Bridge Boundary Coverage

- Runtime bridge boundary coverage applicable: yes.
- If applicable, checked boundary: SchedulerRun runtime event journal for integration bridge evidence.
- If applicable, tested with: `npm run test -- tests/unit/scheduler-integration-outcome.test.ts`, `npm run test -- tests/unit/workbench.test.ts -t "carries a second scheduler worker through current-worker gates"`, and `npm run test`.
- If not applicable, reason: not applicable.

## Proposal / Runtime Boundary Coverage

- Proposal/runtime boundary coverage applicable: yes.
- If applicable, artifact type and authority classification: SchedulerIntegrationCandidate / SchedulerIntegrationCheckHandoff / SchedulerIntegrationOutcome are runtime/evidence artifacts, not workflow truth or apply authority.
- If applicable, boundary matrix checked: integration candidate, handoff, and outcome remain evidence/runtime artifacts; IntegrationCheck and apply/discard remain existing gates.
- If applicable, out-of-scope execution paths checked: no new scheduler executor, apply/discard, next-worker, whole-wave, IntegrationCheck engine, or child Change path was added.
- If applicable, stale/forged target behavior checked: existing outcome stale candidate tests still pass.
- If applicable, tested with: `npm run test -- tests/unit/scheduler-integration-outcome.test.ts`, `npm run test -- tests/unit/workbench-module-boundaries.test.ts`, and `npm run test`.
- If not applicable, reason: not applicable.

## Module Boundary Coverage

- Module boundary coverage applicable: yes.
- Future feature owner module: `src/scheduler-runtime`.
- If applicable, module owners checked: `src/scheduler-runtime/types.ts`, `schemas.ts`, `integration-candidate.ts`, `integration-check-handoff.ts`, and `integration-outcome.ts`.
- If applicable, moved responsibilities: integration bridge runtime event append remains in scheduler-runtime owner modules.
- If applicable, retained facade responsibilities: `src/scheduler-runtime/manager.ts` remains export-only.
- If applicable, forbidden write-back locations: Workbench chat/action/projection facades, server route facade, frontend shell, CLI commands, IntegrationCheck engine, apply/discard modules.
- If applicable, compatibility surface: existing scheduler integration public functions and artifact shapes remain compatible.
- If applicable, behavior path tested: scheduler candidate -> handoff -> existing apply -> scheduler outcome path.
- If applicable, follow-up split candidates: none.
- If applicable, boundary tests or lint checks: `npm run test -- tests/unit/workbench-module-boundaries.test.ts`.
- If applicable, compatibility result: old public imports and scheduler-runtime facade remain compatible.
- If applicable, tested with: `npm run typecheck`, `npm run lint`, and `npm run test`.
- If not applicable, reason: not applicable.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- If applicable, handoff files checked: `AGENTS.md`, `docs/STATUS.md`, `docs/ARCHITECTURE.md`, `docs/RUNTIME.md`, `docs/WORKBENCH.md`, `docs/BOUNDARIES.md`.
- If applicable, stale active-path / phase grep: pending final close.
- If applicable, latest archive / active path alignment: pending final close.
- If applicable, pending evolution state checked: pending final close.
- If not applicable, reason: not applicable.

## Remote Handoff Acceptance Coverage

- Remote handoff coverage applicable: no.
- If applicable, checked provider/repository/action boundary: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect Draft PR creation/update, PR feedback refresh, provider capability detection, remote checks/reviews, or remote handoff evidence.
