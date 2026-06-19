# Review: Workbench Test Architecture Task Runtime Domain Split

Status: approved-with-notes.

## Findings

Plan self-review: PASS. Subagent `019ee165-d3a3-7f52-97c9-3a540652b260` reviewed the plan before ECL implementation and found the scope aligned with ECL, Architecture Growth Control, and Core Mechanism Reuse. Required plan adjustments were incorporated: include the direct TaskQueue reconcile case, keep mixed multi-Workpad memory-isolation residual, update `test:fast` exclusion, and leave the broad scheduler planning flow to a later split.

Close-ready review first pass: BLOCK. Subagent `019ee182-d336-7d11-846f-5369121e7740` found duplicate fixture writers left in `tests/unit/workbench.test.ts`, incomplete active-change evidence, and missing Harness verification records. The duplicate writer issue was fixed by importing `writeCoderRun`, `writeTaskRunRecord`, `writeTaskQueueRecord`, and `writeTaskQueueItemRecord` from `tests/unit/workbench/fixtures.ts` and reusing the shared fixture temp-dir lifecycle.

## Verification

- PASS: `npx vitest run tests/unit/workbench-task-runtime.test.ts` (24 tests).
- PASS: `npx vitest run tests/unit/workbench.test.ts` (30 tests) after fixing shared fixture lifecycle usage.
- PASS: `npx eslint tests/unit/workbench.test.ts tests/unit/workbench-task-runtime.test.ts tests/unit/workbench/fixtures.ts`.
- PASS: `npm run typecheck`.
- PASS: `npm run lint`.
- PASS: `npm run test:fast` (346 tests).
- PASS: `npm run build`.
- PASS: `npm run test:workbench`; first attempt timed out at 304 seconds, second run passed in about 682 seconds.
- PASS: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`.
- PASS: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`.
- PASS: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`.
- PASS: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` (no pending evolution; 4 archived changes since last completion, threshold 5).

## Acceptance Feedback

- Real/manual acceptance performed: no.
- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy Coverage

- Documentation entropy coverage applicable: yes.
- If applicable, documents checked: `AGENTS.md`, `docs/STATUS.md`, active change files.
- If applicable, before/after line counts: current `AGENTS.md` 146 lines; current `docs/STATUS.md` 121 lines; current `docs/ECL.md` 449 lines. The change updates current active handoff pointers only and does not add historical phase narrative.
- If applicable, duplicate current-state fields checked: `AGENTS.md` and `docs/STATUS.md` both point to `harness/changes/active/workbench-test-architecture-task-runtime-domain-split/summary.md` and both say pending Harness evolution is none.
- If applicable, roadmap/current-direction stale language checked: no roadmap/current-direction expansion was made; `docs/CURRENT-DEVELOPMENT-PLAN.md` was not changed.
- If applicable, archive-ledger content promoted / retained / merged / retired / archive-only: archive history was not promoted; historical details remain in archived summaries and `harness/changes/INDEX.json`.
- If applicable, over-budget documents and rationale: not applicable; `AGENTS.md` remains within the mature-project 120-180 line guidance and `docs/STATUS.md` remains a short handoff.
- If applicable, tested with: `rg -n "Active change:|Active ECL change:|Pending Harness evolution:|workbench-test-architecture-task-runtime-domain-split|harness/changes/active" AGENTS.md docs/STATUS.md harness/changes/active/workbench-test-architecture-task-runtime-domain-split`; `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`.
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
- If not applicable, reason: change relocates existing projection/action-validation tests without changing derived read-model behavior.

## Scoped Workbench Action Payload Coverage

- Scoped Workbench action payload coverage applicable: no.
- If applicable, checked target ids: not applicable.
- If applicable, tested action path: not applicable.
- If applicable, duplicate action/evidence affordance check: not applicable.
- If not applicable, reason: change relocates existing scoped action payload and fail-closed tests without changing Workbench live/server UI actions.

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
- Future feature owner module: `tests/unit/workbench-task-runtime.test.ts` owns TaskRun / TaskQueue / WorkflowRun / typed-workflow runtime guard coverage; `tests/unit/workbench/fixtures.ts` owns shared Workbench fixture builders and record writers.
- If applicable, module owners checked: new task-runtime suite and shared fixture owner.
- If applicable, moved responsibilities: 24 runtime/action-validation tests moved out of residual `tests/unit/workbench.test.ts`.
- If applicable, retained facade responsibilities: residual `tests/unit/workbench.test.ts` keeps unrelated proposal feedback, Goal Loop, planning, scheduler broad flow, demand-worker, and AgentTask coverage.
- If applicable, forbidden write-back locations: no copied TaskRun/TaskQueue writer helpers remain in the residual suite after the close-ready review fix.
- If applicable, compatibility surface: product behavior and public Workbench APIs unchanged; package script entrypoints updated only to route tests.
- If applicable, behavior path tested: task-runtime suite, residual suite, and Workbench aggregate.
- If applicable, follow-up split candidates: scheduler/planning flow, Goal Loop, proposal feedback, demand-worker/AgentTask residual clusters.
- If applicable, boundary tests or lint checks: targeted eslint, task-runtime suite, residual suite, `npm run test:workbench`.
- If applicable, compatibility result: compatible.
- If applicable, tested with: commands listed in Verification.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Coverage

- Core mechanism reuse / architecture growth control coverage applicable: yes.
- If applicable, existing mechanisms reused or strengthened: existing shared Workbench fixture owner and explicit Workbench capability-suite scripts.
- If applicable, new cross-cutting mechanism and owner: none.
- If applicable, why existing mechanisms were insufficient: existing mechanisms were sufficient after exporting and reusing the needed fixture writers.
- If applicable, domain-specific logic location: task-runtime assertions live in `tests/unit/workbench-task-runtime.test.ts`.
- If applicable, shared cross-cutting logic location: fixture builders and record writers live in `tests/unit/workbench/fixtures.ts`.
- If applicable, local framework / state machine / projection / validation / gate avoided: avoided keeping duplicate TaskRun/TaskQueue fixture writers in the residual suite.
- If applicable, public API / facade / Workbench compatibility result: product APIs and Workbench behavior unchanged.
- If applicable, future-cost reduction result: future TaskRun/TaskQueue runtime changes can run the task-runtime suite directly.
- If applicable, tested with: commands listed in Verification.
- If not applicable, reason: not applicable.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- If applicable, handoff files checked: `AGENTS.md`, `docs/STATUS.md`, active change files.
- If applicable, stale active-path / phase grep: active path currently aligned; repeat after close before final commit.
- If applicable, latest archive / active path alignment: active path aligned before close; final archive path to be written after close.
- If applicable, pending evolution state checked: `scripts/harness-evolve.ps1 check` reported no pending evolution before close.
- If not applicable, reason: not applicable.

## Remote Handoff Acceptance Coverage

- Remote handoff coverage applicable: no.
- If applicable, checked provider/repository/action boundary: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect Draft PR creation/update, PR feedback refresh, provider capability detection, remote checks/reviews, or remote handoff evidence.

