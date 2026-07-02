# Review: main-agent-real-a2a-flow-audit-repair-v1

Status: approved; real browser A2A acceptance, targeted tests, standard verification, Workbench verification, and Harness checks passed.

## Findings

- Reference source audit confirms AHO should reuse Codex app-server native item/plan/user-input events and desktop-cc-gui-style transcript/tool/status rows. A custom planning questionnaire engine or persistent fake waiting assistant message would be the wrong boundary.
- Initial repair now routes Codex runtime `item/tool/requestUserInput` into Workbench live events and answer submission, removes persistent "waiting" transcript text, keeps manual `planning.generate` out of the child workspace, and uses a bounded main-agent delegation packet for planning-agent.
- A2A workspace layout repair now keeps the center as the main Agent conversation, removes the `主 Agent` tab from the right Agent workspace, removes the child-agent explanatory block / input-output summary cards / standalone implement button, and uses a transcript-first planning-agent panel with a composer pinned to the bottom of the Agent workspace. Transcript, evidence, clarification, and Codex user-input cards scroll above the composer. The left project sidebar is now resize-only, with no collapse branch. Left and right side rails use explicit `.shell-resize-grip` hit targets; resizing changes only the corresponding rail width and the center column, and non-grip content no longer advertises `ew-resize`.
- Real browser acceptance covers the normal App new-demand A2A path. Standard verification and Harness checks have also passed.

## Verification

Complete.

- Selected verification scope: targeted Codex bridge, Workbench server, Web app, Workbench read-model, module boundaries, and automation runtime tests.
- Ran: `npx vitest run tests/unit/codex.test.ts tests/unit/workbench-server.test.ts tests/unit/web-app.test.tsx tests/unit/workbench-read-model.test.ts tests/unit/workbench-module-boundaries.test.ts tests/unit/automation-runtime.test.ts` — passed, 6 files / 247 tests.
- Ran: `npx vitest run tests/unit/web-app.test.tsx tests/unit/workbench-read-model.test.ts tests/unit/workbench-module-boundaries.test.ts` — passed, 3 files / 183 tests.
- Ran: `npx vitest run tests/unit/web-app.test.tsx -t "resizes side rails|transcript-first planning-agent"` — passed, 1 file / 2 selected tests.
- Ran: `npx vitest run tests/unit/web-app.test.tsx tests/unit/workbench-module-boundaries.test.ts` — passed, 2 files / 138 tests.
- Ran: `npx vitest run tests/unit/codex.test.ts tests/unit/workbench-server.test.ts tests/unit/web-app.test.tsx tests/unit/workbench-read-model.test.ts tests/unit/workbench-module-boundaries.test.ts tests/unit/automation-runtime.test.ts tests/unit/parent-agent-transcript.test.ts` — passed, 7 files / 255 tests.
- Ran: `npx vitest run tests/unit/workbench-read-model.test.ts tests/unit/web-app.test.tsx tests/unit/parent-agent-transcript.test.ts` — passed, 3 files / 145 tests after final Agent workspace projection cleanup.
- Ran: `npm run typecheck` — passed.
- Ran: `npm run lint` — passed.
- Ran: `npm run test:fast` — passed, 81 files / 793 tests.
- Ran: `npm run build` — passed, with existing Vite chunk-size warning.
- Ran: `npm run test:workbench` — passed, 9 files / 145 tests.
- Ran: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` — passed.
- Ran: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` — passed.
- Ran: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` — passed; rebuilt `harness/changes/INDEX.json`.
- Ran: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` — passed; no pending evolution.
- Browser smoke: in-app browser connected and opened `http://127.0.0.1:4477/?project=goal-loop-demo-real`. Real DOM layout showed the Agent tab content using `decision-pane-content agent-content`, outer content overflow hidden, transcript region overflow auto, and the child Agent composer pinned at the bottom of the right workspace. After rebuilding and restarting the real `dist/index.js workbench serve` process on `127.0.0.1:4477`, `elementFromPoint()` confirmed left/right grip areas hit `.shell-resize-grip` with `cursor: ew-resize`, while adjacent non-grip content hit normal content with `cursor: auto`. Left rail drag changed grid from `280px 450px 320px` to `340px 390px 320px`; right rail drag changed grid from `340px 390px 320px` to `340px 330px 380px`.
- Full A2A browser acceptance: created `真实 A2A live streaming 验收 12...` through the normal project UI. The main transcript showed a natural main-agent reply, then a parent-level `委派 planning-agent` row. The right Agent workspace showed planning-agent transcript/plan content; feedback through the planning-agent composer revised the plan and added the requested "保留现有内容" and `node test.mjs` validation details. Typing `实施此计划` in the planning-agent composer called existing `planning.confirm-execution`, did not execute code, and produced the user-facing main transcript summary `方案已确认并保存。当前不会直接修改文件；下一步会继续走现有执行边界。`
- Final browser projection check: no `Planning confirmed...` old English summary remained in the main transcript for the new confirmation; Agent workspace showed no global execution-mode control, no input/output summary cards, no standalone implement button, no `主 Agent` tab, and no derived English fallback such as `Use the smallest focused implementation...`.
- Full / aggregate suites run or skipped: `npm run test:fast` and `npm run test:workbench` both passed; no required aggregate suite remains pending for this change.
- Rationale for selected scope: current edits touch app-server event parsing, topic creation/live routing, Agent workspace projection, transcript rendering, planning handoff, and automation boundary regression.
- If an aggregate Workbench / slow suite exceeded the tool window: record timeout, split suite members run, pass/fail status, and whether the timeout is product failure or verification runtime-cost debt.

