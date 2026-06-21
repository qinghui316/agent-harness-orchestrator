# Review: workbench-demand-to-execution-golden-flow

Status: completed.

## Findings

No blocking product findings remain.

Residual test-infrastructure debt:

- `npm run test:workbench` timed out twice with no failure stack at 184 seconds and 604 seconds. The same Workbench unit suites passed when run sequentially, and the new bounded slow golden-flow acceptance passed. This is recorded as aggregate command stability debt, not as a product blocker for the front-half golden flow.
- A parallel multi-file targeted run reproduced the known `tests/unit/web-app.test.tsx` aggregate-only DOM `fetch` mock flake; `tests/unit/web-app.test.tsx` passed when run alone.

## Verification

- Selected verification scope: targeted Workbench read-model/action/server/DOM/golden-flow suites, Workbench unit suites in package-script order, plus required project gates.
- Targeted suites:
  - `npx vitest run tests/unit/workbench-read-model.test.ts` passed: 26 tests.
  - `npx vitest run tests/unit/workbench-task-runtime.test.ts` passed: 25 tests.
  - `npx vitest run tests/unit/workbench-goal-loop-surface.test.ts` passed: 23 tests.
  - `npx vitest run tests/unit/web-app.test.tsx` passed: 36 tests.
  - `npx vitest run tests/slow/workbench-demand-to-execution-golden-flow.test.ts` passed: 1 test.
- Workbench unit aggregate by sequential suite execution passed for `workbench-read-model`, `workbench-task-runtime`, `workbench-goal-loop-surface`, `workbench-planning-scheduler-prep`, `workbench-scheduler-runtime-surface`, `workbench-feedback-surface`, `workbench-conversation-lifecycle`, `workbench-agent-task-domain`, and `workbench-demand-worker`.
- Required project checks:
  - `npm run typecheck` passed.
  - `npm run lint` passed.
  - `npm run test:fast` passed: 46 files, 467 tests.
  - `npm run build` passed.
- Full / aggregate suites:
  - `npm run test:workbench` attempted twice and timed out with no failure stack. Bounded Workbench unit suites and the new slow acceptance cover the touched boundary more deterministically for this slice.
- Rationale for selected scope: this change touched Workbench confirmation projection and user-facing gates, plus action payload visibility for planning/decomposition/readiness/code. The selected suites prove the exact front-half path and the existing result-review/apply handoff without depending on the slow aggregate command.

## Acceptance Feedback

- Real/manual acceptance performed: deterministic slow Workbench acceptance through the Workbench action path.
- Manual config edits: none.
- Extra prompts or reviewer instructions: none.
- Retries or environment failures: initial vague-demand test correctly blocked for clarification; the acceptance demand was rewritten to a clear product request.
- Screenshots / artifacts / run ids: bounded test artifacts from `tests/slow/workbench-demand-to-execution-golden-flow.test.ts`.
- External source/state safety: isolated temporary git repo; `git status --porcelain` clean before `code.run` and clean after `code.run`; no apply was executed.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: test-stability debt remains for `npm run test:workbench` timeout and the aggregate-only DOM `fetch` mock flake.

## Documentation Entropy Coverage

- Documentation entropy coverage applicable: yes.
- Documents checked: `AGENTS.md`, `docs/STATUS.md`, `docs/CURRENT-DEVELOPMENT-PLAN.md`, active change docs.
- Before close line counts: `AGENTS.md` 159, `docs/STATUS.md` 104, `docs/CURRENT-DEVELOPMENT-PLAN.md` 98.
- Duplicate current-state fields checked with `rg` for active paths, full-auto next-step language, and controlled Scheduler latest/next wording.
- Roadmap/current-direction stale language checked: active wording is moved to archive after close; full-auto remains later roadmap only.
- Archive-ledger content promoted / retained / merged / retired / archive-only:
  - Promote: none; no new Harness rule was needed.
  - Retain: human-gated source apply, close/archive, remote handoff, and Harness evolution boundaries.
  - Merge: front-half golden-flow evidence and previous back-half manual-loop evidence become one current manual-gated Workbench baseline.
  - Retire: active-path wording after close.
  - Archive-only: controlled Scheduler phase detail and closed Workbench manual-loop phase detail.
- Over-budget documents and rationale: none for this mature repo handoff; `AGENTS.md` remains within the 120-180 mature-project target.
- Tested with: closeout drift greps plus Harness checks.

## Experience Lifecycle Coverage

