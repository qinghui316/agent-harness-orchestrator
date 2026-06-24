# Review: goal-driven-controlled-continuation-runtime-v1

Status: completed; ready to close.

## Findings

No blocking code findings from targeted implementation review.

Closeout issue found and fixed:

- Real browser UI smoke found the continuation action was present but could be
  ordered behind stale primary decision context. The fix promotes the selected
  current Scheduler next-action gate when its action is wrapped by
  `planning.goal-loop.controlled-continue.run`, and limits that promotion to
  `planning.scheduler.*` next actions so landing/PR/remote/apply/close priority
  is not disturbed.

## Verification

Completed.

- Selected verification scope: action contract, server revalidation, Goal Loop runtime orchestration, Workbench projection, DOM payload, module boundaries, fast suite, split Workbench aggregate constituents, build, and Harness checks.
- Full / aggregate suites run or skipped: `npm run test:workbench` passed after the projection-priority fix. An earlier attempt failed in `workbench-remote-landing-flow` because the first projection-priority fix was too broad; the targeted fix and rerun passed.
- Rationale for selected scope: this change adds a new Workbench action and bounded runtime wrapper around existing controlled Scheduler gates, so verification focused on target ids, revalidation, child audit scope, projection honesty, DOM execution payload, and existing Workbench slow paths affected by the new continuation wrapper.
- Aggregate timeout record: superseded by the successful `npm run test:workbench` rerun.

Commands passed:

- `npx vitest run tests/unit/goal-loop-runtime.test.ts tests/unit/workflow-actions.test.ts tests/unit/web-workflow-actions.test.ts tests/unit/action-revalidation.test.ts tests/unit/workbench-goal-loop-surface.test.ts tests/unit/web-app.test.tsx`
- `npx vitest run tests/unit/web-app.test.tsx`
- `npx vitest run tests/unit/workbench-module-boundaries.test.ts tests/unit/goal-loop-runtime.test.ts tests/unit/workbench-goal-loop-surface.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm run test:fast`
- `npm run build`
- `npm run test:workbench`
- `npx vitest run tests/unit/workbench-goal-loop-surface.test.ts tests/slow/workbench-remote-landing-flow.test.ts`
- `npm run test:workbench:unit`
- `npm run test:workbench:slow:scheduler`
- `npx vitest run tests/slow/workbench-demand-to-execution-golden-flow.test.ts`
- `npx vitest run tests/slow/workbench-remote-landing-flow.test.ts`
- `npx vitest run tests/slow/workbench-maintenance-flow.test.ts`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`

## Acceptance Feedback

- Real/manual acceptance performed: yes.
- Real Codex acceptance claimed: no.
- If real Codex acceptance is claimed, fake Codex / mocked PATH / fixture result / hand-written artifact exclusion evidence: not applicable.
- Manual config edits: none.
- Extra prompts or reviewer instructions: none.
- Retries or environment failures: initial browser connection had no active tab; reconnecting and opening `http://127.0.0.1:4331/` succeeded.
- Screenshots / artifacts / run ids: browser DOM evidence and API snapshot saved at `C:\aho-accept\continue-v1\snapshot-after-continuation.json`; runtime run `goal-loop-runtime-run-20260624024539-deaaef5d`.
- External source/state safety: external sandbox source `C:\aho-accept\continue-v1\src`; runtime home `C:\aho-accept\continue-v1\home`; `git -C C:\aho-accept\continue-v1\src status --short` returned clean after the smoke.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: the projection-priority gap described above was fixed in this change and covered by a regression test plus full Workbench aggregate verification.

## Documentation Entropy Coverage

- Documentation entropy coverage applicable: yes.
- If applicable, documents checked: `AGENTS.md`, `docs/STATUS.md`, active change files, and `harness/changes/INDEX.json`.
- If applicable, before/after line counts: not recorded for this active implementation pass.
- If applicable, duplicate current-state fields checked: active change remains one current state; no pending evolution.
- If applicable, roadmap/current-direction stale language checked: no full-auto current-capability wording added.
- If applicable, archive-ledger content promoted / retained / merged / retired / archive-only: retained as active change context only; no archive closeout yet.
- If applicable, over-budget documents and rationale: not applicable.
- If applicable, tested with: `lint-ecl`, `lint-encoding`, `harness-change reindex`, `harness-change status`, `harness-evolve check`.
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