## Complexity Deletion Review

- Complexity deletion review applicable: yes for product/code/Harness-template/rule changes; docs-only wording changes may mark this not applicable.
- delete: none.
- reuse: existing owner/helper/mechanism used: Codex app-server bridge, Workbench live events, topic thread entries, Agent workspace projection, parent transcript projection, planning action handler, `planning.confirm-execution`, confirmationQueue, and scoped automation boundaries.
- yagni: avoided: no separate planning questionnaire runtime, no new child-agent controller, no new workflow truth, no new action type, no new automation allowlist.
- shrink: simpler alternative checked: projecting existing runtime events and thread entries was chosen over creating a second chat UI or bespoke agent workspace schema.
- net: Lean already.
- Note: this is supplemental and does not replace correctness, security, source safety, validation/audit, stale-target, ToolPolicyGate, human-gate, or required coverage checks.

## Acceptance Feedback

- Real/manual acceptance performed: yes, normal App new-demand A2A flow plus right-rail resize/layout smoke.
- Real Codex acceptance claimed: yes for main-agent live reply and planning-agent live planning/revision flow. Native `request_user_input` support was not triggered during the real run, so that path remains unit/projection verified only.
- If real Codex acceptance is claimed, fake Codex / mocked PATH / fixture result / hand-written artifact exclusion evidence: used the currently running App on `127.0.0.1:4477`, rebuilt `dist/index.js` before browser checks, restarted real `workbench serve`, used project `goal-loop-demo-real`, and did not mock Codex, hand-write run artifacts, or directly write manager truth for the acceptance path.
- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: in-app browser tab URL recorded; demand title `真实 A2A live streaming 验收 12...`; browser DOM snapshots captured main transcript tail, Agent workspace tail, right rail state, and resize geometry. The visible UI did not expose raw run ids; persisted evidence remains in the project memory artifacts.
- External source/state safety: not applicable. If real/self acceptance uses a managed source project, record source root, runtime home, whether same-root evidence is negative-only, and before/after `git status --short`.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy Coverage

