# Review: workbench-confirmation-feedback-to-rework-v1

Status: ready.

## Findings

No blocking findings.

- The implementation reuses existing `planning.revise` and `result.refresh-rework`; it does not add a feedback runtime or second permission system.
- Feedback is revalidated against the current primary confirmation action before it can route to revise/rework.
- Legacy proposal feedback remains record-only, preserving the old "requested changes without accept" path.

## Verification

- Selected verification scope: feedback routing, Workbench read-model, DOM surface, action revalidation, type/lint/fast/build, and Workbench aggregate unit gate.
- Full / aggregate suites run or skipped: `npm run test:workbench` passed. Slow/release suites skipped because this change does not touch scheduler/apply runtime, real Codex execution, remote handoff, or release packaging.
- Rationale for selected scope: the behavior is a scoped server/UI routing path from current primary gate feedback to existing revise/rework handlers. Pure route tests plus DOM/read-model/action-revalidation and Workbench aggregate coverage exercise the changed boundary without running a full Codex acceptance.
- If an aggregate Workbench / slow suite exceeded the tool window: record timeout, split suite members run, pass/fail status, and whether the timeout is product failure or verification runtime-cost debt.

## Complexity Deletion Review

- Complexity deletion review applicable: yes for product/code/Harness-template/rule changes; docs-only wording changes may mark this not applicable.
- delete: removed the duplicate local feedback-route implementation from `actions.ts` after extracting the pure helper.
- reuse: `confirmationQueue.primary`, existing inline feedback UI, server action path, `planning.revise`, `result.refresh-rework`, Workbench decision ledger, and current target ids.
- yagni: avoided a feedback runtime, second permission system, new projection framework, new evidence family, and running-turn steer/interrupt redesign.
- shrink: kept routing to one thin helper plus existing handlers instead of adding a new workflow/state machine.
- net: Lean already.
- Note: this is supplemental and does not replace correctness, security, source safety, validation/audit, stale-target, ToolPolicyGate, human-gate, or required coverage checks.

## Acceptance Feedback

- Real/manual acceptance performed: no.
- Real Codex acceptance claimed: no.
- If real Codex acceptance is claimed, fake Codex / mocked PATH / fixture result / hand-written artifact exclusion evidence: not applicable.
- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: user scoped this to confirmation-point feedback, not running-turn interrupt/steer.
- Retries or environment failures: none.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable. If real/self acceptance uses a managed source project, record source root, runtime home, whether same-root evidence is negative-only, and before/after `git status --short`.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy Coverage

- Documentation entropy coverage applicable: no. Change to `yes` when this change updates `AGENTS.md`, `docs/STATUS.md`, Harness rules/templates, auto-evolve evidence, or other current-state / handoff documents.
- If applicable, documents checked: not applicable.
- If applicable, before/after line counts: not applicable.
- If applicable, duplicate current-state fields checked: not applicable.
- If applicable, roadmap/current-direction stale language checked: not applicable.
- If applicable, archive-ledger content promoted / retained / merged / retired / archive-only: not applicable.
- If applicable, over-budget documents and rationale: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not alter docs, handoff files, current-state wording, Harness rules/templates, or auto-evolve evidence.

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
- If applicable, checked scope: planning confirmation primary carries `planningBundleId` and feedback action; result/apply surface carries feedback action with `worktreeId`.
- If applicable, tested with: `tests/unit/workbench-read-model.test.ts`, `tests/unit/web-app.test.tsx`, `npm run test:workbench`.
- If not applicable, reason: not applicable.

## Workbench User-Surface Honesty Coverage

- Workbench user-surface honesty coverage applicable: yes.
- If applicable, sampled surface: planning confirmation card and result/apply decision card.
- If applicable, visible primary UI backed by implemented workflow paths: yes; planning feedback routes to `planning.revise`, result feedback routes to `result.refresh-rework`.
- If applicable, authoritative primary-surface alignment checked across confirmation queue / decision inspector / visible primary card: yes via read-model and DOM suites.
- If applicable, stale-history override and running/archived selected-demand suppression checked: unchanged; Workbench aggregate remained green.
- If applicable, out-of-scope future capability check: no new full-auto, scheduler, remote, merge, or Harness evolution affordance added.
- If applicable, forbidden visible internal terms/actions checked: no new internal runtime terms added to primary UI.
- If applicable, duplicate primary action / in-flight suppression check: unchanged; no new primary confirmation path added.
- If applicable, high-impact action path result: feedback is not approval and does not apply/close/remote.
- If applicable, real App DOM / browser UI verification result when the behavior is product-visible: DOM verification passed; real browser/Codex acceptance not claimed.
- If applicable, projection/unit evidence that supplements but does not replace visible-surface acceptance: `tests/unit/web-app.test.tsx`, `tests/unit/workbench-read-model.test.ts`.
- If applicable, tested with: targeted DOM/read-model suites and `npm run test:workbench`.
- If not applicable, reason: not applicable.

