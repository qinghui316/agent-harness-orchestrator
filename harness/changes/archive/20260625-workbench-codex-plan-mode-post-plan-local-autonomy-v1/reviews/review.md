# Review: workbench-codex-plan-mode-post-plan-local-autonomy-v1

Status: approved.

## Findings

No blocking findings.

- Fixed during review: app-server native Plan Mode requires a configured model; AHO now reads the current Codex config model and falls back to prompt-level `<proposed_plan>` when native deltas are unavailable.
- Fixed during review: post-plan automation needed a longer current-gate snapshot budget for real Workbench evidence after audit/apply.
- Fixed during review: source dirty checks for apply/close/result review now ignore AHO-owned repo-local memory artifacts while still treating product source changes as dirty.
- Fixed during review: archived selected topics no longer project stale executable primary gates.

## Verification

- Selected verification scope: proposed-plan parser, Codex app-server planning bridge, planning bundle/action payload, automation runtime, source dirty helper, Workbench read-model/DOM, and Workbench aggregate.
- Full / aggregate suites run or skipped: `npm run test:workbench` passed; slow/release suites were not required because this change did not alter scheduler deep runtime or integration apply/discard.
- Rationale for selected scope: touched behavior crosses planning proposal capture, Workbench action forwarding, scoped automation, apply/close source safety, and user-facing projection.
- If an aggregate Workbench / slow suite exceeded the tool window: record timeout, split suite members run, pass/fail status, and whether the timeout is product failure or verification runtime-cost debt.

## Complexity Deletion Review

- Complexity deletion review applicable: yes for product/code/Harness-template/rule changes; docs-only wording changes may mark this not applicable.
- delete: none.
- reuse: reused Codex app-server adapter, existing planning bundle, current-gate revalidation, scoped automation runtime, approval execution, apply/close guards, confirmation queue projection, and Workbench DecisionPanels.
- yagni: avoided a second planner, new workflow runtime, new permission system, new projection framework, raw scheduler automation, remote/merge automation, and Harness evolution automation.
- shrink: kept proposed-plan parsing to first-block extraction plus lightweight heading detection; fixed shared `getGitStatusShort` / source-dirty helpers instead of path-specific local guards.
- net: Lean already.
- Note: this is supplemental and does not replace correctness, security, source safety, validation/audit, stale-target, ToolPolicyGate, human-gate, or required coverage checks.

## Acceptance Feedback

- Real/manual acceptance performed: yes.
- Real Codex acceptance claimed: yes.
- If real Codex acceptance is claimed, fake Codex / mocked PATH / fixture result / hand-written artifact exclusion evidence: Workbench server/action path used real `codex app-server`; coder run artifacts were produced in E-drive managed project; no fake Codex, mocked PATH, fixture result, or hand-written result artifact was used.
- Manual config edits: none.
- Extra prompts or reviewer instructions: none.
- Retries or environment failures: native Plan Mode deltas were unavailable in this environment; prompt-level `<proposed_plan>` fallback was used and recorded as `planningMode: prompt-plan-contract`.
- Screenshots / artifacts / run ids: `run-20260625-192149-add-salute-function-a8aae6`, `automation-run-20260625112252-86097123`, `automation-run-20260625113056-fda1b6bd`, archive `harness/changes/archive/20260625-add-salute-function`.
- External source/state safety: source `E:\aho-accept\codex-plan-post-auto-v1-clean4\src`, runtime home `E:\aho-accept\codex-plan-post-auto-v1-clean4\home`; source commit after apply `fc35509`; no remote/merge/Harness evolution.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: unsupported `landing.prepare` correctly stopped local automation; close was completed through the allowed `change.close` gate after close readiness/projection fixes.

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
- If applicable, checked scope: planning confirmation two-tier surface, running/archived gate suppression, close gate visibility, result/apply/close projection.
- If applicable, tested with: `tests/unit/workbench-read-model.test.ts`, `tests/unit/web-app.test.tsx`, `npm run test:workbench`, clean4 snapshot after close showed `primary: <none>`.

## Workbench User-Surface Honesty Coverage

- Workbench user-surface honesty coverage applicable: yes.
- If applicable, sampled surface: planning confirm card, confirmation queue primary, archived-topic snapshot, automation running/stop evidence.
- If applicable, visible primary UI backed by implemented workflow paths: yes; plan confirm submits `planning.confirm-execution`, post-plan local automation starts only after canonical artifact write.
- If applicable, authoritative primary-surface alignment checked across confirmation queue / decision inspector / visible primary card: yes through read-model/DOM tests and clean4 snapshots.
- If applicable, stale-history override and running/archived selected-demand suppression checked: archived selected topic no longer shows executable primary gate after close.
- If applicable, out-of-scope future capability check: no automatic remote/merge/PR/Harness evolution or raw scheduler automation.
- If applicable, forbidden visible internal terms/actions checked: no fake full-auto/parallel executor/merge queue capability added.
- If applicable, duplicate primary action / in-flight suppression check: existing in-flight guard retained; automation running uses current-gate revalidation.
- If applicable, high-impact action path result: local `result.apply` and `change.close` were executed only under scoped full-access authorization after plan confirmation.
- If applicable, real App DOM / browser UI verification result when the behavior is product-visible: browser control was unreliable in this session; real Workbench server/action path plus snapshots were recorded from `http://127.0.0.1:4336`.
- If applicable, projection/unit evidence that supplements but does not replace visible-surface acceptance: DOM/read-model tests plus clean4 live snapshot.
- If applicable, tested with: targeted suites, `npm run test:workbench`, clean4 real Workbench server.