- Documentation entropy coverage applicable: yes.
- If applicable, documents checked: `AGENTS.md`, `docs/STATUS.md`, active `summary.md`, active `tasks.md`, and this review.
- If applicable, before/after line counts: current handoff documents were updated narrowly to reflect the active A2A repair slice and do not rewrite archive history.
- If applicable, duplicate current-state fields checked: latest active change / latest archived product change references remain aligned with the current handoff.
- If applicable, roadmap/current-direction stale language checked: yes; closeout records that Harness-mode A2A live UI was repaired without expanding execution authority.
- If applicable, archive-ledger content promoted / retained / merged / retired / archive-only: archive history retained; active closeout evidence records only the current acceptance.
- If applicable, over-budget documents and rationale: not applicable.
- If applicable, tested with: `scripts/lint-ecl.ps1`, `scripts/lint-encoding.ps1`, `scripts/harness-change.ps1 reindex`, `scripts/harness-evolve.ps1 check`.
- If not applicable, reason: not applicable.

## Experience Lifecycle Coverage

- Experience lifecycle coverage applicable: yes.
- If applicable, promote decisions: right Agent workspace becomes the visible planning-agent interaction surface for draft review, feedback, and implementation intent.
- If applicable, retain decisions: `planning.confirm-execution`, stale revalidation, confirmationQueue for real apply/close/scheduler/integration gates, ToolPolicyGate, and automation boundaries remain unchanged.
- If applicable, merge decisions: planning-agent transcript and composer reuse the main transcript/composer visual system instead of a separate summary-card UI.
- If applicable, retire decisions: planning draft as a primary confirmation card, persistent fake waiting assistant text, input/output summary cards, standalone child-panel implement button, and child-panel global execution-mode controls are retired for the tested path.
- If applicable, archive-only decisions: older screenshot-era workspace layouts and static planning-card behavior remain historical only.
- If applicable, noop / no-change rationale after old-experience scan: no additional runtime authority was introduced; changes are projection/interaction repairs.
- If applicable, tested with: real browser A2A acceptance, `tests/unit/web-app.test.tsx`, `tests/unit/workbench-read-model.test.ts`, `tests/unit/parent-agent-transcript.test.ts`, `npm run test:workbench`.
- If not applicable, reason: not applicable.

## Worktree Diff Artifact Coverage

- New-file / untracked worktree diff coverage applicable: no.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect worktree-backed diff behavior.

## Read Model Projection Coverage

- Workbench / GUI read-model projection coverage applicable: yes.
- If applicable, checked scope: Agent workspace actions/process history, parent transcript exclusion of child-agent prose, planning draft location, and confirmationQueue planning exclusion.
- If applicable, tested with: `tests/unit/workbench-read-model.test.ts`, `tests/unit/web-app.test.tsx`, `tests/unit/workbench-module-boundaries.test.ts`.
- If not applicable, reason: not applicable.

## Workbench User-Surface Honesty Coverage

- Workbench user-surface honesty coverage applicable: yes.
- Product-visible Workbench controls are applicable unless the review records why they cannot affect user decisions; do not mark this section not applicable only because the control does not change the authoritative primary decision surface.
- If applicable, sampled surface: main transcript, right Agent workspace, confirmation queue, topic creation live path, Codex runtime user-input cards.
- If applicable, visible primary UI backed by implemented workflow paths: yes for the tested projection/runtime paths; shell smoke checked the current browser DOM and full project browser acceptance passed.
- If applicable, authoritative primary-surface alignment checked across confirmation queue / decision inspector / visible primary card: planning draft is no longer restored as confirmation primary; implementation still uses `planning.confirm-execution`.
- If applicable, stale-history override and running/archived selected-demand suppression checked: not applicable.
- If applicable, out-of-scope future capability check: not applicable.
- If applicable, forbidden visible internal terms/actions checked: persistent fake waiting transcript text and planning-generation manual action were removed from the tested user surfaces.
- If applicable, duplicate primary action / in-flight suppression check: not applicable.
- If applicable, high-impact action path result: not applicable.
- If applicable, real App DOM / browser UI verification result when the behavior is product-visible: real AHO page passed layout and A2A flow checks. The Agent workspace composer is visible at the bottom, no global execution-mode control or standalone implement button appears in the child Agent panel, planning-agent content stays in the right workspace, and the main transcript stays parent-level. Left and right rail resize behavior was exercised through the browser after a real build/server restart. `elementFromPoint()` confirmed accurate grip hit targets and cursor behavior; dragging changed only the intended side rail and the center column.
- If applicable, projection/unit evidence that supplements but does not replace visible-surface acceptance: targeted Workbench UI/projection tests passed and supplement the completed browser acceptance.
- If applicable, tested with: `tests/unit/web-app.test.tsx`, `tests/unit/workbench-read-model.test.ts`, targeted Codex/server tests.
- If not applicable, reason: not applicable.

