# Review: main-agent-a2a-native-interaction-alignment-v3

Status: approved.

## Findings

No blocking findings.

Residual risk: this slice is a code/test alignment pass. It improves the native
Plan Mode path, child-agent transcript scoping, and visible workspace cleanup,
but it does not claim a fresh real-browser app-server streaming acceptance run.
If runtime Plan Mode behavior regresses outside unit coverage, handle it in a
separate real UI acceptance/fix pass.

## Verification

- Selected verification scope: targeted A2A/Plan Mode boundaries plus aggregate fast/build checks.
- Targeted:
  - `npx vitest run tests/unit/workbench-agent-task-domain.test.ts tests/unit/agent-profiles.test.ts tests/unit/workbench-module-boundaries.test.ts tests/unit/web-app.test.tsx tests/unit/workbench-read-model.test.ts tests/unit/codex.test.ts` - passed.
- Standard:
  - `npm run typecheck` - passed.
  - `npm run lint` - passed.
  - `npm run test:fast` - passed.
  - `npm run build` - passed.
  - `npm run test:workbench` - passed.
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` - passed.
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` - passed.
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` - passed.
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` - passed.
- Rationale for selected scope: the implementation changed role delegation
  validation, planning-agent prompt/profile text, Codex bridge event mapping,
  and Agent workspace rendering. These suites cover those owners and the
  broader fast regression surface.
- If an aggregate Workbench / slow suite exceeded the tool window: not applicable.

## Complexity Deletion Review

- Complexity deletion review applicable: yes for product/code/Harness-template/rule changes; docs-only wording changes may mark this not applicable.
- delete: removed the old role delegation assumption that `conversationId`
  must equal `changeId`, and removed the form-like evidence strip from the
  planning Agent workspace.
- reuse: reused existing Codex Plan Mode bridge, planning action owner,
  planning-agent workspace, transcript/composer surface, and
  `planning.confirm-execution` revalidation.
- yagni: avoided a new planning questionnaire engine, new action type, new
  controller, new automation allowlist entry, and a second workflow truth.
- shrink: kept `<proposed_plan>` as fallback behavior instead of expanding it
  into the native Plan Mode path.
- net: smaller coupling between conversation identity and Harness workflow
  identity, with no authority expansion.
- Note: this is supplemental and does not replace correctness, security, source safety, validation/audit, stale-target, ToolPolicyGate, human-gate, or required coverage checks.

## Acceptance Feedback

- Real/manual acceptance performed: no.
- Real Codex acceptance claimed: no.
- If real Codex acceptance is claimed, fake Codex / mocked PATH / fixture result / hand-written artifact exclusion evidence: not applicable.
- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable. If real/self acceptance uses a managed source project, record source root, runtime home, whether same-root evidence is negative-only, and before/after `git status --short`.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: real browser app-server
  acceptance can be run as a separate acceptance pass; this review does not
  count `codex exec` replay or static templates as live Plan Mode acceptance.

## Documentation Entropy Coverage

- Documentation entropy coverage applicable: yes.
- If applicable, documents checked: `AGENTS.md`, `docs/STATUS.md`, this active change.
- If applicable, before/after line counts: not recorded; edits are handoff pointer updates only.
- If applicable, duplicate current-state fields checked: active handoff pointers aligned to the same change id/path.
- If applicable, roadmap/current-direction stale language checked: no roadmap expansion added.
- If applicable, archive-ledger content promoted / retained / merged / retired / archive-only: archive history unchanged.
- If applicable, over-budget documents and rationale: not applicable.
- If applicable, tested with: `scripts/lint-ecl.ps1` - passed.
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
- If applicable, sampled surface: planning-agent workspace and main transcript projection.
- If applicable, visible primary UI backed by implemented workflow paths:
  planning-agent composer continues to use existing `planning.revise` and
  `planning.confirm-execution` paths.
- If applicable, authoritative primary-surface alignment checked across confirmation queue / decision inspector / visible primary card: confirmation queue authority unchanged.
- If applicable, stale-history override and running/archived selected-demand suppression checked: not changed.
- If applicable, out-of-scope future capability check: no raw Scheduler, apply, close, remote, PR, merge, or Harness evolution expansion.
- If applicable, forbidden visible internal terms/actions checked: prompt/profile and workspace tests cover reduced internal leakage.
- If applicable, duplicate primary action / in-flight suppression check: not changed.
- If applicable, high-impact action path result: implementation intent still reaches existing `planning.confirm-execution` revalidation only.
- If applicable, real App DOM / browser UI verification result when the behavior is product-visible: not claimed in this slice.
- If applicable, projection/unit evidence that supplements but does not replace visible-surface acceptance: targeted `web-app`, read-model, module-boundary, Codex, and agent-domain tests passed.
- If applicable, tested with: targeted Vitest suite and aggregate `test:fast`.
- If not applicable, reason: not applicable.

