# Review: controlled-scheduler-loop-tick-runtime-boundary

Status: ready for close.

## Findings

No blocking findings.

Implementation review confirms the change keeps `planning.scheduler.controlled-advance.run` as the existing human-confirmed entry, records the new tick contract on existing scheduler-runtime controlled-step evidence, and does not add a new action, hidden continuation, automatic loop, ToolPolicy path, source mutation path, close/apply/merge path, remote landing path, or Harness evolution automation.

Independent subagent close-ready review initially returned `REVISE`: `assertControlledSchedulerFreshGateMatchesRequest()` did not directly compare `changeId`, so a fresh gate scoped to another Change could pass when other scheduler target ids matched. The blocker was fixed in `src/workflow-scheduler/controlled-step.ts` and covered by `tests/unit/controlled-scheduler-step-contract.test.ts`.

## Verification

- Selected verification scope: targeted controlled Scheduler contract/runtime/action/projection/App DOM coverage, then product `typecheck`, `lint`, `test:fast`, `build`, and Harness checks.
- `npx vitest run tests/unit/controlled-scheduler-step-contract.test.ts tests/unit/scheduler-controlled-step-evidence.test.ts tests/unit/controlled-scheduler-advance-post-step.test.ts tests/unit/web-app.test.tsx` - passed, 4 files / 48 tests.
- `npm run typecheck` - passed.
- `npm run lint` - passed.
- `npm run test:fast` - passed after stabilizing brittle App DOM waits and adding cross-Change fail-closed coverage, 38 files / 396 tests.
- `npm run build` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` - passed; no pending evolution, 3 archived changes since last completion, threshold 5.
- Full / aggregate suites run or skipped: `test:fast` and `build` were run. Slow Workbench scheduler flow was not used as the close gate; earlier local attempts at `tests/slow/workbench-scheduler-flow.test.ts` timed out without assertion output. The touched boundary is covered by deterministic runtime/action/projection/App DOM tests plus `test:fast`.
- Rationale for selected scope: the change is additive on an existing controlled-step evidence path, keeps the existing action id and one-step dispatch path, and does not alter source apply, merge, remote, IntegrationCheck, or Harness evolution runtime authority.

## Acceptance Feedback

- Real/manual acceptance performed: yes, through deterministic real React/App DOM assertions in `tests/unit/web-app.test.tsx`.
- Manual config edits: none.
- Extra prompts or reviewer instructions: none.
- Retries or environment failures: `npm run test:fast` initially exposed two brittle App DOM waits in `tests/unit/web-app.test.tsx`; both were fixed to wait for real Workpad/run-graph surfaces before asserting. Independent subagent close-ready review initially returned `REVISE` for missing cross-Change `changeId` comparison; that blocker was fixed and tested. Earlier slow Workbench scheduler flow attempts timed out locally and were not repeated after targeted coverage passed.
- Screenshots / artifacts / run ids: App DOM test asserts `scheduler-controlled-loop-tick-summary`, tick phase text, stop reason, no button, and no fake `start-all` / `whole-wave` affordance.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: no workaround remains; future controlled loop runtime work should consume `controlledLoopTick` instead of deriving tick semantics from Workbench handler branches.

## Documentation Entropy Coverage

- Documentation entropy coverage applicable: yes.
- Documents checked: `AGENTS.md`, `docs/STATUS.md`, `docs/CURRENT-DEVELOPMENT-PLAN.md`, active change `summary.md`, active change `reviews/review.md`.
- Before/after line counts: current close-pass counts before post-close archive update were `AGENTS.md` 108 lines, `docs/STATUS.md` 146 lines, `docs/ECL.md` 294 lines. Review/summary updates add close evidence to the active change, not to current entry docs.
- Duplicate current-state fields checked: `AGENTS.md` and `docs/STATUS.md` both name active change `controlled-scheduler-loop-tick-runtime-boundary` and pending Harness evolution `none`.
- Roadmap/current-direction stale language checked: `docs/CURRENT-DEVELOPMENT-PLAN.md` still points to the controlled Scheduler loop runtime boundary as the next product-functional direction and does not claim a full scheduler loop, whole-wave dispatch, slot allocator, automatic child Change creation, source apply/merge, or Harness evolution automation is implemented.
- Archive-ledger content promoted / retained / merged / retired / archive-only: no phase narrative was promoted into current docs; historical detail remains archive-only.
- Over-budget documents and rationale: `docs/STATUS.md` remains longer than ideal but is acting as the current handoff map; no additional archive ledger content was copied into it during close-ready review.
- Tested with: line counts, active/pending handoff read, and Harness lint.

## Experience Lifecycle Coverage

- Experience lifecycle coverage applicable: no.
- If not applicable, reason: this is a product runtime/UI evidence change, not an auto-evolve, Harness rule/template, or process-memory change.

## Worktree Diff Artifact Coverage

- New-file / untracked worktree diff coverage applicable: no.
- If not applicable, reason: change does not affect worktree-backed diff collection, diff-producing run artifacts, validation diff hashes, audit diff review, apply preview/apply gates, or Spec-Test generation.

## Read Model Projection Coverage

- Workbench / GUI read-model projection coverage applicable: yes.
- Checked scope: `SchedulerControlledStepEvidence.controlledLoopTick` is projected through `summarizeSchedulerControlledStepEvidence()` and web `SchedulerControlledStepEvidenceSummary` without becoming workflow truth.
- Tested with: `tests/unit/scheduler-controlled-step-evidence.test.ts`, `tests/unit/controlled-scheduler-advance-post-step.test.ts`, `tests/unit/web-app.test.tsx`, and `npm run test:fast`.

## Workbench User-Surface Honesty Coverage

- Workbench user-surface honesty coverage applicable: yes.
- Sampled surface: Workpad controlled scheduler step evidence card.
- Visible primary UI backed by implemented workflow paths: no new primary action is rendered; the existing right confirmation queue remains the executable human gate.
- Out-of-scope future capability check: App DOM asserts no fake `start-all` / `whole-wave` affordance and the card text says it does not authorize automatic loop, batch dispatch, or source changes.
- Forbidden visible internal terms/actions checked: the affected card exposes user-facing read-only runtime evidence and does not add fake loop/parallel/slot/start-all controls.
- Duplicate primary action check: `queryByRole("button")` remains null inside the controlled-step evidence card.
- High-impact action path result: unchanged; dispatch still uses the existing scoped controlled Scheduler action path and server-side revalidation.
- Real App DOM / browser UI verification result when the behavior is product-visible: `tests/unit/web-app.test.tsx` passed in targeted run and `test:fast`.
- Projection/unit evidence that supplements but does not replace visible-surface acceptance: scheduler-runtime and controlled-advance tests assert the data path and no-authority flags.
- Tested with: targeted App DOM test and `npm run test:fast`.

## Scoped Workbench Action Payload Coverage

- Scoped Workbench action payload coverage applicable: yes.
- Checked target ids: `changeId`, `schedulerRunId`, and the concrete scheduler gate target ids carried by `planning.scheduler.controlled-advance.run` / `planning.scheduler.controlled-step.run`.
- Tested action path: `tests/unit/controlled-scheduler-step-contract.test.ts` verifies wrapper-to-concrete gate construction; `tests/unit/controlled-scheduler-advance-post-step.test.ts` verifies the handler calls the owner scope matcher three times before recording evidence.
- Duplicate action/evidence affordance check: Workpad evidence card remains read-only and contains no button.

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
- Artifact type and authority classification: `controlledLoopTick` is a scheduler-runtime controlled loop tick contract summary on existing controlled-step evidence; it is non-executing runtime evidence, not workflow truth or execution authority.
- Boundary matrix checked: scheduler-runtime owns tick summary construction/schema/rendering/event payload; workflow-scheduler owns controlled-step request/scope contract checks; Workbench action handler wires the existing action; Workbench projection and web card read/display only.
- Out-of-scope execution paths checked: no automatic scheduler loop, hidden continuation, whole-wave dispatch, slot allocation, child Change creation, source apply/close/merge, remote landing, or Harness evolution automation.
- Stale/forged target behavior checked: fresh Goal Loop packet, controller policy, and gate-readiness preflight scopes must match the submitted concrete gate through `assertControlledSchedulerFreshGateMatchesRequest()` before dispatch, including explicit cross-Change `changeId` mismatch rejection.
- Tested with: controlled scheduler step contract, controlled advance post-step, scheduler controlled-step evidence, App DOM, `typecheck`, `lint`, `test:fast`, and `build`.

## Goal Loop Boundary Coverage

- Goal Loop boundary coverage applicable: yes.
- Persistent Goal/Change scope checked: tick summary records the scoped Change/SchedulerRun evidence path and does not become a persistent autonomous objective.
- Recommendation authority checked: Goal Loop packet/controller/preflight ids are evidence references; they do not execute actions or authorize source/runtime transitions by themselves.
- Fallback priority checked: no fallback confirmation action is added; existing concrete planning/scheduler confirmations remain separate.
- Packet / main-Agent context freshness checked: controlled advance refreshes packet/controller/preflight evidence and validates exact concrete gate scope and `changeId` before dispatch.
- Stale or superseded packet suppression checked: mismatch, including cross-Change mismatch, throws before the concrete scheduler handler is called.
- Feedback selected Change / packet lineage / visible gate scope checked: not affected by this change.
- Feedback remains user evidence, not hidden instruction / arbitrary chat scrape / execution approval: not affected by this change.
- Feedback-triggered re-evaluation remains non-executing and primary Harness gate stays separate: not affected by this change.
- Hidden execution / source mutation check: no loop, source mutation, apply, close, merge, remote, or Harness evolution authorization is introduced.
- ToolPolicyGate / human gate preservation checked: existing high-impact audit and human-confirmed controlled Scheduler gate remain in place.
- Tested with: controlled scheduler step contract, controlled advance post-step, scheduler controlled-step evidence, App DOM, and `test:fast`.

## Module Boundary Coverage

- Module boundary coverage applicable: yes.
- Future feature owner module: `src/scheduler-runtime/` owns `controlledLoopTick`; `src/workflow-scheduler/` owns controlled Scheduler request/scope contracts; Workbench/web owners project read-only data.
- Module owners checked: scheduler-runtime, workflow-scheduler, Workbench action handler, Workbench projection, frontend Workpad card.
- Moved responsibilities: fresh gate/scope/change matching moved out of Workbench handler into `assertControlledSchedulerFreshGateMatchesRequest()` in workflow-scheduler; tick result fields reuse the existing route summary result extraction instead of duplicating a new local extractor.
- Retained facade responsibilities: Workbench action handler remains dispatch/result glue for the existing action; frontend card remains display-only.
- Forbidden write-back locations: no new main logic added to broad Workbench chat/server/App shells or manager facades.
- Compatibility surface: action ids, payload shape, confirmation queue behavior, controlled-step evidence path, and Workpad card behavior remain compatible with additive optional fields.
- Behavior path tested: controlled advance handler, scheduler runtime evidence repository/event, Workbench projection, and App DOM.
- Follow-up split candidates: none for this change.
- Boundary tests or lint checks: targeted Vitest suites, `npm run lint`, `npm run typecheck`.
- Compatibility result: additive optional `controlledLoopTick` field only.
- Tested with: targeted tests and product checks listed above.

## Core Mechanism Reuse Coverage

- Core mechanism reuse / architecture growth control coverage applicable: yes.
- Existing mechanisms reused or strengthened: existing `SchedulerControlledStepEvidence`, `controlledLoopTurnRouteSummary`, controlled-step result summary, Goal Loop packet/controller/preflight evidence, existing `planning.scheduler.controlled-advance.run` action, existing `planning.scheduler.controlled-step.run` wrapper, Workbench projection, and Workpad read-only card.
- New cross-cutting mechanism and owner: no separate artifact family; the added reusable summary is owned by scheduler-runtime as an additive field on the existing evidence artifact.
- Why existing mechanisms were insufficient: existing controlled-step evidence recorded pre/post/result/route facts but did not provide a single reusable observe/check/dispatch/reconcile/route-stop tick contract for future loop work.
- Domain-specific logic location: scheduler loop tick phase labels and stop posture live in scheduler-runtime.
- Shared cross-cutting logic location: legal action/scope matching stays in workflow-scheduler / workflow-actions; no-authority flags stay in scheduler-runtime controlled-step evidence.
- Local framework / state machine / projection / validation / gate avoided: no feature-local scheduler loop state machine, local safety gate, new projection system, new artifact protocol, or duplicate ToolPolicy path.
- Public API / facade / Workbench compatibility result: existing APIs and actions are preserved with additive optional projection fields.
- Future-cost reduction result: later controlled loop runtime work can read one owner-built tick summary instead of re-deriving the lifecycle from Workbench branches and multiple evidence refs.
- Tested with: targeted tests, `typecheck`, `lint`, `test:fast`, `build`.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- Handoff files checked: `AGENTS.md`, `docs/STATUS.md`, `docs/CURRENT-DEVELOPMENT-PLAN.md`, active change `summary.md`.
- Stale active-path / phase grep: active path still points at `harness/changes/active/controlled-scheduler-loop-tick-runtime-boundary/` before close; post-close handoff must remove active paths and point to the archive path.
- Latest archive / active path alignment: pre-close files agree on the active change; latest archive remains `20260621-controlled-scheduler-loop-turn-routing` until close.
- Pending evolution state checked: no pending evolution before close (`harness-evolve check`: 2 archived changes since last completion; threshold 5).

## Remote Handoff Acceptance Coverage

- Remote handoff coverage applicable: no.
- If not applicable, reason: change does not affect Draft PR creation/update, PR feedback refresh, provider capability detection, remote checks/reviews, or remote handoff evidence.
