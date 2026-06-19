# Review: Workbench Test Architecture Apply Integration Slow Suite Split

Status: approved.

## Findings

None.

## Verification

Passed:

- `npx eslint tests\slow\workbench-apply-integration-flow.test.ts tests\unit\workbench.test.ts tests\unit\workbench\fixtures.ts tests\unit\workbench\change-fixtures.ts`
- `npx vitest run tests\slow\workbench-apply-integration-flow.test.ts`
- `npx vitest run tests\unit\workbench.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm run test:fast`
- `npm run test:integration`
- `npm run build`
- `npm run test:workbench:slow`
- `npx vitest run tests\slow\workbench-remote-landing-flow.test.ts`
- `npm run test:workbench`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\harness-change.ps1 status`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\harness-evolve.ps1 check`

## Acceptance Feedback

- Real/manual acceptance performed: no.
- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: user requested future stages to use slightly larger work packages and avoid unnecessary repeated full-suite verification for test-only splits.
- Retries or environment failures: one repeated `npm run test:workbench` attempt hit an existing remote landing slow test's 30s per-test timeout; immediate targeted rerun of that suite passed, and the final isolated full `npm run test:workbench` passed.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy Coverage

- Documentation entropy coverage applicable: yes.
- If applicable, documents checked: `AGENTS.md`, `docs/STATUS.md`, active change summary/review.
- If applicable, before/after line counts: not measured; handoff edits were limited to active state and next execution guidance.
- If applicable, duplicate current-state fields checked: active state remains centralized in current handoff sections.
- If applicable, roadmap/current-direction stale language checked: active Workbench test architecture convergence language remains current.
- If applicable, archive-ledger content promoted / retained / merged / retired / archive-only: not applicable.
- If applicable, over-budget documents and rationale: not applicable.
- If applicable, tested with: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\lint-ecl.ps1`; `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\lint-encoding.ps1`.
- If not applicable, reason: not applicable.

## Experience Lifecycle Coverage

- Experience lifecycle coverage applicable: no.
- If applicable, promote decisions: not applicable.
- If applicable, retain decisions: not applicable.
- If applicable, merge decisions: not applicable.
- If applicable, retire decisions: not applicable.
- If applicable, archive-only decisions: not applicable.
- If applicable, noop / no-change rationale after old-experience scan: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change is not an auto-evolve, Harness rule/template, docs, or handoff change.

## Worktree Diff Artifact Coverage

- New-file / untracked worktree diff coverage applicable: no.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect worktree-backed diff behavior.

## Read Model Projection Coverage

- Workbench / GUI read-model projection coverage applicable: no.
- If applicable, checked scope: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect derived read models, approval inboxes, thread/run projections, role summaries, or Harness gap reports.

## Scoped Workbench Action Payload Coverage

- Scoped Workbench action payload coverage applicable: no.
- If applicable, checked target ids: not applicable.
- If applicable, tested action path: not applicable.
- If applicable, duplicate action/evidence affordance check: not applicable.
- If not applicable, reason: change does not add or change Workbench live/server UI actions that depend on explicit target ids.

## Source Apply Safety Coverage

- Source apply safety coverage applicable: yes, for regression-test ownership only. Product source-apply runtime was not changed.
- If applicable, checked source project / fixture: the moved tests still create the same local fixture repos/worktrees through existing Workbench fixtures.
- If applicable, checked worktree ids / result ids / integration check ids: the moved suite retains scoped worktree/result/integration target checks, including forged IntegrationCheck target rejection.
- If applicable, source-root mutation gate checked: existing result apply, IntegrationCheck, IntegrationFix, source drift, and dirty source tests moved unchanged in behavior.
- If applicable, out-of-scope source mutation check: product runtime files under `src/` were not modified.
- If applicable, tested with: `npx vitest run tests\slow\workbench-apply-integration-flow.test.ts`; `npm run test:workbench:slow`; `npm run test:workbench`.
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

## Goal Loop Boundary Coverage

- Goal Loop boundary coverage applicable: no.
- If applicable, persistent Goal/Change scope checked: not applicable.
- If applicable, recommendation authority checked: not applicable.
- If applicable, fallback priority checked: not applicable.
- If applicable, packet / main-Agent context freshness checked: not applicable.
- If applicable, stale or superseded packet suppression checked: not applicable.
- If applicable, feedback selected Change / packet lineage / visible gate scope checked: not applicable.
- If applicable, feedback remains user evidence, not hidden instruction / arbitrary chat scrape / execution approval: not applicable.
- If applicable, feedback-triggered re-evaluation remains non-executing and primary Harness gate stays separate: not applicable.
- If applicable, hidden execution / source mutation check: not applicable.
- If applicable, ToolPolicyGate / human gate preservation checked: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not add or change GoalLoopDecision policy, goal-loop confirmation surfaces, autonomous loop behavior, or conflict-aware continuation behavior.

## Module Boundary Coverage

- Module boundary coverage applicable: no.
- Future feature owner module: not applicable.
- If applicable, module owners checked: not applicable.
- If applicable, moved responsibilities: not applicable.
- If applicable, retained facade responsibilities: not applicable.
- If applicable, forbidden write-back locations: not applicable.
- If applicable, compatibility surface: not applicable.
- If applicable, behavior path tested: not applicable.
- If applicable, follow-up split candidates: not applicable.
- If applicable, boundary tests or lint checks: not applicable.
- If applicable, compatibility result: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not add or change Workbench action execution, projections, runtime services, frontend panels, typed workflow artifacts, or cross-module workflow state.

## Core Mechanism Reuse Coverage

- Core mechanism reuse / architecture growth control coverage applicable: yes.
- If applicable, existing mechanisms reused or strengthened: reused existing slow-suite staging and lifecycle-aware Workbench fixtures.
- If applicable, new cross-cutting mechanism and owner: added only a hook-free `writeRawActiveChange` helper under `tests/unit/workbench/` for setup shared by the residual monolith and moved suite.
- If applicable, why existing mechanisms were insufficient: importing lifecycle-aware `fixtures.ts` into the residual monolith would register duplicate Vitest hooks, so the raw Change setup needed a hook-free helper.
- If applicable, domain-specific logic location: apply/integration/source-refresh regression tests now live in `tests/slow/workbench-apply-integration-flow.test.ts`.
- If applicable, shared cross-cutting logic location: `tests/unit/workbench/change-fixtures.ts`.
- If applicable, local framework / state machine / projection / validation / gate avoided: no new test framework, state machine, projection, validation, or gate was introduced.
- If applicable, public API / facade / Workbench compatibility result: no product API, facade, or Workbench behavior changed.
- If applicable, future-cost reduction result: future apply/integration safety changes can run the focused slow suite rather than searching or rerunning the residual monolith first.
- If applicable, tested with: targeted eslint, focused slow suite, residual Workbench suite, slow Workbench script, and full Workbench contract.
- If not applicable, reason: not applicable.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- If applicable, handoff files checked: `AGENTS.md`, `docs/STATUS.md`, active change summary/tasks/review.
- If applicable, stale active-path / phase grep: pending final close update.
- If applicable, latest archive / active path alignment: pending final close update.
- If applicable, pending evolution state checked: pending final close update.
- If not applicable, reason: not applicable.

## Remote Handoff Acceptance Coverage

- Remote handoff coverage applicable: no.
- If applicable, checked provider/repository/action boundary: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect Draft PR creation/update, PR feedback refresh, provider capability detection, remote checks/reviews, or remote handoff evidence.