## Reference-Driven UI / Product Source Evidence Coverage

- Reference-driven UI/product coverage applicable: yes.
- If applicable, reference map section inspected: `docs/references/index.md` entries for `desktop-cc-gui` and OpenAI Codex app-server.
- If applicable, reference source files or inspected commit used: local `reference-projects/desktop-cc-gui` clone, including `src/features/messages/components/MessagesRows.tsx`, `src/features/threads/hooks/useThreadTurnEvents.ts`, `src/features/threads/hooks/useThreadUserInput.ts`, `src/features/threads/hooks/useThreadUserInputEvents.ts`, `openspec/specs/app-server-event-stream-pacing/spec.md`, and `openspec/specs/codex-chat-canvas-plan-streaming-contract/spec.md`; official OpenAI Codex app-server docs were also checked.
- If applicable, controls copied / adapted / intentionally omitted: adapted conversation-cell/status/tool/user-input event model; omitted copying desktop-cc-gui runtime authority or provider permissions.
- If applicable, fake-control check: no planning-specific fake questionnaire or static fake plan card remains in the tested browser path; native `request_user_input` support is wired but was not triggered in the real acceptance run.
- If applicable, tested with: targeted Codex bridge/server/UI/projection tests listed above.
- If not applicable, reason: not applicable.

## Scoped Workbench Action Payload Coverage

- Scoped Workbench action payload coverage applicable: no.
- If applicable, checked target ids: not applicable.
- If applicable, tested action path: not applicable.
- If applicable, duplicate action/evidence affordance and in-flight duplicate submission check: not applicable.
- If not applicable, reason: change does not add or change Workbench live/server UI actions that depend on explicit target ids.

## Transcript Renderer Source-Boundary Coverage

- Transcript renderer source-boundary coverage applicable: yes.
- If applicable, canonical transcript projection checked: parent transcript should show main-agent narrative and process rows, while child-agent transcript/output is scoped to Agent workspace.
- If applicable, assistant markdown source checked: child planning output is not copied into main assistant prose.
- If applicable, process/tool row compactness checked: agent lifecycle status rows are treated as process rows.
- If applicable, derived workflow summary exclusion checked: planning draft/AC/tasks are not projected as parent assistant prose in the tested paths.
- If applicable, worker/role transcript scoping checked: `agentRoleId` scoped planning-agent output routes to child workspace projection.
- If applicable, private chain-of-thought exclusion checked: no hidden reasoning fields added.
- If applicable, tested with: `tests/unit/web-app.test.tsx`, `tests/unit/workbench-read-model.test.ts`, `tests/unit/workbench-module-boundaries.test.ts`.
- If not applicable, reason: not applicable.

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
- If applicable, checked boundary: Codex app-server `item/tool/requestUserInput` parsing/response, live event scoping, and no fake live acceptance through replay.
- If applicable, tested with: `tests/unit/codex.test.ts`, `tests/unit/workbench-server.test.ts`, `tests/unit/web-app.test.tsx`.
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

- Module boundary coverage applicable: no.
- Future feature owner module: not applicable.
- If applicable, module owners checked: not applicable.
- If applicable, moved responsibilities: not applicable.
- If applicable, retained facade responsibilities: not applicable.
- If applicable, forbidden write-back locations: not applicable.
- If applicable, compatibility surface: not applicable.
- If applicable, behavior path tested: not applicable.
- If applicable, follow-up split candidates: not applicable.
- If applicable, boundary tests or lint checks: not applicable.
- If applicable, compatibility result: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not add or change Workbench action execution, projections, runtime services, frontend panels, typed workflow artifacts, or cross-module workflow state.

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

