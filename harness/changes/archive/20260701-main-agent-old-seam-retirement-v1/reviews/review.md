# Review: main-agent-old-seam-retirement-v1

Status: approved.

## Findings

No blocking findings.

- `role.pipeline.*` remains a live compatibility API/action id surface and was
  not renamed.
- `rolePipeline` remains a live Workbench read-model and safety/projection
  field and was not removed.
- `MainAgentLoopProjection` remains a non-executing Goal Loop parity seam and
  was not removed or exposed to confirmation / transcript UI.
- Dead entrypoint names stay covered by negative boundary tests:
  `runCodeValidateAuditSequence`, `runTaskQueueSequence`, and
  `task-queue-runner`.

## Verification

- Selected verification scope: targeted Workbench/read-model/action/boundary
  suites plus standard typecheck/lint/test:fast/build and Harness checks.
- Full / aggregate suites run or skipped: full `npm run test` skipped because
  this change is a narrow label/boundary cleanup with no runtime authority,
  scheduler, apply, or persistence behavior change.
- Rationale for selected scope: touched Workbench labels, action-result labels,
  and module-boundary tests; targeted suites cover the affected surfaces and
  retained safety seams.
- Initial targeted command had one transient `web-app` overlay lookup failure;
  the single test and the full targeted command both passed immediately after.

Passed:

- `npx vitest run tests/unit/workbench-module-boundaries.test.ts tests/unit/web-app.test.tsx tests/unit/workbench-read-model.test.ts tests/unit/orchestration-engine.test.ts tests/unit/workflow-actions.test.ts tests/unit/action-revalidation.test.ts`
- `npx vitest run tests/unit/web-app.test.tsx --testNamePattern "keeps the Agent orchestration map usable while the confirmation rail is collapsed"`
- `npm run typecheck`
- `npm run lint`
- `npm run test:fast`
- `npm run build`
- If an aggregate Workbench / slow suite exceeded the tool window: record timeout, split suite members run, pass/fail status, and whether the timeout is product failure or verification runtime-cost debt.

## Complexity Deletion Review

- Complexity deletion review applicable: yes for product/code/Harness-template/rule changes; docs-only wording changes may mark this not applicable.
- delete: none.
- reuse: existing action ids, Workpad read-model fields, Goal Loop projection,
  and main-agent orchestration owners retained.
- yagni: avoided deleting or renaming live compatibility / boundary seams.
- shrink: changed only visible labels and boundary assertions.
- net: Lean already.
- Note: this is supplemental and does not replace correctness, security, source safety, validation/audit, stale-target, ToolPolicyGate, human-gate, or required coverage checks.

## Acceptance Feedback

- Real/manual acceptance performed: no.
- Real Codex acceptance claimed: no.
- If real Codex acceptance is claimed, fake Codex / mocked PATH / fixture result / hand-written artifact exclusion evidence: not applicable.
- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: subagent Beauvoir review required
  inventory-backed cleanup instead of deleting live seams; implemented that
  safer scope.
- Retries or environment failures: first full targeted Vitest run had one
  transient `web-app` overlay lookup failure; immediate single-test and full
  targeted reruns passed.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable. If real/self acceptance uses a managed source project, record source root, runtime home, whether same-root evidence is negative-only, and before/after `git status --short`.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy Coverage

- Documentation entropy coverage applicable: yes.
- If applicable, documents checked: `AGENTS.md`, `docs/STATUS.md`, active change
  summary/spec/plan/tasks/review.
- If applicable, before/after line counts: not recorded; no broad handoff
  expansion intended.
- If applicable, duplicate current-state fields checked: active change pointer
  only.
- If applicable, roadmap/current-direction stale language checked: yes; V1 is
  inventory-backed cleanup, not a new migration phase.
- If applicable, archive-ledger content promoted / retained / merged / retired / archive-only: archive history retained; current surface wording retired.
- If applicable, over-budget documents and rationale: not applicable.
- If applicable, tested with: Harness checks pending closeout.
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

## Workbench User-Surface Honesty Coverage

- Workbench user-surface honesty coverage applicable: yes.
- Product-visible Workbench controls are applicable unless the review records why they cannot affect user decisions; do not mark this section not applicable only because the control does not change the authoritative primary decision surface.
- If applicable, sampled surface: action label and Workpad role execution
  section label.