- Workbench / GUI read-model projection coverage applicable: yes.
- If applicable, checked scope: confirmation queue Goal Loop attachment transforms only a fresh matching controlled Scheduler gate into one bounded continuation primary gate, preserves concrete target ids, promotes the current Scheduler gate over stale selected-demand decision context, and does not promote ordinary planning gates over landing/PR/remote gates.
- If applicable, tested with: `tests/unit/workbench-goal-loop-surface.test.ts`, `tests/unit/web-app.test.tsx`, `tests/slow/workbench-remote-landing-flow.test.ts`, and `npm run test:workbench`.
- If not applicable, reason: not applicable.

## Workbench User-Surface Honesty Coverage

- Workbench user-surface honesty coverage applicable: yes.
- If applicable, sampled surface: confirmation queue and DecisionInspector primary action for bounded continuation.
- If applicable, visible primary UI backed by implemented workflow paths: yes, `planning.goal-loop.controlled-continue.run` is registered, server-forwarded, revalidated, high-impact audited, and handled by Workbench action service.
- If applicable, authoritative primary-surface alignment checked across confirmation queue / decision inspector / visible primary card: DOM test covers DecisionInspector action payload; read-model test covers confirmation queue; real browser smoke confirmed one visible bounded continuation gate and final stop at the next real gate.
- If applicable, stale-history override and running/archived selected-demand suppression checked: not separately changed in this slice.
- If applicable, out-of-scope future capability check: UI copy avoids full-auto, parallel executor, merge queue, slot allocator language.
- If applicable, forbidden visible internal terms/actions checked: continuation copy is bounded continuation wording; no future automation buttons added.
- If applicable, duplicate primary action / in-flight suppression check: top-level in-flight guard remains in Workbench action service; child dispatch intentionally bypasses only the top-level service recursion.
- If applicable, high-impact action path result: continuation action is high-impact and requires explicit human confirmation once for the bounded run.
- If applicable, real App DOM / browser UI verification result when the behavior is product-visible: passed in external sandbox `C:\aho-accept\continue-v1`, Workbench URL `http://127.0.0.1:4331/`.
- If applicable, projection/unit evidence that supplements but does not replace visible-surface acceptance: `workbench-goal-loop-surface`, `web-app`, remote landing, and full Workbench aggregate tests pass.
- If applicable, tested with: targeted unit/DOM suites and split Workbench suites.
- If not applicable, reason: not applicable.

## Scoped Workbench Action Payload Coverage

- Scoped Workbench action payload coverage applicable: yes.
- If applicable, checked target ids: `changeId`, `goalLoopNextStepPacketId`, `goalLoopControllerPolicyId`, `goalLoopGateReadinessPreflightId`, `goalLoopCurrentGateActionType`, scheduler target ids, and `maxSteps`.
- If applicable, tested action path: workflow action registry, web payload mapping, server forwarding, server revalidation, high-impact boundary, and handler integration.
- If applicable, duplicate action/evidence affordance and in-flight duplicate submission check: continuation is a live workflow action and remains subject to the top-level in-flight guard; child steps use an internal dispatcher with explicit runtime audit scope.
- If not applicable, reason: not applicable.

## Transcript Renderer Source-Boundary Coverage

- Transcript renderer source-boundary coverage applicable: no.
- If applicable, canonical transcript projection checked: not applicable.
- If applicable, assistant markdown source checked: not applicable.
- If applicable, process/tool row compactness checked: not applicable.
- If applicable, derived workflow summary exclusion checked: not applicable.
- If applicable, worker/role transcript scoping checked: not applicable.
- If applicable, private chain-of-thought exclusion checked: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect the default Workbench main conversation transcript or parent-agent transcript projection.

## Source Apply Safety Coverage

- Source apply safety coverage applicable: no.
- If applicable, checked source project / fixture: not applicable.
- If applicable, checked runtime home / external managed-project isolation: not applicable.
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
- If applicable, persistent Goal/Change scope checked: continuation payload and server revalidation are change-scoped.
- If applicable, recommendation authority checked: packet/controller/preflight remain evidence used to attach to an existing controlled Scheduler gate; they do not create arbitrary workflow truth.
- If applicable, fallback priority checked: unsupported, stale, missing, forged, or cross-change targets fail closed in required-target validation/revalidation/current-gate resolution.
- If applicable, packet / main-Agent context freshness checked: projection and revalidation require matching packet, controller, preflight, and concrete current gate.
- If applicable, stale or superseded packet suppression checked: stale preflight/target mismatch test fails closed.
- If applicable, feedback selected Change / packet lineage / visible gate scope checked: current gate helper resolves from selected Workpad projection and change id.
- If applicable, feedback remains user evidence, not hidden instruction / arbitrary chat scrape / execution approval: not applicable to feedback; continuation requires explicit workflow action confirmation.
- If applicable, feedback-triggered re-evaluation remains non-executing and primary Harness gate stays separate: existing Goal Loop evaluate/feedback actions remain separate; continuation only wraps controlled Scheduler gates.
- If applicable, hidden execution / source mutation check: runtime stops before unsupported/high-impact terminal gates and does not apply/close/merge automatically.
- If applicable, ToolPolicyGate / human gate preservation checked: child steps record runtime authorization ids while using existing high-impact audit and controlled Scheduler handler.
- If applicable, tested with: goal-loop runtime, workflow-actions, action-revalidation, workbench-goal-loop-surface, and Workbench split suites.
- If not applicable, reason: not applicable.

