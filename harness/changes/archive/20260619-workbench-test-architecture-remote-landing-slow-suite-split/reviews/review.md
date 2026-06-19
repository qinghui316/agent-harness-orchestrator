# Review: Workbench Test Architecture Remote Landing Slow Suite Split

Status: approved.

## Findings

No blocking findings.

- The change moves one coherent remote handoff test domain into
  `tests/slow/workbench-remote-landing-flow.test.ts` and leaves pure classifier,
  apply, IntegrationCheck, demand worker, maintenance, and Goal Loop tests in the
  residual suite.
- Shared fake provider setup is centralized in the existing
  `tests/unit/workbench/fixtures.ts` owner. No product runtime, Workbench action,
  projection, gate, or manager facade code was changed.
- Script layering was adjusted after validation exposed two concrete issues:
  Vitest did not expand the slow-suite glob on Windows, and parallel Workbench
  file execution overloaded a long residual prompt test. The final scripts use
  explicit sequential entries.

## Verification

- `npx eslint tests\slow\workbench-remote-landing-flow.test.ts tests\unit\workbench\fixtures.ts tests\unit\workbench.test.ts` - passed.
- `npx vitest run tests\slow\workbench-remote-landing-flow.test.ts` - passed, 6 tests.
- `npx vitest run tests\unit\workbench.test.ts` - passed, 103 tests.
- `npm run test:workbench:slow` - passed after explicit sequential script update, 9 tests.
- `npm run test:workbench` - passed after sequential residual + slow script update, 112 tests.
- `npm run typecheck` - passed.
- `npm run lint` - passed.
- `npm run test:fast` - passed, 346 tests.
- `npm run test:integration` - passed, 38 tests.
- `npm run build` - passed.
- `npm run test` - passed through the staged test scripts.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status` - passed; active change state is `close-ready`.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` - passed, no pending evolution before close.

## Acceptance Feedback

- Real/manual acceptance performed: no.
- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: initial `tests/slow/workbench-*.test.ts` script filter found no tests on Windows; initial parallel `test:workbench` run timed out one residual Goal Loop prompt test under load. Both were fixed by explicit sequential scripts and revalidated.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy Coverage

- Documentation entropy coverage applicable: yes.
- If applicable, documents checked: `AGENTS.md`, `docs/STATUS.md`.
- If applicable, before/after line counts: not measured because this is a minimal active-handoff update, not a documentation restructure.
- If applicable, duplicate current-state fields checked: active change and active product phase both point to `harness/changes/active/workbench-test-architecture-remote-landing-slow-suite-split/summary.md`.
- If applicable, roadmap/current-direction stale language checked: `docs/STATUS.md` next candidates exclude the now-active remote landing split and keep demand worker, maintenance apply, and remaining projection splits.
- If applicable, archive-ledger content promoted / retained / merged / retired / archive-only: not applicable.
- If applicable, over-budget documents and rationale: not applicable.
- If applicable, tested with: `scripts/lint-ecl.ps1` passed after handoff/review updates.
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

- Module boundary coverage applicable: yes.
- Future feature owner module: Workbench test-suite structure, with shared setup in `tests/unit/workbench/fixtures.ts`.
- If applicable, module owners checked: fake GitHub CLI and validation/audit fixture helpers live in the shared Workbench fixture owner.
- If applicable, moved responsibilities: six remote handoff flow tests moved from `tests/unit/workbench.test.ts` to `tests/slow/workbench-remote-landing-flow.test.ts`.
- If applicable, retained facade responsibilities: product manager facades and Workbench runtime modules were not changed.
- If applicable, forbidden write-back locations: product source, Workbench runtime modules, frontend/bridge glue, and `README.md`.
- If applicable, compatibility surface: npm scripts and existing assertions.
- If applicable, behavior path tested: residual Workbench suite, new remote slow suite, scheduler slow suite, and full staged `npm run test`.
- If applicable, follow-up split candidates: demand worker, maintenance apply, remaining Goal Loop prompt slow tests, apply/IntegrationCheck domains, and read-model/projection domains.
- If applicable, boundary tests or lint checks: targeted ESLint, `npm run lint`, `npm run test:workbench`, and `npm run test`.
- If applicable, compatibility result: compatible after sequential script update.
- If applicable, tested with: see Verification.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Coverage

- Core mechanism reuse / architecture growth control coverage applicable: yes.
- If applicable, existing mechanisms reused or strengthened: existing Vitest suites, package script layers, and `tests/unit/workbench/fixtures.ts`.
- If applicable, new cross-cutting mechanism and owner: none.
- If applicable, why existing mechanisms were insufficient: not applicable; the existing fixture owner was extended.
- If applicable, domain-specific logic location: remote handoff flow assertions live in the remote landing slow suite.
- If applicable, shared cross-cutting logic location: fake provider setup and run evidence fixtures live in `tests/unit/workbench/fixtures.ts`.
- If applicable, local framework / state machine / projection / validation / gate avoided: no new test framework, state machine, projection, validation, or gate model was introduced.
- If applicable, public API / facade / Workbench compatibility result: no product API/facade/runtime behavior changed.
- If applicable, future-cost reduction result: Workbench test-domain splits can reuse the same fixture owner and staged scripts.
- If applicable, tested with: see Verification.
- If not applicable, reason: not applicable.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- If applicable, handoff files checked: `AGENTS.md`, `docs/STATUS.md`.
- If applicable, stale active-path / phase grep: active path points to `harness/changes/active/workbench-test-architecture-remote-landing-slow-suite-split/summary.md`.
- If applicable, latest archive / active path alignment: latest archive remains the previous scheduler slow-suite split until this change closes.
- If applicable, pending evolution state checked: `scripts/harness-evolve.ps1 check` reported no pending evolution before close.
- If not applicable, reason: not applicable.

## Remote Handoff Acceptance Coverage

- Remote handoff coverage applicable: no.
- If applicable, checked provider/repository/action boundary: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect Draft PR creation/update, PR feedback refresh, provider capability detection, remote checks/reviews, or remote handoff evidence.