## Reference-Driven UI / Product Source Evidence Coverage

- Reference-driven UI/product coverage applicable: yes.
- If applicable, reference map section inspected: Codex app-server native interaction and cc-gui plan/user-input behavior from existing local reference evidence.
- If applicable, reference source files or inspected commit used:
  `reference-projects/openai-codex/codex-rs/app-server/README.md`,
  `reference-projects/openai-codex/codex-rs/collaboration-mode-templates/templates/plan.md`,
  and local `desktop-cc-gui` plan/user-input specs already used for the preceding alignment window.
- If applicable, controls copied / adapted / intentionally omitted:
  adapted native Plan Mode event ownership and runtime user-input semantics;
  intentionally omitted any reference runtime authority or provider permission model.
- If applicable, fake-control check: no new UI control, action type, or allowlist entry was added.
- If applicable, tested with: prompt/profile, Codex bridge, workspace, and boundary tests.
- If not applicable, reason: not applicable.

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

- Runtime bridge boundary coverage applicable: yes.
- If applicable, checked boundary: Codex plan deltas are scoped as process/status events for child Agent surfaces instead of ordinary assistant prose.
- If applicable, tested with: `tests/unit/codex.test.ts`, `tests/unit/workbench-module-boundaries.test.ts`, `tests/unit/web-app.test.tsx`.
- If not applicable, reason: not applicable.

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
- If applicable, module owners checked: agent-task delegation, Workbench planning handler, Codex chat bridge, frontend Agent workspace.
- If applicable, moved responsibilities: none; old owners retained.
- If applicable, retained facade responsibilities: `planning.confirm-execution` remains the implementation entry point for plan execution intent.
- If applicable, forbidden write-back locations: no new Harness truth, confirmationQueue, ToolPolicy, Scheduler, IntegrationCheck, apply/close, remote/PR/merge, or automation allowlist writes.
- If applicable, compatibility surface: existing planning actions retained.
- If applicable, behavior path tested: role delegation, planning profile/prompt, Codex plan event scoping, Agent workspace rendering.
- If applicable, follow-up split candidates: real browser app-server acceptance if needed.
- If applicable, boundary tests or lint checks: `workbench-module-boundaries`, targeted unit tests, ECL/encoding lint.
- If applicable, compatibility result: existing Harness execution boundaries unchanged.
- If applicable, tested with: targeted Vitest suite plus `test:fast`.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Coverage

- Core mechanism reuse / architecture growth control coverage applicable: yes.
- If applicable, existing mechanisms reused or strengthened: Codex app-server Plan Mode, existing planning handlers, existing Agent workspace, existing confirm-execution validation.
- If applicable, new cross-cutting mechanism and owner: none.
- If applicable, why existing mechanisms were insufficient: not applicable; existing mechanisms were enough.
- If applicable, domain-specific logic location: planning handler/profile and Agent workspace only.
- If applicable, shared cross-cutting logic location: none added.
- If applicable, local framework / state machine / projection / validation / gate avoided: avoided a custom questionnaire engine and a second planning runtime.
- If applicable, public API / facade / Workbench compatibility result: existing planning actions retained.
- If applicable, future-cost reduction result: less coupling between chat identity and Harness Change identity.
- If applicable, tested with: targeted Vitest suite plus aggregate checks.
- If not applicable, reason: not applicable.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- If applicable, handoff files checked: `AGENTS.md`, `docs/STATUS.md`, active change files.
- If applicable, stale active-path / phase grep: active path aligned before close; archive pointer to be finalized after close.
- If applicable, latest archive / active path alignment: active path aligned.
- If applicable, pending evolution state checked: pending evolution remains none.
- If not applicable, reason: not applicable.

## Remote Handoff Acceptance Coverage

- Remote handoff coverage applicable: no.
- If applicable, checked provider/repository/action boundary: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect Draft PR creation/update, PR feedback refresh, provider capability detection, remote checks/reviews, or remote handoff evidence.

