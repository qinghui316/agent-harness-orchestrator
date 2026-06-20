# Review: Workbench Controlled Loop Result Surface

Status: approved.

## Findings

No blocking implementation findings remain.

Independent close-ready review initially returned NOT PASS for close/git readiness because the new helper file was still untracked, this review file was still in template state, and T-006 was unchecked. Those were closeout/evidence issues, not runtime or product-boundary defects. The helper file is now explicitly listed in the intended commit scope, this review records the actual coverage, and T-006 is closed after final status checks.

## Verification

Passed:

- `npx vitest run tests/unit/workbench-action-results.test.ts tests/unit/workbench-read-model.test.ts tests/unit/workbench-goal-loop-surface.test.ts`
- `npm run typecheck`
- `npm run lint`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\harness-evolve.ps1 check`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\harness-change.ps1 status`

Selected verification scope: targeted Workbench result/read-model/Goal Loop surface tests plus shared TypeScript/lint and Harness checks.

Full / aggregate suites run or skipped: full `npm run test` was skipped because the touched behavior is limited to Workbench primary-surface copy, read-model fallback projection, and Goal Loop handler message text; no runtime scheduler, storage, apply, or integration execution logic changed.

Rationale for selected scope: `workbench-action-results` covers action result labels/summaries, `workbench-read-model` covers thread workflow fallback rows, and `workbench-goal-loop-surface` covers the actual Goal Loop action thread-message path. Typecheck/lint cover the new helper imports and public compile surface.

## Acceptance Feedback

- Real/manual acceptance performed: no manual UI run; automated projection and handler tests cover the visible data contract.
- Manual config edits: none.
- Extra prompts or reviewer instructions: user requested larger product slices and not to keep doing tiny architecture-only changes; this change was scoped as one user-visible result chain.
- Retries or environment failures: initial targeted test run failed on expected label/copy updates and was corrected; final targeted run passed.
- Screenshots / artifacts / run ids: not applicable.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none.

## Documentation Entropy Coverage

- Documentation entropy coverage applicable: yes.
- Documents checked: `AGENTS.md`, `docs/STATUS.md`, active change files.
- Duplicate current-state fields checked: yes; active state points to `workbench-controlled-loop-result-surface`.
- Roadmap/current-direction stale language checked: yes; status now says continue the active result-surface change, not generic next work.
- Archive-ledger content promoted / retained / merged / retired / archive-only: no archive history promoted; current docs only contain active handoff state.
- Over-budget documents and rationale: not applicable.
- Tested with: `scripts/lint-ecl.ps1`, `scripts/harness-change.ps1 status`.

## Experience Lifecycle Coverage

- Experience lifecycle coverage applicable: no.
- If not applicable, reason: this is not a Harness evolution or experience-rule/template change.

## Worktree Diff Artifact Coverage

- New-file / untracked worktree diff coverage applicable: yes.
- Checked scope: new `src/workbench/user-surface/controlled-loop-results.ts` is part of the intended commit scope; unrelated `README.md` remains untracked and excluded.
- Tested with: `git status --short` and subagent close-ready review.

## Read Model Projection Coverage

- Workbench / GUI read-model projection coverage applicable: yes.
- Checked scope: workflow started/completed/failed fallback labels and bodies for controlled Scheduler step/advance and Goal Loop evaluate/feedback/controller/preflight actions.
- Tested with: `tests/unit/workbench-read-model.test.ts`.

## Workbench User-Surface Honesty Coverage

- Workbench user-surface honesty coverage applicable: yes.
- Sampled surface: action result labels/summaries, confirmation action labels, Workbench thread fallback rows, and actual Goal Loop assistant message text.
- Visible primary UI backed by implemented workflow paths: yes; copy maps to existing action handlers and read-model projection.
- Out-of-scope future capability check: copy states one-step or non-executing behavior and does not imply hidden loop execution.
- Forbidden visible internal terms/actions checked: tests assert primary controlled-loop copy avoids raw internal terms such as `GoalLoop`, `planning.scheduler`, concrete gate wording, continuation brief, whole-wave, and slot allocator.
- Duplicate primary action check: not changed; existing confirmation queue action replacement behavior remains.
- High-impact action path result: Scheduler controlled advance/step copy says later steps, apply, close, remote landing, and maintenance evolution still require separate confirmation.
- Tested with: `tests/unit/workbench-action-results.test.ts`, `tests/unit/workbench-read-model.test.ts`, `tests/unit/workbench-goal-loop-surface.test.ts`.

## Scoped Workbench Action Payload Coverage

- Scoped Workbench action payload coverage applicable: no.
- If not applicable, reason: action payload shape, target ids, and server scope validation were not changed.

## Source Apply Safety Coverage

- Source apply safety coverage applicable: no.
- If not applicable, reason: source apply/discard, worktrees, integration checks, remote landing, and source-root mutation gates were not changed.