## Module Boundary Coverage

- Module boundary coverage applicable: yes.
- Future feature owner module: `src/goal-loop-runtime/` owns runtime authorization/run/iteration records and loop orchestration.
- If applicable, module owners checked: Workbench action handler owns UI action integration; read-model owns projection attachment; server action revalidation owns stale target checks; workflow-actions registry owns action contract.
- If applicable, moved responsibilities: child orchestration moved into `src/goal-loop-runtime/`; current visible gate resolution lives in Workbench action helper rather than importing projection code from the runtime handler.
- If applicable, retained facade responsibilities: top-level Workbench action service remains the human-confirmed authorization/in-flight boundary.
- If applicable, forbidden write-back locations: no broad facade became the runtime owner; no workflow truth was written into UI state.
- If applicable, compatibility surface: existing controlled Scheduler handler remains the child execution path.
- If applicable, behavior path tested: targeted runtime/action/projection/DOM tests and Workbench split suites.
- If applicable, follow-up split candidates: real browser smoke may expose UI ergonomics follow-up.
- If applicable, boundary tests or lint checks: `tests/unit/workbench-module-boundaries.test.ts` passed.
- If applicable, compatibility result: existing scheduler slow and Workbench split suites pass after fixture updates.
- If applicable, tested with: targeted module-boundary suite and split Workbench suites.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Coverage

- Core mechanism reuse / architecture growth control coverage applicable: yes.
- If applicable, existing mechanisms reused or strengthened: existing `planning.scheduler.controlled-advance.run`, action registry, required-target validation, server revalidation, high-impact audit, ToolPolicy evidence, Workbench projection, and in-flight guard.
- If applicable, new cross-cutting mechanism and owner: `src/goal-loop-runtime/` for bounded runtime authorization and iteration evidence.
- If applicable, why existing mechanisms were insufficient: one-step controlled advance required a repeated human click for every scheduler gate; V1 needed a bounded runtime record and child-step audit linkage without promoting Goal Loop evidence to authority.
- If applicable, domain-specific logic location: supported controlled Scheduler gate selection remains in Workbench action/projection helpers.
- If applicable, shared cross-cutting logic location: action contracts and scope checks remain in `src/workflow-actions/registry.ts` and server revalidation.
- If applicable, local framework / state machine / projection / validation / gate avoided: no new scheduler loop, full-auto planner, parallel executor, or fake automation layer was added.
- If applicable, public API / facade / Workbench compatibility result: Workbench action payload extends existing workflow action shape with `maxSteps` and Goal Loop ids.
- If applicable, future-cost reduction result: future bounded continuation can reuse runtime authorization/run/iteration records without weakening existing gates.
- If applicable, tested with: targeted and split Workbench suites listed in Verification.
- If not applicable, reason: not applicable.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- If applicable, handoff files checked: `AGENTS.md`, `docs/STATUS.md`, `docs/CURRENT-DEVELOPMENT-PLAN.md`, and active change files.
- If applicable, stale active-path / phase grep: checked for stale `harness/changes/active/goal-driven-controlled-continuation-runtime-v1` wording after close; handoff docs no longer point at the closed active path.
- If applicable, latest archive / active path alignment: handoff docs point at `harness/changes/archive/20260624-goal-driven-controlled-continuation-runtime-v1/summary.md` and report no active change.
- If applicable, pending evolution state checked: no pending Harness evolution.
- If not applicable, reason: not applicable.

## Remote Handoff Acceptance Coverage

- Remote handoff coverage applicable: no.
- If applicable, checked provider/repository/action boundary: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect Draft PR creation/update, PR feedback refresh, provider capability detection, remote checks/reviews, or remote handoff evidence.