## Scoped Workbench Action Payload Coverage

- Scoped Workbench action payload coverage applicable: yes.
- If applicable, checked target ids: `changeId`, `planningBundleId`, `postPlanAutomationMode`, automation current workflow/approval target ids, worktree ids, audit ids.
- If applicable, tested action path: live endpoint forwarding test, action revalidation via automation runtime, clean4 Workbench action endpoints.
- If applicable, duplicate action/evidence affordance and in-flight duplicate submission check: existing in-flight guard retained; no second primary shown while automation runs.

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
- If applicable, checked source project / fixture: `E:\aho-accept\codex-plan-post-auto-v1-clean4\src`.
- If applicable, checked runtime home / external managed-project isolation: `E:\aho-accept\codex-plan-post-auto-v1-clean4\home`.
- If applicable, checked worktree ids / result ids / integration check ids: `wt-20260625-192450-dc43c3`, audit `run-20260625-192701-add-salute-function-ea0ca4` (accepted by automation), apply commit `fc35509`.
- If applicable, source-root mutation gate checked: source apply happened only through `result.apply` under scoped authorization; close happened only through `change.close`.
- If applicable, out-of-scope source mutation check: no remote/merge/PR/Harness evolution.
- If applicable, tested with: `project-git` helper tests, clean4 real Workbench apply/close evidence.

## Runtime Bridge Boundary Coverage

- Runtime bridge boundary coverage applicable: yes.
- If applicable, checked boundary: Codex app-server planning bridge uses configured model when native collaboration mode is requested and falls back to prompt-level contract when native plan deltas are not produced.
- If applicable, tested with: real planning run `run-20260625-192149-add-salute-function-a8aae6`, `planningMode: prompt-plan-contract`, plus typecheck/build.

## Proposal / Runtime Boundary Coverage

- Proposal/runtime boundary coverage applicable: yes.
- If applicable, artifact type and authority classification: `proposedPlanMd` is proposal evidence; canonical `spec.md` / `plan.md` / `tasks.md` / `ac-map.json` are written only after human plan confirmation.
- If applicable, boundary matrix checked: plan confirmation remains human; post-plan full-access authorizes local execution only.
- If applicable, out-of-scope execution paths checked: raw scheduler, integration apply/discard, remote, merge, PR, Harness evolution not automated.
- If applicable, stale/forged target behavior checked: stale planning bundle and scoped automation target tests retained.
- If applicable, tested with: proposed-plan tests, planning scheduler prep tests, automation runtime tests, clean4 acceptance.

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
- Future feature owner module: existing owners only.
- If applicable, module owners checked: `src/codex/app-server.ts`, `src/workbench/planning/*`, `src/workbench/actions/handlers/*`, `src/automation-runtime/*`, `src/project/git.ts`, `src/change/status.ts`, `src/workbench/projections/read-model/*`, `src/web/src/panels/workbench/DecisionPanels.tsx`.
- If applicable, moved responsibilities: none; shared source-dirty parsing stayed in `project/git`.
- If applicable, retained facade responsibilities: server/live endpoints only forward payloads; action handlers own behavior.
- If applicable, forbidden write-back locations: no new broad facade or parallel registry.
- If applicable, compatibility surface: existing action names and bundle fields preserved; new fields optional.
- If applicable, behavior path tested: targeted/unit/aggregate suites and clean4 acceptance.
- If applicable, follow-up split candidates: none required.
- If applicable, boundary tests or lint checks: `npm run lint`, module boundary tests in `test:fast`.
- If applicable, compatibility result: passed.
- If applicable, tested with: listed verification.

## Core Mechanism Reuse Coverage

- Core mechanism reuse / architecture growth control coverage applicable: yes.
- If applicable, existing mechanisms reused or strengthened: planning bundle, confirmation queue, scoped automation, current-gate revalidation, apply/close safety, Workbench projection.
- If applicable, new cross-cutting mechanism and owner: no new runtime; only small proposed-plan parser helper under planning owner.
- If applicable, why existing mechanisms were insufficient: existing planning bridge did not capture Codex proposal text; existing server forwarding dropped post-plan mode; existing close dirty checks conflated AHO memory with product source.
- If applicable, domain-specific logic location: planning parser/bundle in Workbench planning; two-tier UI in DecisionPanels.
- If applicable, shared cross-cutting logic location: source status parsing in `project/git`.
- If applicable, local framework / state machine / projection / validation / gate avoided: no second planner/runtime/permission system.
- If applicable, public API / facade / Workbench compatibility result: existing payloads remain valid; new fields optional.
- If applicable, future-cost reduction result: post-plan local autonomy now uses the same gate/readiness/action path as manual mode.
- If applicable, tested with: listed verification.

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

