# Review: Workbench Test Architecture Maintenance Slow Suite Split

Status: approved.

## Findings

No blocking findings.

## Verification

Passed:

- `npx eslint tests\slow\workbench-maintenance-flow.test.ts tests\unit\workbench.test.ts tests\unit\workbench\fixtures.ts`
- `npx vitest run tests\slow\workbench-maintenance-flow.test.ts`
- `npx vitest run tests\unit\workbench.test.ts`
- `npx vitest run tests\unit\workbench-demand-worker.test.ts`
- `npm run test:workbench:slow`
- `npm run typecheck`
- `npm run lint`
- `npm run test:fast`
- `npm run test:integration`
- `npm run build`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\harness-change.ps1 status`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\harness-evolve.ps1 check`

Not run:

- `npm run test:workbench`; targeted and slow-contract coverage was sufficient for this test-relocation change.

## Acceptance Feedback

- Real/manual acceptance performed: no.
- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: subagent plan review returned PASS; user clarified that future verification should prefer necessary targeted suites over repeated full-suite runs.
- Retries or environment failures: initial local mechanical move had import/helper drift and was corrected before verification. No test environment failure recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: future Workbench test-architecture phases should keep targeted verification first and reserve full Workbench aggregate runs for shared-runtime changes or explicit close-evidence gaps.

## Documentation Entropy Coverage

- Documentation entropy coverage applicable: yes.
- If applicable, documents checked: `AGENTS.md`, `docs/STATUS.md`, active change files.
- If applicable, before/after line counts: not recorded; active handoff edits were narrow.
- If applicable, duplicate current-state fields checked: yes.
- If applicable, roadmap/current-direction stale language checked: yes.
- If applicable, archive-ledger content promoted / retained / merged / retired / archive-only: retained only current active handoff and execution guidance; detailed history remains in active/archive change record.
- If applicable, over-budget documents and rationale: not applicable.
- If applicable, tested with: `scripts\lint-ecl.ps1`, `scripts\lint-encoding.ps1`, `scripts\harness-change.ps1 status`.
- If not applicable, reason: not applicable.

## Experience Lifecycle Coverage

- Experience lifecycle coverage applicable: yes.
- If applicable, promote decisions: not applicable.
- If applicable, retain decisions: retain user guidance to use necessary targeted suites first and avoid unnecessary repeated full-suite runs.
- If applicable, merge decisions: not applicable.
- If applicable, retire decisions: not applicable.
- If applicable, archive-only decisions: not applicable.
- If applicable, noop / no-change rationale after old-experience scan: no broader Harness rule/template update needed for this test-only split.
- If applicable, tested with: `scripts\harness-evolve.ps1 check`.
- If not applicable, reason: not applicable.

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

- Source apply safety coverage applicable: no.
- If applicable, checked source project / fixture: not applicable.
- If applicable, checked worktree ids / result ids / integration check ids: not applicable.
- If applicable, source-root mutation gate checked: not applicable.
- If applicable, out-of-scope source mutation check: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect result review, worktrees, apply/discard flows, source refresh rework, integration checks, multi-demand confirmation, or source-root apply handoff.

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
- If applicable, existing mechanisms reused or strengthened: existing Workbench slow-suite staging and shared `tests/unit/workbench/fixtures.ts` lifecycle.
- If applicable, new cross-cutting mechanism and owner: not applicable.
- If applicable, why existing mechanisms were insufficient: not applicable.
- If applicable, domain-specific logic location: maintenance flow tests and maintenance-only helpers live in `tests/slow/workbench-maintenance-flow.test.ts`.
- If applicable, shared cross-cutting logic location: existing shared Workbench fixtures remain in `tests/unit/workbench/fixtures.ts`.
- If applicable, local framework / state machine / projection / validation / gate avoided: no new fixture framework, local state machine, projection, validation gate, or artifact protocol introduced.
- If applicable, public API / facade / Workbench compatibility result: unchanged.
- If applicable, future-cost reduction result: maintenance/self-evolution Workbench regressions now have a focused slow suite.
- If applicable, tested with: targeted maintenance suite, residual unit suite, demand-worker suite, and `npm run test:workbench:slow`.
- If not applicable, reason: not applicable.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- If applicable, handoff files checked: `AGENTS.md`, `docs/STATUS.md`.
- If applicable, stale active-path / phase grep: checked during active state; final no-active handoff to be updated after close.
- If applicable, latest archive / active path alignment: active path aligned before close; final archive path to be updated after close.
- If applicable, pending evolution state checked: `scripts\harness-evolve.ps1 check` reported no pending evolution.
- If not applicable, reason: not applicable.

## Remote Handoff Acceptance Coverage

- Remote handoff coverage applicable: no.
- If applicable, checked provider/repository/action boundary: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect Draft PR creation/update, PR feedback refresh, provider capability detection, remote checks/reviews, or remote handoff evidence.