## Runtime Bridge Boundary Coverage

- Runtime bridge boundary coverage applicable: no.
- If not applicable, reason: external executors, Codex bridge integration, SQLite stores, and runtime projections were not changed.

## Proposal / Runtime Boundary Coverage

- Proposal/runtime boundary coverage applicable: yes.
- Artifact type and authority classification: Goal Loop evidence artifacts remain generated by `src/goal-loop`; Workbench primary messages now summarize and link to them instead of rendering full evidence Markdown as chat text.
- Boundary matrix checked: no execution authority added; evidence artifacts remain evidence.
- Out-of-scope execution paths checked: no Scheduler runtime, ToolPolicyGate, validation/audit, IntegrationCheck, apply, close, remote landing, or Harness evolution path changed.
- Stale/forged target behavior checked: unchanged, existing boundary validation remains in `src/workbench/actions/boundary.ts`.
- Tested with: targeted Workbench tests, `npm run typecheck`, `npm run lint`.

## Goal Loop Boundary Coverage

- Goal Loop boundary coverage applicable: yes.
- Persistent Goal/Change scope checked: unchanged; handlers still resolve the scoped topic/change before compiling evidence.
- Recommendation authority checked: updated copy states evaluation/refresh/check actions only record evidence and do not execute steps.
- Fallback priority checked: confirmation queue label changed only; fallback behavior remains existing priority.
- Packet / main-Agent context freshness checked: unchanged.
- Stale or superseded packet suppression checked: unchanged.
- Feedback selected Change / packet lineage / visible gate scope checked: unchanged payload and existing tests still cover feedback projection.
- Feedback remains user evidence, not hidden instruction / arbitrary chat scrape / execution approval: unchanged.
- Feedback-triggered re-evaluation remains non-executing and primary Harness gate stays separate: yes, copy and tests assert separate confirmation.
- Hidden execution / source mutation check: no execution branch changed.
- ToolPolicyGate / human gate preservation checked: no action dispatch or gate enforcement code changed.
- Tested with: `tests/unit/workbench-goal-loop-surface.test.ts`.

## Module Boundary Coverage

- Module boundary coverage applicable: yes.
- Future feature owner module: Workbench user-surface/action/projection layer.
- Module owners checked: `src/workbench/user-surface/controlled-loop-results.ts` owns primary-surface copy; action results, Goal Loop handler, and read-model projection call it.
- Moved responsibilities: primary chat text no longer reuses Goal Loop evidence Markdown renderers.
- Retained facade responsibilities: no facade changes.
- Forbidden write-back locations: no writes to `src/goal-loop` evidence generation, `src/workflow-scheduler`, `src/scheduler-runtime`, ToolPolicy, integration/apply, or Harness evolution behavior.
- Compatibility surface: action types, payloads, artifacts, and read-model shapes remain compatible.
- Follow-up split candidates: broader older Scheduler copy audit can be a future product polish item if prioritized.
- Boundary tests or lint checks: targeted Workbench tests plus typecheck/lint.
- Compatibility result: compatible.
- Tested with: targeted Workbench tests.

## Core Mechanism Reuse Coverage

- Core mechanism reuse / architecture growth control coverage applicable: yes.
- Existing mechanisms reused or strengthened: existing action result summarization, read-model workflow projection, Goal Loop handlers, and scheduler user-facing copy owner.
- New cross-cutting mechanism and owner: a small Workbench user-surface copy helper for controlled-loop primary surfaces.
- Why existing mechanisms were insufficient: the same controlled-loop user-facing text was otherwise split across result summaries, thread fallback, and handler messages.
- Domain-specific logic location: Scheduler and Goal Loop runtime facts stay in their existing owners.
- Shared cross-cutting logic location: `src/workbench/user-surface/controlled-loop-results.ts`.
- Local framework / state machine / projection / validation / gate avoided: yes; no new state machine, projection framework, validator, or gate protocol.
- Public API / facade / Workbench compatibility result: compatible.
- Future-cost reduction result: future controlled-loop primary surfaces can extend one helper instead of patching three paths.
- Tested with: targeted Workbench tests, typecheck/lint.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- Handoff files checked: `AGENTS.md`, `docs/STATUS.md`, active change summary/spec/plan/tasks/review.
- Stale active-path / phase grep: active path remains `harness/changes/active/workbench-controlled-loop-result-surface` until close.
- Latest archive / active path alignment: checked before close; close command will update archive.
- Pending evolution state checked: `harness-evolve.ps1 check` reported no pending evolution.

## Remote Handoff Acceptance Coverage

- Remote handoff coverage applicable: no.
- If not applicable, reason: change does not affect Draft PR creation/update, PR feedback refresh, provider capability detection, remote checks/reviews, or remote handoff evidence.