- Experience lifecycle coverage applicable: yes for closeout scan only; this is not Harness evolution.
- Promote decisions: none. The existing ECL rules already cover projection, scoped payload, source safety, proposal/runtime boundary, module boundary, and core mechanism reuse.
- Retain decisions: keep current manual-gated authority boundaries and explicit target-id requirements.
- Merge decisions: combine the previously proven apply/close half and this front-half acceptance into one baseline statement in handoff docs.
- Retire decisions: remove active-path pointers after archive close.
- Archive-only decisions: detailed controlled Scheduler and earlier Workbench phase narratives stay in archived summaries and `INDEX.json`.
- Noop / no-change rationale after old-experience scan: no Harness evolution or template change is warranted by this product slice.

## Worktree Diff Artifact Coverage

- New-file / untracked worktree diff coverage applicable: no.
- If not applicable, reason: this change does not modify worktree diff collection, diff-producing run artifacts, validation diff hashes, audit diff review, apply preview/apply gates, or Spec-Test generation.

## Read Model Projection Coverage

- Workbench / GUI read-model projection coverage applicable: yes.
- Checked scope: confirmation queue projection for planning draft, `planning.decompose`, decomposition confirm, readiness assessment, readiness-scoped `code.run`, result review, and existing apply/close handoff.
- Tested with: `tests/unit/workbench-read-model.test.ts` new front-half projection coverage and `tests/unit/web-app.test.tsx` DOM honesty coverage.

## Workbench User-Surface Honesty Coverage

- Workbench user-surface honesty coverage applicable: yes.
- Sampled surface: Workbench main demand conversation, right confirmation queue, and default App DOM.
- Visible primary UI backed by implemented workflow paths: confirmed for `planning.generate`, `planning.confirm-execution`, `planning.decompose`, `planning.decomposition.confirm`, `planning.decomposition.assess-readiness`, `code.run`, result review/apply, and close.
- Out-of-scope future capability check: tests assert no fake full-auto, parallel executor, merge queue, slot allocator, whole-wave dispatch, automatic child Change, or unsupported remote action wording appears in the default surface.
- Forbidden visible internal terms/actions checked: user-facing copy avoids Goal Loop, Scheduler, TaskRun, WorkerLease, worktree, and source-mutation terminology in the primary gate for this path.
- Duplicate primary action check: front-half projection test verifies one current primary confirmation at each stage.
- High-impact action path result: source apply and close remain separate existing human gates; `code.run` only produces candidate result/evidence.
- Real App DOM / browser UI verification result when behavior is product-visible: `tests/unit/web-app.test.tsx` passed when run alone; aggregate-only DOM flake is recorded above.
- Projection/unit evidence that supplements visible-surface acceptance: read-model and task-runtime targeted suites passed.

## Scoped Workbench Action Payload Coverage

- Scoped Workbench action payload coverage applicable: yes.
- Checked target ids: `changeId`, `planningBundleId`, `decompositionPlanId`, `readinessManifestId`, optional `taskIds`, and existing apply/close ids.
- Tested action path: `tests/unit/workbench-task-runtime.test.ts` rejects missing/forged/stale readiness and task ids; `tests/slow/workbench-demand-to-execution-golden-flow.test.ts` exercises the Workbench action path end to end.
- Duplicate action/evidence affordance check: read-model projection test verifies one primary confirmation per stage and no evidence-only action duplicated as primary.

## Transcript Renderer Source-Boundary Coverage

- Transcript renderer source-boundary coverage applicable: no.
- If not applicable, reason: this change did not modify the default parent-agent transcript renderer or its canonical transcript projection.

## Source Apply Safety Coverage

- Source apply safety coverage applicable: yes because the golden flow connects to existing result review/apply handoff.
- Checked source project / fixture: isolated temporary git repo created by `tests/slow/workbench-demand-to-execution-golden-flow.test.ts`.
- Checked worktree ids / result ids / integration check ids: result review reached a ready-to-apply worktree produced by the fake Codex run and validation/audit evidence.
- Source-root mutation gate checked: before `code.run`, source `git status --porcelain` was clean; after `code.run`, source `git status --porcelain` remained clean. No `result.apply` was executed.
- Out-of-scope source mutation check: no automatic apply, archive, merge, push, or remote landing occurred.
- Tested with: slow golden-flow acceptance.

## Runtime Bridge Boundary Coverage

- Runtime bridge boundary coverage applicable: yes.
- Checked boundary: `code.run` through Workbench action path reaches existing `runMainAgentToolOrchestration`, and Change/ECL artifacts, run artifacts, validation, audit, apply, and close remain workflow truth.
- Tested with: slow golden-flow acceptance using fake Codex only at `code.run`, plus task-runtime stale-target tests.

