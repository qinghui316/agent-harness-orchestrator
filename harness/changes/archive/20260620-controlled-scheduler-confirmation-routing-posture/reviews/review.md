# Review: controlled-scheduler-confirmation-routing-posture

Status: pass.

## Findings

No blocking product-code findings remain.

Independent close-ready subagent review `019ee53e-e431-7a22-8c58-0ee9c6309cd1` initially failed repository close readiness because `summary.md`, `tasks.md`, and this review file still contained placeholder/pending closeout state, and required coverage sections were marked not applicable. Those ECL artifact gaps were corrected in this closeout pass. The same subagent found no product-code correctness findings in the inspected diff.

## Verification

- Selected verification scope: controlled Scheduler next-candidate read-model projection, right confirmation-card App DOM rendering, adjacent Workbench action/read-model behavior, TypeScript, lint, build, and broad fast unit coverage.
- `npx vitest run tests/unit/workbench-goal-loop-surface.test.ts` passed: 19 tests.
- `npx vitest run tests/unit/web-app.test.tsx` passed: 32 tests, including real App DOM coverage for the right confirmation card.
- `npx vitest run tests/unit/workbench-action-results.test.ts tests/unit/workbench-action-service.test.ts tests/unit/workbench-read-model.test.ts` passed: 31 tests.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run build` passed.
- `npm run test:fast` first run had one unrelated lazy graph timing failure in `web-app`; the failing single test passed on direct rerun, and a second full `npm run test:fast` passed: 35 files, 376 tests.
- Full / aggregate suites run or skipped: `test:fast` was rerun and passed after the transient single-test rerun. Full slow Workbench and full release `npm run test` were skipped because this change is a bounded read-model/DTO/frontend rendering change that does not alter scheduler runtime, action handlers, ToolPolicyGate, stale revalidation, IntegrationCheck/apply, remote, source mutation, or Workbench aggregate contracts.
- Rationale for selected scope: the touched boundary is the existing controlled Scheduler next-candidate projection and the rendered confirmation card. Targeted projection tests cover derivation and stale/needs-review absence; real App DOM coverage verifies the visible user surface; adjacent action/read-model tests cover action preservation; typecheck/lint/build/test:fast cover compile, style, packaging, and broad unit regressions.

## Acceptance Feedback

- Real/manual acceptance performed: yes, deterministic real App DOM acceptance through `tests/unit/web-app.test.tsx`.
- Manual config edits: none.
- Extra prompts or reviewer instructions: none.
- Retries or environment failures: one `test:fast` run had a transient lazy graph DOM timing miss unrelated to this change; the targeted failing test and a full `test:fast` rerun both passed.
- Screenshots / artifacts / run ids: real App DOM test `renders refreshed controlled scheduler reconfirmation copy in the right confirmation card` verifies the visible routing posture and single controlled advance action.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none.

## Documentation Entropy Coverage

- Documentation entropy coverage applicable: yes.
- Documents checked: `AGENTS.md`, `docs/STATUS.md`, active `summary.md`, active `tasks.md`, active `reviews/review.md`.
- Before/after line counts: `AGENTS.md` 108 -> 108 lines; `docs/STATUS.md` 132 -> 132 lines at the active-handoff stage.
- Duplicate current-state fields checked: `AGENTS.md` and `docs/STATUS.md` both name active change `controlled-scheduler-confirmation-routing-posture` and pending Harness evolution `none`.
- Roadmap/current-direction stale language checked: `docs/STATUS.md` next resume point names this active phase and preserves the UI-validation rule; `docs/CURRENT-DEVELOPMENT-PLAN.md` remains the roadmap holder and was not expanded.
- Archive-ledger content promoted / retained / merged / retired / archive-only: no phase history was promoted into entry docs; this change retained only the current active handoff and UI-validation instruction.
- Over-budget documents and rationale: not applicable; `AGENTS.md` remains within the documented target.
- Tested with: line counts above, active-path grep, and later Harness lint/status.

## Experience Lifecycle Coverage

- Experience lifecycle coverage applicable: no.
- If not applicable, reason: change is not an auto-evolve, Harness rule/template, docs policy, or experience-retention update. It only updates current handoff fields for this active product change.

## Worktree Diff Artifact Coverage

- New-file / untracked worktree diff coverage applicable: no.
- If not applicable, reason: change does not affect worktree-backed diff behavior, diff-producing run artifacts, validation diff hashes, audit diff review, apply preview/apply gates, or Spec-Test generation.

## Read Model Projection Coverage

- Workbench / GUI read-model projection coverage applicable: yes.
- Checked scope: `buildControlledSchedulerNextCandidate()` derives optional routing posture copy from existing `WorkbenchGoalLoopSummary` conflict/routing and scheduler execution-mode evidence, while the existing ready/fresh confirmation gate remains the source of whether the executable right-card detail appears.
- Tested with: `npx vitest run tests/unit/workbench-goal-loop-surface.test.ts`.
- Result: pass. The test `derives sanitized routing posture copy for controlled scheduler next-candidate detail` verifies sanitized copy and forbidden raw-term exclusion. Existing tests cover that needs-review/stale next-candidate evidence is not merged into controlled scheduler advance unless ready.

## Workbench User-Surface Honesty Coverage

- Workbench user-surface honesty coverage applicable: yes.
- Sampled surface: Workbench right confirmation card for controlled Scheduler next-candidate detail.
- Visible primary UI backed by implemented workflow paths: yes. The card still exposes the existing controlled Scheduler advance confirmation path only.
- Out-of-scope future capability check: pass. Visible text explicitly says this is single-step controlled and does not claim automatic loop, whole-wave dispatch, slot allocation, full parallel executor, source apply, merge, or close behavior.
- Forbidden visible internal terms/actions checked: `planning.scheduler`, `SchedulerRun`, `worker`, `scheduler run`, `slot`, `start-all`, `whole-wave`, `自动应用`, `自动关闭`, and `合并全部`.
- Duplicate primary action check: pass. The App DOM test asserts exactly one button in the right card.
- High-impact action path result: unchanged; action still routes through the existing controlled advance confirmation and human gate.
- Real App DOM / browser UI verification result when the behavior is product-visible: pass via `npx vitest run tests/unit/web-app.test.tsx`.
- Projection/unit evidence that supplements but does not replace visible-surface acceptance: pass via `npx vitest run tests/unit/workbench-goal-loop-surface.test.ts`.

## Scoped Workbench Action Payload Coverage

- Scoped Workbench action payload coverage applicable: yes for regression assurance, though this change does not add or change action payload fields.
- Checked target ids: existing controlled Scheduler advance action target ids, including change/scheduler claim reservation scope where present.
- Tested action path: adjacent Workbench action/read-model suites and existing `workbench-goal-loop-surface` controlled advance tests.
- Duplicate action/evidence affordance check: pass. The right card renders one controlled advance button and evidence refs remain evidence links, not extra confirmation actions.
- Result: action payload shape and stale revalidation path were not changed.

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

- Proposal/runtime boundary coverage applicable: no.
- If not applicable, reason: change does not introduce or change planning proposals, decomposition plans, readiness manifests, workflow plans, recovery material, scheduler-readiness artifacts, or similar proposal/runtime boundary artifacts.

## Goal Loop Boundary Coverage

- Goal Loop boundary coverage applicable: yes.
- Persistent Goal/Change scope checked: active Change `controlled-scheduler-confirmation-routing-posture`.
- Recommendation authority checked: the new routing posture is explanatory read-model copy only and does not promote Goal Loop recommendations into executable fallback actions.
- Fallback priority checked: no fallback confirmation behavior was changed.
- Packet / main-Agent context freshness checked: existing controlled Scheduler next-candidate ready/fresh gate remains outside this helper; this change does not alter packet freshness logic.
- Stale or superseded packet suppression checked: existing tests cover needs-review/stale absence from executable controlled advance detail.
- Feedback selected Change / packet lineage / visible gate scope checked: not applicable; feedback behavior was not changed.
- Feedback remains user evidence, not hidden instruction / arbitrary chat scrape / execution approval: not applicable.
- Feedback-triggered re-evaluation remains non-executing and primary Harness gate stays separate: not applicable.
- Hidden execution / source mutation check: pass. No runtime, action handler, source, apply, close, remote, or scheduler execution path changed.
- ToolPolicyGate / human gate preservation checked: pass. The change renders optional strings only and leaves controlled advance action/gate behavior unchanged.
- Tested with: `workbench-goal-loop-surface`, `web-app`, adjacent action/read-model suites, typecheck, lint, build, and `test:fast`.

## Module Boundary Coverage

- Module boundary coverage applicable: yes.
- Future feature owner module: `src/workbench/projections/read-model/goal-loop-next-candidate.ts` owns derived controlled Scheduler next-candidate copy.
- Module owners checked: read-model projection owns derivation; `src/workbench/read-model-types.ts` and `src/web/src/types.ts` own DTO shapes; `DecisionPanels.tsx` passively renders strings.
- Moved responsibilities: none.
- Retained facade responsibilities: no broad facade took new main logic.
- Forbidden write-back locations: no scheduler policy was added to `DecisionPanels.tsx`, `App.tsx`, server/bridge glue, manager facades, or Workbench chat facade.
- Compatibility surface: optional DTO field preserves existing snapshots and confirmation item shape.
- Behavior path tested: projection derivation and right-card rendering.
- Follow-up split candidates: none.
- Boundary tests or lint checks: targeted projection/App DOM tests plus typecheck/lint/build.
- Compatibility result: pass.

## Core Mechanism Reuse Coverage

- Core mechanism reuse / architecture growth control coverage applicable: yes.
- Existing mechanisms reused or strengthened: `WorkbenchGoalLoopSummary`, conflict/routing posture evidence, scheduler execution-mode evidence, controlled Scheduler next-candidate projection, confirmation queue, existing right decision card.
- New cross-cutting mechanism and owner: none.
- Why existing mechanisms were insufficient: not applicable; no new mechanism was introduced.
- Domain-specific logic location: user-facing scheduler posture wording is local to the controlled Scheduler next-candidate projection owner.
- Shared cross-cutting logic location: existing Goal Loop/scheduler evidence and confirmation gating remain the shared mechanisms.
- Local framework / state machine / projection / validation / gate avoided: avoided frontend scheduler policy derivation, new local gate, new local state machine, and new action source.
- Public API / facade / Workbench compatibility result: pass through optional fields and unchanged actions.
- Future-cost reduction result: future decision-card explanations can reuse this pattern of read-model-derived sanitized copy instead of embedding policy in frontend panels.
- Tested with: targeted projection/App DOM tests, adjacent Workbench tests, typecheck, lint, build, and `test:fast`.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- Handoff files checked: `AGENTS.md`, `docs/STATUS.md`, active `summary.md`, active `tasks.md`, active `reviews/review.md`.
- Stale active-path / phase grep: active-stage grep found matching active paths in `AGENTS.md` and `docs/STATUS.md`; active summary was changed from `Active.` to `Ready to close.`.
- Latest archive / active path alignment: pre-close handoff names the active path consistently. After archive close, `AGENTS.md` and `docs/STATUS.md` must be updated to no active change and latest archive path.
- Pending evolution state checked: `harness/evolution/pending.md` absent before close.
- Result: pass for pre-close alignment; final no-active/archive alignment will be checked after `harness-change close`.

## Remote Handoff Acceptance Coverage

- Remote handoff coverage applicable: no.
- If not applicable, reason: change does not affect Draft PR creation/update, PR feedback refresh, provider capability detection, remote checks/reviews, or remote handoff evidence.
