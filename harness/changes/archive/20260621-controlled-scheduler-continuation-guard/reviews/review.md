# Review: controlled-scheduler-continuation-guard

Status: close-ready after fix.

## Findings

- P1 resolved: independent subagent `019ee6aa-336a-7023-a0ef-3be3a6a6290c` found that `gateFromCurrentGate()` normalized prior preflight `currentGate.scope.changeId` to the current Change, which could accept forged or stale cross-change preflight scope. The guard now explicitly rejects when the prior preflight current gate scope `changeId` differs from the current Change, and `tests/unit/controlled-scheduler-step-contract.test.ts` covers the cross-change fail-closed case. The same subagent re-reviewed the fix and reported no remaining code/test blocker before close.

No remaining blocking findings are recorded.

## Verification

- Selected verification scope: targeted controlled Scheduler guard/handler suites plus broad fast product gates because the change touches shared Scheduler/Goal Loop action execution.
- `npx vitest run tests/unit/controlled-scheduler-step-contract.test.ts tests/unit/controlled-scheduler-advance-post-step.test.ts`: passed, 2 files / 17 tests.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run test:fast`: passed on final run, 39 files / 409 tests.
- `npm run build`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status`: active change initially incomplete because tasks/review were not yet updated; STATUS aligned.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`: passed, no pending evolution before close.
- Full / aggregate suites run or skipped: `test:fast` and build were run; full `npm run test`, slow Workbench suites, and integration suites were skipped because this change does not alter external executors, Workbench UI rendering, source apply, remote handoff, or integration-test-only CLI flows.
- Rationale for selected scope: targeted tests prove the new guard behavior and fail-before-execution ordering; `test:fast`, typecheck, lint, and build cover adjacent Scheduler, Goal Loop, Workbench server/App DOM fast surfaces.

Verification note: an initial `npm run test:fast` run had one transient Workbench DOM lookup failure in `tests/unit/web-app.test.tsx`. The failed test passed standalone, and a second full `test:fast` run passed.

## Acceptance Feedback

- Real/manual acceptance performed: no.
- Manual config edits: none.
- Extra prompts or reviewer instructions: plan review used subagents `019ee69c-f76e-7a03-a67c-c3f81ef00ccf`, `019ee69d-5195-7981-bd68-186c1fc7ceb0`, and `019ee69d-8328-73e1-bd68-186c1fc7ceb0`; implementation close-ready review used subagent `019ee6aa-336a-7023-a0ef-3be3a6a6290c`.
- Retries or environment failures: one transient Workbench DOM test failure passed on rerun as described above.
- Screenshots / artifacts / run ids: not applicable.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none.

## Documentation Entropy Coverage

- Documentation entropy coverage applicable: yes.
- Documents checked: `AGENTS.md`, `docs/STATUS.md`, `docs/CURRENT-DEVELOPMENT-PLAN.md`, active change files.
- Before/after line counts: not material for this closeout; only current-state handoff fields and active-change closeout evidence were updated.
- Duplicate current-state fields checked: `AGENTS.md` and `docs/STATUS.md` point to the same active change before close.
- Roadmap/current-direction stale language checked: `docs/CURRENT-DEVELOPMENT-PLAN.md` already identifies controlled Scheduler continuation readiness as current baseline and the guard as the next product-functional step; final closeout will update it to include the guard as baseline.
- Archive-ledger content promoted / retained / merged / retired / archive-only: no archive narrative was promoted; detailed history remains archive-only.
- Over-budget documents and rationale: not applicable.
- Tested with: ECL lint and handoff drift review.

## Experience Lifecycle Coverage

- Experience lifecycle coverage applicable: no.
- If not applicable, reason: no pending Harness evolution exists and this change does not alter Harness rules/templates.

## Worktree Diff Artifact Coverage

- New-file / untracked worktree diff coverage applicable: no.
- If not applicable, reason: change does not affect worktree-backed diff behavior.

## Read Model Projection Coverage

- Workbench / GUI read-model projection coverage applicable: no.
- If not applicable, reason: change does not affect Workbench projections or derived read models.

## Workbench User-Surface Honesty Coverage

- Workbench user-surface honesty coverage applicable: no.
- If not applicable, reason: change does not add or alter visible Workbench UI, buttons, copy, or projection surfaces.

## Scoped Workbench Action Payload Coverage

- Scoped Workbench action payload coverage applicable: yes.
- Checked target ids: existing `planning.scheduler.controlled-advance.run` request target ids, including Change, SchedulerRun, claim reservation, claim intent, reservation intent, and worker-start targets as required by the concrete gate.
- Tested action path: `tests/unit/controlled-scheduler-advance-post-step.test.ts` proves the handler resolves the submitted concrete gate, calls the continuation guard before fresh Goal Loop evidence, and does not call Goal Loop/controller/preflight/controlled-step/concrete scheduler handlers when the guard rejects.
- Duplicate action/evidence affordance check: no new action or UI affordance was introduced.

## Transcript Renderer Source-Boundary Coverage

- Transcript renderer source-boundary coverage applicable: no.
- If not applicable, reason: change does not affect the default Workbench main conversation transcript.

## Source Apply Safety Coverage

- Source apply safety coverage applicable: no.
- If not applicable, reason: change does not affect result review, worktrees, source apply/discard, IntegrationCheck apply handoff, or source-root mutation.

## Runtime Bridge Boundary Coverage

- Runtime bridge boundary coverage applicable: no.
- If not applicable, reason: change does not affect external executors, Codex bridge integration, SQLite stores, Topic sessions, prompt stack composition, AHO-managed skills, or runtime projections.

## Proposal / Runtime Boundary Coverage

- Proposal/runtime boundary coverage applicable: yes.
- Artifact type and authority classification: prior `SchedulerControlledStepEvidence`, `controlledLoopContinuationReadiness`, and `GoalLoopGateReadinessPreflight` remain non-executing evidence/guard inputs, not executable runtime authority.
- Boundary matrix checked: required target ids are validated with `validateWorkflowActionRequiredTargets`; action/scope is compared with `workflowActionScopesMatchStrict`; stale, warning, missing, non-ready, cross-change, mismatched, or incomplete targets fail before any canonical scheduler transition starts.
- Out-of-scope execution paths checked: no automatic loop, whole-wave dispatch, slot allocation, source mutation, apply, close, merge, remote landing, child Change, ToolPolicy change, or Harness evolution behavior was added.
- Stale/forged target behavior checked: targeted tests cover submitted mismatch, missing required targets, and cross-change prior preflight currentGate scope.
- Tested with: targeted controlled scheduler contract and handler suites.

## Goal Loop Boundary Coverage

- Goal Loop boundary coverage applicable: yes.
- Persistent Goal/Change scope checked: guard takes the current Change id and rejects prior controlled-step or preflight evidence for a different Change.
- Recommendation authority checked: prior Goal Loop readiness/preflight evidence is used only as a fail-closed pre-execution guard; fresh Goal Loop/controller/preflight evidence is still required after the guard passes.
- Fallback priority checked: guard failure happens before fresh Goal Loop evaluation or concrete scheduler execution.
- Hidden execution / source mutation check: tests prove no concrete scheduler handler or step wrapper is called when the guard rejects.
- ToolPolicyGate / human gate preservation checked: the existing `planning.scheduler.controlled-advance.run` human-confirmed path and downstream concrete gate audit remain unchanged.
- Tested with: targeted handler fail-before-execution test.

## Module Boundary Coverage

- Module boundary coverage applicable: yes.
- Future feature owner module: `src/workflow-scheduler/controlled-step.ts` owns controlled Scheduler request/scope guard semantics; `src/scheduler-runtime/repository.ts` remains evidence lookup owner; `src/workbench/actions/handlers/scheduler.ts` wires the guard.
- Module owners checked: no scheduler-runtime import of workflow-action registry was added.
- Moved responsibilities: none.
- Retained facade responsibilities: Workbench handler remains thin action orchestration around existing handlers.
- Forbidden write-back locations: no main logic added to frontend, read model, manager facade, or server route shell.
- Compatibility surface: existing action ids, request payload shape, Workbench JSON, and scheduler evidence artifacts remain compatible.
- Boundary tests or lint checks: targeted contract and handler tests plus lint/typecheck.

## Core Mechanism Reuse Coverage

- Core mechanism reuse / architecture growth control coverage applicable: yes.
- Existing mechanisms reused or strengthened: `SchedulerControlledStepEvidence`, `controlledLoopContinuationReadiness`, `GoalLoopGateReadinessPreflight`, `validateWorkflowActionRequiredTargets`, `workflowActionScopesMatchStrict`, existing Workbench scheduler action handler, and existing human-gated controlled advance path.
- New cross-cutting mechanism and owner: none; this is a narrow composition guard over existing mechanisms.
- Domain-specific logic location: controlled Scheduler wrapper/concrete gate semantics stay in `workflow-scheduler/controlled-step.ts`.
- Shared cross-cutting logic location: target validation and strict scope matching stay in `workflow-actions/registry.ts`; evidence read/write stays in scheduler-runtime and Goal Loop repositories.
- Local framework / state machine / projection / validation / gate avoided: no local action registry, preflight framework, projection system, alternate ToolPolicy gate, or new artifact family was introduced.
- Public API / facade / Workbench compatibility result: compatible; no new Workbench action, button, or request field.
- Future-cost reduction result: future controlled-loop continuations can reuse the guard instead of adding handler-local stale-target checks.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- Handoff files checked: `AGENTS.md`, `docs/STATUS.md`, `docs/CURRENT-DEVELOPMENT-PLAN.md`, active change summary/spec/plan/tasks/review.
- Stale active-path / phase grep: before close, `AGENTS.md` and `docs/STATUS.md` intentionally point to the active path; after close they must point to the archive path and no longer reference `harness/changes/active/controlled-scheduler-continuation-guard`.
- Latest archive / active path alignment: pending final close command.
- Pending evolution state checked: no pending evolution before close; `harness-evolve check` reported 4 archived changes since last completion with threshold 5.

## Remote Handoff Acceptance Coverage

- Remote handoff coverage applicable: no.
- If not applicable, reason: change does not affect Draft PR creation/update, PR feedback refresh, provider capability detection, remote checks/reviews, or remote handoff evidence.
