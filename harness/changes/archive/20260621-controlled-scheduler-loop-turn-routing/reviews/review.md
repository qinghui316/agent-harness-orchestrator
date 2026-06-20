# Review: controlled-scheduler-loop-turn-routing

Status: close-ready after documentation/evidence repair.

## Findings

No blocking code findings remain.

Independent subagent review returned `revise` because ECL close evidence was still incomplete: `tasks.md` had unchecked verification/close tasks, `summary.md` still said `Active.`, and this review was still pending. The same review found no behavior-level blocker: AC-001 through AC-005 looked satisfied, route summary ownership was in scheduler-runtime, Goal Loop posture vocabulary was reused, warning remained a detail, and Workbench remained orchestration/display glue. This review records and closes the missing ECL evidence.

## Verification

Passed.

- Selected verification scope: scheduler-runtime route helper/result summarization, controlled advance post-step evidence recording, controlled-step repository/projection, Workbench read model, Goal Loop surface regression, scheduler runtime Workbench surface, real App DOM display, type/lint/build, and broad fast unit coverage.
- `npx vitest run tests\unit\scheduler-controlled-loop-turn.test.ts tests\unit\scheduler-controlled-step-evidence.test.ts tests\unit\controlled-scheduler-advance-post-step.test.ts tests\unit\web-app.test.tsx` passed (4 files, 48 tests).
- `npx vitest run tests\unit\workbench-scheduler-runtime-surface.test.ts` passed (2 tests).
- `npx vitest run tests\unit\workbench-goal-loop-surface.test.ts` passed (23 tests).
- `npx vitest run tests\unit\workbench-read-model.test.ts` passed (24 tests).
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run test:fast` passed (37 files, 393 tests).
- `npm run build` passed.
- Full / aggregate suites run or skipped: `test:fast` and the relevant Workbench split suites were run. Full `npm run test` and slow Workbench suites were skipped because this change does not alter source apply, remote, slow end-to-end execution, package scripts, or broad release behavior beyond the controlled Scheduler evidence/projection path already covered by targeted runtime, Workbench, App DOM, fast-unit, typecheck, lint, and build evidence.
- Rationale for selected scope: touched code is bounded to scheduler-runtime controlled-step evidence/result/route summary, Workbench projection, and read-only frontend display. The selected commands cover the changed runtime helper, schema/projection path, existing one-gate controlled advance flow, Goal Loop/Workbench regressions, App DOM surface honesty, and broad non-slow unit/build gates.

## Acceptance Feedback

- Real/manual acceptance performed: yes, via deterministic real React/App DOM coverage in `tests/unit/web-app.test.tsx`.
- Manual config edits: none.
- Extra prompts or reviewer instructions: none beyond the independent close-ready review request.
- Retries or environment failures: one earlier `web-app.test.tsx` run observed an unrelated transient missing `agent-run-graph` assertion in a non-touched case; targeted rerun and `test:fast` passed.
- Screenshots / artifacts / run ids: no screenshots; DOM assertions cover the visible controlled-step evidence card.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none.

## Documentation Entropy Coverage

- Documentation entropy coverage applicable: yes.
- Documents checked: `AGENTS.md`, `docs/STATUS.md`, `docs/CURRENT-DEVELOPMENT-PLAN.md`, active change files.
- Before close line counts checked before this handoff pass: `AGENTS.md` 154, `docs/STATUS.md` 172, `docs/CURRENT-DEVELOPMENT-PLAN.md` 76.
- Duplicate current-state fields checked: active path, pending evolution state, latest product archive, active product phase, current baseline, and next resume point.
- Roadmap/current-direction stale language checked: `docs/STATUS.md` and `docs/CURRENT-DEVELOPMENT-PLAN.md` now describe controlled-loop route summary as evidence/projection only and keep the next direction as the smallest controlled Scheduler loop runtime boundary.
- Archive-ledger content promoted / retained / merged / retired / archive-only: no archive ledger content was promoted; historical detail remains archive-only.
- Over-budget documents and rationale: `docs/STATUS.md` remains longer than ideal because it carries current handoff context and selected recent archive pointers; no new phase ledger was copied into it.
- Tested with: `scripts/lint-ecl.ps1`, `scripts/lint-encoding.ps1`, `scripts/harness-change.ps1 status`, and stale active-path/phase checks in the final close pass.

## Experience Lifecycle Coverage

- Experience lifecycle coverage applicable: no.
- If not applicable, reason: this is not an auto-evolve, Harness rule/template, or experience-retention change.

## Worktree Diff Artifact Coverage

- New-file / untracked worktree diff coverage applicable: no.
- If not applicable, reason: change does not affect worktree-backed diff collection, validation diff hashes, audit diff review, apply preview/apply gates, or Spec-Test generation.

## Read Model Projection Coverage

- Workbench / GUI read-model projection coverage applicable: yes.
- Checked scope: controlled-step route summary remains derived from canonical scheduler-runtime evidence and passes through the existing Workbench controlled-step evidence summary without becoming workflow truth.
- Tested with: `tests/unit/scheduler-controlled-step-evidence.test.ts`, `tests/unit/workbench-read-model.test.ts`, and `tests/unit/web-app.test.tsx`.

## Workbench User-Surface Honesty Coverage

- Workbench user-surface honesty coverage applicable: yes.
- Sampled surface: Workpad controlled Scheduler step evidence card.
- Visible primary UI backed by implemented workflow paths: route summary is read-only evidence over an already-recorded controlled step; no new primary action is exposed.
- Out-of-scope future capability check: no automatic loop, whole-wave dispatch, full parallel executor, source apply, close, merge, remote landing, or Harness evolution action is displayed.
- Forbidden visible internal terms/actions checked: App DOM asserts the route/result/next-confirmation copy and keeps the controlled-step evidence card button-free.
- Duplicate primary action check: no new button or confirmation item is rendered.
- High-impact action path result: unchanged; right-side confirmation queue remains the executable human gate.
- Real App DOM / browser UI verification result when the behavior is product-visible: `tests/unit/web-app.test.tsx` passed.
- Projection/unit evidence that supplements but does not replace visible-surface acceptance: `scheduler-controlled-step-evidence.test.ts` and Workbench split suites passed.
- Tested with: `tests/unit/web-app.test.tsx`, `tests/unit/workbench-goal-loop-surface.test.ts`, and `tests/unit/workbench-scheduler-runtime-surface.test.ts`.

## Scoped Workbench Action Payload Coverage

- Scoped Workbench action payload coverage applicable: no.
- If not applicable, reason: change does not add or change Workbench live/server UI actions or action payload ids.

## Transcript Renderer Source-Boundary Coverage

- Transcript renderer source-boundary coverage applicable: no.
- If not applicable, reason: change does not affect the default Workbench main conversation transcript or parent-agent transcript projection.

## Source Apply Safety Coverage

- Source apply safety coverage applicable: no.
- If not applicable, reason: change does not affect result review, worktrees, apply/discard flows, source refresh rework, integration checks, multi-demand confirmation, or source-root apply handoff.

## Runtime Bridge Boundary Coverage

- Runtime bridge boundary coverage applicable: no.
- If not applicable, reason: change does not affect external executors, Codex bridge integration, SQLite stores, Topic sessions, prompt stack composition, AHO-managed skills, or runtime bridge layers.

## Proposal / Runtime Boundary Coverage

- Proposal/runtime boundary coverage applicable: yes.
- Artifact type and authority classification: `controlledLoopTurnRouteSummary` is a derived, non-executing SchedulerRun-scoped route summary stored on existing `SchedulerControlledStepEvidence`.
- Boundary matrix checked: artifact type is route summary evidence; authority is non-executing evidence; required target ids remain the existing controlled-step target scope; Workbench/server/CLI runtime scope propagation is unchanged; stale/forged/cross-change fail-closed behavior remains in the existing controlled advance and `resolveRunnableChangeTarget` path.
- Out-of-scope execution paths checked: route summary does not create child Changes, TaskQueues, TaskRuns, AgentTasks, worktrees, source mutations, apply/close/merge, remote landing, or Harness evolution.
- Stale/forged target behavior checked: existing controlled advance tests and Workbench split suites cover the scoped gate/revalidation path; this change does not add a new executable target.
- Tested with: `tests/unit/controlled-scheduler-advance-post-step.test.ts`, `tests/unit/scheduler-controlled-loop-turn.test.ts`, and `tests/unit/workbench-goal-loop-surface.test.ts`.

## Goal Loop Boundary Coverage

- Goal Loop boundary coverage applicable: yes.
- Persistent Goal/Change scope checked: route summary is recorded under the active Change and optional SchedulerRun scope.
- Recommendation authority checked: route posture uses `SchedulerLoopPostureState` and the existing post-step handoff/evidence; it does not make `GoalLoopDecision` executable.
- Fallback priority checked: right-side concrete confirmation flow is unchanged; Workpad route summary is read-only.
- Packet / main-Agent context freshness checked: controlled advance still refreshes Goal Loop evaluation, controller policy, and gate-readiness evidence before the one concrete gate and post-step evidence.
- Stale or superseded packet suppression checked: existing controlled advance gate/readiness path remains the authority; no new packet injection path is added.
- Feedback selected Change / packet lineage / visible gate scope checked: not changed by this feature.
- Feedback remains user evidence, not hidden instruction / arbitrary chat scrape / execution approval: not changed by this feature.
- Feedback-triggered re-evaluation remains non-executing and primary Harness gate stays separate: not changed by this feature.
- Hidden execution / source mutation check: route summary has `executionStarted: false`, all high-impact authority flags false, and is projected read-only.
- ToolPolicyGate / human gate preservation checked: no new ToolPolicy path, server route, or confirmation item is added; existing one-human-confirmation-per-gate flow remains.
- Tested with: `tests/unit/scheduler-controlled-loop-turn.test.ts`, `tests/unit/controlled-scheduler-advance-post-step.test.ts`, and `tests/unit/workbench-goal-loop-surface.test.ts`.

## Module Boundary Coverage

- Module boundary coverage applicable: yes.
- Future feature owner module: `src/scheduler-runtime/`.
- Module owners checked: scheduler-runtime owns route summary construction, result summarization, schema, persistence, and markdown rendering; Workbench handler owns orchestration glue; Workbench projection/frontend own DTO/display mapping only.
- Moved responsibilities: controlled-step concrete result summarization moved out of `src/workbench/actions/handlers/scheduler.ts` into `src/scheduler-runtime/controlled-loop-turn.ts`.
- Retained facade responsibilities: Workbench scheduler handler still refreshes Goal Loop evidence, invokes the existing controlled step, and records runtime evidence through scheduler-runtime.
- Forbidden write-back locations: no new main logic was added to Workbench broad facades, bridge/server shells, manager facades, or frontend shell components.
- Compatibility surface: existing action ids, payload ids, ToolPolicy auditing, stale revalidation, `SchedulerControlledStepEvidence` compatibility, and Workbench card behavior remain compatible; route summary is optional in schema/types.
- Behavior path tested: controlled advance recording and Workpad display.
- Follow-up split candidates: none.
- Boundary tests or lint checks: `scheduler-controlled-loop-turn.test.ts`, `scheduler-controlled-step-evidence.test.ts`, `controlled-scheduler-advance-post-step.test.ts`, `workbench-scheduler-runtime-surface.test.ts`, and `web-app.test.tsx`.
- Compatibility result: pass.
- Tested with: targeted tests, `npm run typecheck`, `npm run lint`, `npm run test:fast`, and `npm run build`.

## Core Mechanism Reuse Coverage

- Core mechanism reuse / architecture growth control coverage applicable: yes.
- Existing mechanisms reused or strengthened: Goal Loop posture vocabulary, scheduler-runtime controlled-step evidence, existing controlled advance stale revalidation/gate path, Workbench read-model projection, and existing frontend evidence card.
- New cross-cutting mechanism and owner: no separate cross-cutting mechanism; route summary is an owned extension of scheduler-runtime controlled-step evidence.
- Why existing mechanisms were insufficient: the post-step route facts were split across post-step handoff, Goal Loop evidence, and Workbench-local result summary; the change consolidates them without adding a new artifact family or local loop state machine.
- Domain-specific logic location: scheduler-runtime route/result summarization.
- Shared cross-cutting logic location: Goal Loop posture vocabulary remains in `src/goal-loop/scheduler-loop-snapshot.ts`; ToolPolicy and target revalidation remain in existing owners.
- Local framework / state machine / projection / validation / gate avoided: no new loop state machine, projection system, validation gate, ToolPolicy path, or confirmation queue is introduced.
- Public API / facade / Workbench compatibility result: compatible; new fields are optional and read-only.
- Future-cost reduction result: later controlled-loop tick/reconcile work can consume one typed route summary instead of duplicating ad hoc reads from Workbench handler outputs.
- Tested with: targeted unit/App DOM tests and broad fast/unit/build gates.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- Handoff files checked: `AGENTS.md`, `docs/STATUS.md`, `docs/CURRENT-DEVELOPMENT-PLAN.md`, active change files.
- Stale active-path / phase grep: active path currently appears only while the change is active; after close, `AGENTS.md` and `docs/STATUS.md` must be updated to the archive path and no active path.
- Latest archive / active path alignment: before close, both entry docs name `harness/changes/active/controlled-scheduler-loop-turn-routing/`; after close, they must name the archived summary.
- Pending evolution state checked: no `harness/evolution/pending.md` exists before close.
- If not applicable, reason: not applicable.

## Remote Handoff Acceptance Coverage

- Remote handoff coverage applicable: no.
- If not applicable, reason: change does not affect Draft PR creation/update, PR feedback refresh, provider capability detection, remote checks/reviews, or remote handoff evidence.
