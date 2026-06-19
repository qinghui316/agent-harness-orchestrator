# Review: Workbench Test Architecture Goal Loop Prompt Slow Suite Split

Status: approved.

## Findings

None.

## Verification

- Pass: `npx eslint tests\slow\workbench-goal-loop-prompt-flow.test.ts tests\unit\workbench.test.ts tests\unit\workbench\fixtures.ts`
- Pass after adding explicit timeout to the first moved slow scenario: `npx vitest run tests\slow\workbench-goal-loop-prompt-flow.test.ts`
- Pass: `npx vitest run tests\unit\workbench.test.ts`
- Pass: `npm run test:workbench:slow`
- Pass: `npm run test:workbench`
- Pass: `npm run typecheck`
- Pass: `npm run lint`
- Pass: `npm run test:fast`
- Pass: `npm run test:integration`
- Pass: `npm run build`
- Pass: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\lint-ecl.ps1`
- Pass: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\lint-encoding.ps1`
- Pass: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\harness-change.ps1 reindex`
- Pass: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\harness-change.ps1 status`
- Pass: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\harness-evolve.ps1 check`

## Acceptance Feedback

- Real/manual acceptance performed: no.
- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: initial new slow suite run failed because the first moved prompt-flow test used Vitest default 30s timeout after being isolated; fixed by adding explicit 300s timeout consistent with the other moved slow prompt-flow tests.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy Coverage

- Documentation entropy coverage applicable: yes.
- If applicable, documents checked: `AGENTS.md`, `docs/STATUS.md`, active change summary.
- If applicable, before/after line counts: not applicable.
- If applicable, duplicate current-state fields checked: not applicable.
- If applicable, roadmap/current-direction stale language checked: yes; `docs/STATUS.md` no longer lists remaining Goal Loop prompt slow tests as a next candidate while this active change is open.
- If applicable, archive-ledger content promoted / retained / merged / retired / archive-only: not applicable.
- If applicable, over-budget documents and rationale: not applicable.
- If applicable, tested with: not applicable.
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

- Goal Loop boundary coverage applicable: yes.
- If applicable, persistent Goal/Change scope checked: not applicable.
- If applicable, recommendation authority checked: not applicable.
- If applicable, fallback priority checked: not applicable.
- If applicable, packet / main-Agent context freshness checked: moved slow prompt-flow tests preserve the existing freshness and accepted-artifact drift assertions.
- If applicable, stale or superseded packet suppression checked: moved slow prompt-flow tests preserve stale policy and artifact-drift suppression assertions.
- If applicable, feedback selected Change / packet lineage / visible gate scope checked: not applicable.
- If applicable, feedback remains user evidence, not hidden instruction / arbitrary chat scrape / execution approval: not applicable.
- If applicable, feedback-triggered re-evaluation remains non-executing and primary Harness gate stays separate: not applicable.
- If applicable, hidden execution / source mutation check: preserved through unchanged assertions that prompt evidence remains non-executing and does not authorize apply/close/source mutation.
- If applicable, ToolPolicyGate / human gate preservation checked: preserved by not changing product runtime or Workbench action logic.
- If applicable, tested with: `npx vitest run tests\slow\workbench-goal-loop-prompt-flow.test.ts`, `npm run test:workbench:slow`, `npm run test:workbench`.
- If not applicable, reason: not applicable.

## Module Boundary Coverage

- Module boundary coverage applicable: yes.
- Future feature owner module: not applicable.
- If applicable, module owners checked: not applicable.
- If applicable, moved responsibilities: three actual Goal Loop prompt/runtime evidence slow scenarios moved from `tests/unit/workbench.test.ts` to `tests/slow/workbench-goal-loop-prompt-flow.test.ts`.
- If applicable, retained facade responsibilities: not applicable.
- If applicable, forbidden write-back locations: not applicable.
- If applicable, compatibility surface: `npm run test`, `npm run test:workbench`, and `npm run test:workbench:slow` continue to include the moved coverage through explicit scripts.
- If applicable, behavior path tested: residual Workbench unit suite and all Workbench slow suites.
- If applicable, follow-up split candidates: demand worker, maintenance apply, apply/IntegrationCheck, and read-model/projection domain suites.
- If applicable, boundary tests or lint checks: targeted eslint, residual Workbench unit suite, new slow suite, Workbench slow script, and Workbench aggregate script.
- If applicable, compatibility result: compatible; no product runtime files changed.
- If applicable, tested with: targeted eslint, `npx vitest run tests\unit\workbench.test.ts`, `npx vitest run tests\slow\workbench-goal-loop-prompt-flow.test.ts`, `npm run test:workbench:slow`, `npm run test:workbench`.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Coverage

- Core mechanism reuse / architecture growth control coverage applicable: yes.
- If applicable, existing mechanisms reused or strengthened: existing Vitest suite layering, explicit npm script staging, and shared `tests/unit/workbench/fixtures.ts`.
- If applicable, new cross-cutting mechanism and owner: not applicable.
- If applicable, why existing mechanisms were insufficient: not applicable.
- If applicable, domain-specific logic location: Goal Loop prompt-flow assertions stay in the new slow suite.
- If applicable, shared cross-cutting logic location: existing Workbench fixture module continues to own fake Codex, temp project state, JSONL reads, and scheduler setup helpers.
- If applicable, local framework / state machine / projection / validation / gate avoided: no new local framework, state machine, projection, validation path, or gate was introduced.
- If applicable, public API / facade / Workbench compatibility result: not applicable.
- If applicable, future-cost reduction result: future agents can run Goal Loop prompt slow coverage independently and residual Workbench unit count is reduced to 100 tests.
- If applicable, tested with: targeted lint, new slow suite, residual unit suite, Workbench slow aggregate, Workbench aggregate.
- If not applicable, reason: not applicable.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- If applicable, handoff files checked: `AGENTS.md`, `docs/STATUS.md`, active change summary/spec/plan/tasks/review.
- If applicable, stale active-path / phase grep: active path checked through `scripts\harness-change.ps1 status`.
- If applicable, latest archive / active path alignment: active handoff points to `harness/changes/active/workbench-test-architecture-goal-loop-prompt-slow-suite-split/summary.md`; latest archive remains the prior completed remote landing split until this change closes.
- If applicable, pending evolution state checked: `scripts\harness-evolve.ps1 check` reports no pending evolution.
- If not applicable, reason: not applicable.

## Remote Handoff Acceptance Coverage

- Remote handoff coverage applicable: no.
- If applicable, checked provider/repository/action boundary: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect Draft PR creation/update, PR feedback refresh, provider capability detection, remote checks/reviews, or remote handoff evidence.