## Proposal / Runtime Boundary Coverage

- Proposal/runtime boundary coverage applicable: yes.
- Artifact type and authority classification: planning draft is proposal evidence; confirmed `spec.md`/`plan.md`/`tasks.md`/`ac-map.json` are canonical planning artifacts; `DecompositionPlan` is proposal; `DecompositionReadinessManifest` is guardrail; `code.run` is executable runtime action only after readiness allows it.
- Boundary matrix checked:
  - `planning.confirm-execution`: requires `changeId` and `planningBundleId`; writes canonical planning artifacts; does not start runtime.
  - `planning.decompose`: requires `changeId`; writes decomposition proposal; does not start runtime.
  - `planning.decomposition.confirm`: requires `changeId` and `decompositionPlanId`; confirms proposal; does not start runtime.
  - `planning.decomposition.assess-readiness`: requires `changeId` and `decompositionPlanId`; writes readiness guardrail; does not start runtime.
  - `code.run`: requires `changeId` and `readinessManifestId`; may carry `taskIds`; starts existing code workflow only after readiness permits.
- Out-of-scope execution paths checked: no execution on planning confirmation, no child Change creation, no TaskQueue/parallel executor in the single-change path, no automatic apply/close.
- Stale/forged target behavior checked: stale readiness id and forged task ids fail closed in task-runtime tests.
- Tested with: read-model, task-runtime, planning-scheduler-prep, and slow golden-flow suites.

## Goal Loop Boundary Coverage

- Goal Loop boundary coverage applicable: yes, because a Goal Loop surface test was adjusted to reflect concrete-gate priority.
- Checked boundary: Goal Loop fallback remains hidden when a concrete planning gate exists; no run, worktree, or integration check is started by the fallback surface.
- Tested with: `tests/unit/workbench-goal-loop-surface.test.ts`.

## Module Boundary Coverage

- Module boundary coverage applicable: yes.
- Future feature owner module: Workbench read-model confirmation projection owns the new visible gate selection; existing Workbench action handlers own action behavior; server action route/revalidation owns target validation; runtime bridge owns code execution.
- Module owners checked: implementation stayed in `src/workbench/projections/read-model/confirmation/typed-workflow.ts`, the owner for typed workflow confirmation items.
- Moved responsibilities: none.
- Retained facade responsibilities: thin public exports, route/action dispatch glue, and compatibility shapes only.
- Forbidden write-back locations: no new main logic was added to broad Workbench/chat/server/App facades.
- Compatibility surface: action ids, route JSON, SSE/live cache, projection shapes, and confirmation item shapes remain compatible; only missing primary queue items were added.
- Behavior path tested: read-model projection, task-runtime action rejection, DOM, and slow Workbench action path.
- Boundary tests or lint checks: targeted tests above plus `npm run lint`.
- Compatibility result: compatible.

## Core Mechanism Reuse Coverage

- Core mechanism reuse / architecture growth control coverage applicable: yes.
- Existing mechanisms reused or strengthened: action registry, scoped target revalidation, ToolPolicy/human gates, typed workflow artifacts, readiness manifest, code runtime orchestration, validation/audit, result review, source apply safety, and close handoff.
- New cross-cutting mechanism and owner: none.
- Why existing mechanisms were insufficient: they were sufficient; the gap was projection visibility of existing gates.
- Domain-specific logic location: existing Workbench planning/decomposition/code handlers and typed confirmation projection.
- Shared cross-cutting logic location: existing target, artifact, lineage, read-model, ToolPolicy, validation/audit, and apply owners.
- Local framework / state machine / projection / validation / gate avoided: no scheduler executor, local action state machine, new evidence family, new summary layer, or fake automation gate was introduced.
- Public API / facade / Workbench compatibility result: compatible.
- Future-cost reduction result: future automation can now build from a tested manual-gated baseline rather than another explanatory layer.
- Tested with: targeted and required verification listed above.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- Handoff files checked: `AGENTS.md`, `docs/STATUS.md`, `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- Stale active-path / phase grep: checked with `rg` for active path, full-auto next-step language, and controlled Scheduler latest/next wording before close; final grep is run after archive close.
- Latest archive / active path alignment: closeout updates AGENTS/STATUS/current plan after `harness-change close`.
- Pending evolution state checked: no pending Harness evolution.

## Remote Handoff Acceptance Coverage

- Remote handoff coverage applicable: no.
- Checked provider/repository/action boundary: not applicable.
- Tested with: not applicable.
- If not applicable, reason: this change does not affect Draft PR creation/update, PR feedback refresh, provider capability detection, remote checks/reviews, or remote handoff evidence.