## Scoped Workbench Action Payload Coverage

- Scoped Workbench action payload coverage applicable: yes.
- If applicable, checked target ids: `changeId`, `actionId`, `actionKind`, `planningBundleId`, `worktreeId`, `runId`, and artifact context.
- If applicable, tested action path: server feedback route plus UI payload construction.
- If applicable, duplicate action/evidence affordance and in-flight duplicate submission check: unchanged; no new primary duplicate submission path.
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

- Source apply safety coverage applicable: yes.
- If applicable, checked source project / fixture: unit fixtures only; no source root apply performed.
- If applicable, checked runtime home / external managed-project isolation: not applicable; no real managed source acceptance claimed.
- If applicable, checked worktree ids / result ids / integration check ids: result feedback requires current `worktreeId`/result target and routes only to `result.refresh-rework`.
- If applicable, source-root mutation gate checked: feedback never calls apply/close; result feedback routes to bounded rework.
- If applicable, out-of-scope source mutation check: automatic apply/close/remote/Harness evolution are not routed by feedback.
- If applicable, tested with: `tests/unit/workbench-feedback-surface.test.ts`, `tests/unit/workbench-read-model.test.ts`, `tests/unit/web-app.test.tsx`, `npm run test:workbench`.
- If not applicable, reason: not applicable.

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
- Future feature owner module: `src/server/workbench/feedback-routing.ts` as thin server-side route helper.
- If applicable, module owners checked: server action service reads snapshot/records decision/dispatches; route helper only decides revise/rework/record-only; existing handler owners perform planning/rework.
- If applicable, moved responsibilities: extracted route decision from `actions.ts` to a pure helper for testability.
- If applicable, retained facade responsibilities: `actions.ts` remains the HTTP/action coordinator and does not become feedback runtime.
- If applicable, forbidden write-back locations: no writes to source root, canonical plan artifacts, apply/close, remote, or Harness evolution from feedback.
- If applicable, compatibility surface: legacy approval feedback remains record-only.
- If applicable, behavior path tested: planning feedback route, result feedback route, stale/cross-change failure, legacy proposal feedback.
- If applicable, follow-up split candidates: none.
- If applicable, boundary tests or lint checks: targeted tests, typecheck, lint.
- If applicable, compatibility result: passed.
- If applicable, tested with: `tests/unit/workbench-feedback-surface.test.ts`, `npm run test:fast`, `npm run test:workbench`.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Coverage

- Core mechanism reuse / architecture growth control coverage applicable: yes.
- If applicable, existing mechanisms reused or strengthened: confirmation queue, inline feedback, Workbench decision ledger, `planning.revise`, `result.refresh-rework`, current target context.
- If applicable, new cross-cutting mechanism and owner: none; only a thin helper for route selection.
- If applicable, why existing mechanisms were insufficient: existing server feedback path only recorded requested changes and did not route the two accepted V1 confirmation loops.
- If applicable, domain-specific logic location: feedback route selection in server Workbench owner.
- If applicable, shared cross-cutting logic location: target ids remain in existing read-model/action payload types.
- If applicable, local framework / state machine / projection / validation / gate avoided: yes.
- If applicable, public API / facade / Workbench compatibility result: existing action endpoint remains compatible.
- If applicable, future-cost reduction result: feedback route decisions are pure-testable and do not require real Codex to verify stale/target behavior.
- If applicable, tested with: targeted tests and aggregate checks.
- If not applicable, reason: not applicable.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- If applicable, handoff files checked: `AGENTS.md`, `docs/STATUS.md`, `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- If applicable, stale active-path / phase grep: checked via ECL lint after handoff updates.
- If applicable, latest archive / active path alignment: active path points to `harness/changes/active/workbench-confirmation-feedback-to-rework-v1/summary.md`; archive pointer to be generated by close.
- If applicable, pending evolution state checked: `harness-evolve check` reported no pending evolution and 3 archived changes since last completion.
- If not applicable, reason: not applicable.

## Remote Handoff Acceptance Coverage

- Remote handoff coverage applicable: no.
- If applicable, checked provider/repository/action boundary: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect Draft PR creation/update, PR feedback refresh, provider capability detection, remote checks/reviews, or remote handoff evidence.

