# Review: workbench-integration-apply-outcome-completion-v1

Status: approved.

## Findings

No blocking findings.

- The initial targeted test exposed a real projection gap: after human
  `apply-check.apply`, the authoritative confirmation queue progressed to the
  scheduler/landing path, but `decisionInspector.primary` could remain null.
  The fix is a read-only alignment helper that derives an inspector context
  only from the authoritative selected-Change `confirmationQueue.primary`.
- The helper explicitly excludes fallback-only `planning.goal-loop.evaluate` so
  Goal Loop recommendation evidence does not become a primary decision surface.

## Verification

- Selected verification scope: integration apply/discard, Workbench read-model,
  App DOM, daily Workbench aggregate, and required product checks.
- Full / aggregate suites run or skipped: `npm run test:workbench` ran and
  passed. Slow/release Workbench suites were skipped because this change does
  not alter scheduler execution, Codex runtime, IntegrationFix repair, or real
  source apply mechanics.
- Rationale for selected scope: the change affects Workbench derived surfaces
  after an already accepted integration apply path. Deterministic fixture
  coverage now performs a real patch apply with matching artifact hash, then
  checks outcome reconcile, scheduler completion, landing readiness, and stale
  gate suppression.
- `npx vitest run tests/unit/workbench-read-model.test.ts`: passed.
- `npx vitest run tests/unit/workbench-read-model.test.ts tests/unit/integration-check-apply-discard.test.ts tests/unit/web-app.test.tsx`: passed.
- `npx vitest run tests/unit/integration-check-apply-discard.test.ts tests/unit/workbench-read-model.test.ts`: passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run test:fast`: passed.
- `npm run test:workbench`: passed.
- `npm run build`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status`: passed with close-ready active change and only closeout task remaining.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`: passed; no pending evolution.
- If an aggregate Workbench / slow suite exceeded the tool window: record timeout, split suite members run, pass/fail status, and whether the timeout is product failure or verification runtime-cost debt.

## Complexity Deletion Review

- Complexity deletion review applicable: yes for product/code/Harness-template/rule changes; docs-only wording changes may mark this not applicable.
- delete: none.
- reuse: existing owners used: `applyIntegrationCheck`,
  `reconcileSchedulerIntegrationOutcome`,
  `completeSchedulerRunFromIntegrationOutcome`, landing candidate projection,
  Workbench `confirmationQueue.primary`, and existing controlled scheduler /
  Goal Loop wrappers.
- yagni: avoided a new post-apply workflow runtime, permission system,
  projection framework, evidence family, or raw scheduler automation.
- shrink: used one thin read-model alignment helper instead of adding a
  duplicate decision-inspector source path for landing or scheduler gates.
- net: Lean already.
- Note: this is supplemental and does not replace correctness, security, source safety, validation/audit, stale-target, ToolPolicyGate, human-gate, or required coverage checks.

## Acceptance Feedback

- Real/manual acceptance performed: no new browser rerun for this change.
- Real Codex acceptance claimed: no.
- If real Codex acceptance is claimed, fake Codex / mocked PATH / fixture result / hand-written artifact exclusion evidence: not applicable.
- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: deterministic fixture writes a real
  `combined.patch` and applies it through `apply-check.apply`; previous real UI
  acceptance for repaired integration apply is archived at
  `harness/changes/archive/20260626-workbench-repaired-integration-apply-real-ui-acceptance-v1/summary.md`.
- External source/state safety: deterministic fixture source root. Source
  mutation occurs only after allowlisted `apply-check.apply`; stale artifact
  hash and source HEAD drift fail closed before mutation.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none.

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
- If applicable, checked scope: selected Change post-integration-apply
  projection from `confirmationQueue.primary` into `decisionInspector.primary`.
- If applicable, tested with:
  `npx vitest run tests/unit/workbench-read-model.test.ts` and
  `npm run test:workbench`.
- If not applicable, reason: not applicable.

## Workbench User-Surface Honesty Coverage

- Workbench user-surface honesty coverage applicable: yes.
- If applicable, sampled surface: right confirmation queue and decision
  inspector after human integration apply.
- If applicable, visible primary UI backed by implemented workflow paths:
  checked. The post-apply path uses existing controlled scheduler outcome /
  completion wrappers and existing local `landing.prepare`.
- If applicable, authoritative primary-surface alignment checked across confirmation queue / decision inspector / visible primary card:
  checked by the new read-model assertion that the inspector contains the
  landing primary after scheduler completion.
- If applicable, stale-history override and running/archived selected-demand suppression checked:
  checked by excluding old `apply-check.apply` / `apply-check.discard` from
  current after apply and after completion.
- If applicable, out-of-scope future capability check: checked by existing
  Workbench DOM/read-model tests; no fake full-auto, merge queue, raw
  scheduler, remote, PR, or Harness evolution automation was added.
- If applicable, forbidden visible internal terms/actions checked: existing DOM
  tests passed.
- If applicable, duplicate primary action / in-flight suppression check:
  unchanged; Workbench aggregate passed.
- If applicable, high-impact action path result: integration apply remains an
  allowlisted approval action requiring explicit confirmation.
- If applicable, real App DOM / browser UI verification result when the behavior is product-visible:
  App DOM suite passed; no new full browser run claimed.
- If applicable, projection/unit evidence that supplements but does not replace visible-surface acceptance:
  previous repaired integration apply real UI acceptance remains the browser
  baseline; this change only aligns derived projection.
- If applicable, tested with:
  `npx vitest run tests/unit/workbench-read-model.test.ts tests/unit/integration-check-apply-discard.test.ts tests/unit/web-app.test.tsx`,
  `npm run test:workbench`.
- If not applicable, reason: not applicable.

## Scoped Workbench Action Payload Coverage

- Scoped Workbench action payload coverage applicable: yes.
- If applicable, checked target ids: `applyCheckId`, `latestArtifactHash`,
  `schedulerIntegrationCheckHandoffId`, `schedulerRunId`, and selected
  `changeId`.
- If applicable, tested action path: allowlisted `apply-check.apply`, then
  controlled scheduler wrappers for outcome reconcile and run completion.
- If applicable, duplicate action/evidence affordance and in-flight duplicate submission check:
  no duplicate apply/discard primary remains after apply.
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
- If applicable, checked source project / fixture: deterministic temp git source
  created by `prepareSeededSchedulerIntegrationHandoff`.
- If applicable, checked runtime home / external managed-project isolation:
  temp harness memory fixture; no real source root mutation beyond test fixture.
- If applicable, checked worktree ids / result ids / integration check ids:
  same-Change seeded scheduler worktree ids and IntegrationCheck id.
- If applicable, source-root mutation gate checked: `apply-check.apply`
  requires explicit approval action and matching latest artifact hash.
- If applicable, out-of-scope source mutation check: discard does not mutate;
  stale artifact hash and source HEAD drift reject before patch application.
- If applicable, tested with:
  `npx vitest run tests/unit/integration-check-apply-discard.test.ts`.
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
- Future feature owner module: Workbench read-model projection.
- If applicable, module owners checked: `decision-inspector.ts` owns inspector
  derivation; `implementation.ts` only wires the aligned result after queue
  construction.
- If applicable, moved responsibilities: none.
- If applicable, retained facade responsibilities: snapshot assembly remains in
  implementation module.
- If applicable, forbidden write-back locations: no main logic added to
  Workbench server, action service, or broad manager facades.
- If applicable, compatibility surface: existing queue and action shapes remain
  compatible; one decision context kind `workflow-gate` was added for derived
  read-only inspector state.
- If applicable, behavior path tested: post-apply queue/inspector projection.
- If applicable, follow-up split candidates: none.
- If applicable, boundary tests or lint checks: targeted read-model tests and
  lint.
- If applicable, compatibility result: passed.
- If applicable, tested with: `npm run lint`, `npm run test:workbench`.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Coverage

- Core mechanism reuse / architecture growth control coverage applicable: yes.
- If applicable, existing mechanisms reused or strengthened: authoritative
  `confirmationQueue.primary`, existing IntegrationCheck apply/discard,
  scheduler outcome/completion, landing candidates, and controlled scheduler
  wrappers.
- If applicable, new cross-cutting mechanism and owner: none.
- If applicable, why existing mechanisms were insufficient: the existing
  inspector did not consume queue primary when no native context existed; a
  thin alignment helper was sufficient.
- If applicable, domain-specific logic location: Workbench read-model
  projection only.
- If applicable, shared cross-cutting logic location: existing confirmation
  queue remains the executable surface.
- If applicable, local framework / state machine / projection / validation / gate avoided:
  avoided a second post-apply state machine and did not duplicate scheduler or
  landing gates.
- If applicable, public API / facade / Workbench compatibility result: passed.
- If applicable, future-cost reduction result: fixture now proves real
  IntegrationCheck patch/hash application before projection assertions.
- If applicable, tested with: targeted suites and Workbench aggregate.
- If not applicable, reason: not applicable.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes at close.
- If applicable, handoff files checked: `AGENTS.md`, `docs/STATUS.md`, and
  `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- If applicable, stale active-path / phase grep: active handoff was aligned to
  `harness/changes/active/workbench-integration-apply-outcome-completion-v1/summary.md`
  before close.
- If applicable, latest archive / active path alignment: active path alignment
  passed before close; archive pointer update is part of post-close handoff.
- If applicable, pending evolution state checked: `harness-evolve check`
  reported no pending evolution and 1 archived change since last completion.
- If not applicable, reason: not applicable.

## Remote Handoff Acceptance Coverage

- Remote handoff coverage applicable: no.
- If applicable, checked provider/repository/action boundary: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect Draft PR creation/update, PR feedback refresh, provider capability detection, remote checks/reviews, or remote handoff evidence.