- If applicable, visible primary UI backed by implemented workflow paths:
  `role.pipeline.*` still routes to existing main-agent orchestration handlers.
- If applicable, authoritative primary-surface alignment checked across confirmation queue / decision inspector / visible primary card: retained `rolePipeline` and confirmation suppression paths.
- If applicable, stale-history override and running/archived selected-demand suppression checked: not applicable.
- If applicable, out-of-scope future capability check: not applicable.
- If applicable, forbidden visible internal terms/actions checked: yes; exact
  direct label `角色流水线` removed from action label and Workpad header.
- If applicable, duplicate primary action / in-flight suppression check: not applicable.
- If applicable, high-impact action path result: not applicable.
- If applicable, real App DOM / browser UI verification result when the behavior is product-visible: not applicable.
- If applicable, projection/unit evidence that supplements but does not replace visible-surface acceptance: not applicable.
- If applicable, tested with: targeted Vitest suites and module boundary test.
- If not applicable, reason: not applicable.

## Reference-Driven UI / Product Source Evidence Coverage

- Reference-driven UI/product coverage applicable: no.
- If applicable, reference map section inspected: not applicable.
- If applicable, reference source files or inspected commit used: not applicable.
- If applicable, controls copied / adapted / intentionally omitted: not applicable.
- If applicable, fake-control check: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not claim alignment with a reference project for product or UI behavior.

## Scoped Workbench Action Payload Coverage

- Scoped Workbench action payload coverage applicable: no.
- If applicable, checked target ids: not applicable.
- If applicable, tested action path: not applicable.
- If applicable, duplicate action/evidence affordance and in-flight duplicate submission check: not applicable.
- If not applicable, reason: change does not add or change Workbench live/server UI actions that depend on explicit target ids.

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
- Future feature owner module: not applicable.
- If applicable, module owners checked: workflow actions, Workbench action
  handlers, confirmation queue projection, Workpad read model, Goal Loop
  projection.
- If applicable, moved responsibilities: none.
- If applicable, retained facade responsibilities: `role.pipeline.*` remains
  compatibility action id surface.
- If applicable, forbidden write-back locations: not applicable; no new writer.
- If applicable, compatibility surface: `role.pipeline.*`, `rolePipeline`, and
  `MainAgentLoopProjection` retained.
- If applicable, behavior path tested: not applicable.
- If applicable, follow-up split candidates: not applicable.
- If applicable, boundary tests or lint checks: `tests/unit/workbench-module-boundaries.test.ts`.
- If applicable, compatibility result: old dead entrypoint names remain absent;
  live seams remain present.
- If applicable, tested with: targeted Vitest suites, typecheck, lint,
  test:fast, build.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Coverage

- Core mechanism reuse / architecture growth control coverage applicable: no.
- If applicable, existing mechanisms reused or strengthened: not applicable.
- If applicable, new cross-cutting mechanism and owner: not applicable.
- If applicable, why existing mechanisms were insufficient: not applicable.
- If applicable, domain-specific logic location: not applicable.
- If applicable, shared cross-cutting logic location: not applicable.
- If applicable, local framework / state machine / projection / validation / gate avoided: not applicable.
- If applicable, public API / facade / Workbench compatibility result: not applicable.
- If applicable, future-cost reduction result: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not add or change a product feature path, artifact family, state transition, projection, validation/safety gate, ledger event, maintenance record, or cross-module protocol.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: no. Change to `yes` when this change alters active phase, product baseline, Harness rules/templates, active/pending state, latest archive, or next recommended work.
- If applicable, handoff files checked: not applicable.
- If applicable, stale active-path / phase grep: not applicable.
- If applicable, latest archive / active path alignment: not applicable.
- If applicable, pending evolution state checked: not applicable.
- If not applicable, reason: change does not alter active phase, product baseline, Harness rules/templates, active/pending state, latest archive, or next recommended track.

## Remote Handoff Acceptance Coverage

- Remote handoff coverage applicable: no.
- If applicable, checked provider/repository/action boundary: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect Draft PR creation/update, PR feedback refresh, provider capability detection, remote checks/reviews, or remote handoff evidence.

