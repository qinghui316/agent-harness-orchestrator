# Review: provider-native-a2a-real-ui-acceptance-fix-pass-v1

Status: partial.

## Findings

- P1: Full provider-native child-agent A2A acceptance is still blocked by real
  runtime capability evidence. The latest real app-server run emitted
  `turn/plan/updated`, but did not emit `spawn_agent`, `send_input`,
  `wait_agent`, `collabToolCall`, `collabAgentToolCall`, or
  `item/tool/requestUserInput`. AHO must not display a fake `planning-agent`
  when Codex only produced a native Plan Mode session.
- P1 fixed in this pass: native Codex Plan Mode output is now scoped to
  `plan-session` / `计划会话`, not `planning-agent`. Clean read-model coverage
  verifies that `planning-agent` appears only when real provider child/collab or
  persisted Harness planning evidence exists.
- P1 fixed in this pass: native plan text is no longer duplicated into the main
  parent transcript through `result.lastMessage` fallback. The parent transcript
  can contain the main Agent's natural summary, but the plan body belongs to the
  plan session.
- P2: The first real run allowed the main Agent to claim hidden native planning
  as completed user-visible work. Earlier fixes tightened the project-scoped
  parent prompt and stripped known child/planning leak phrases from parent
  replies.
- P1 fixed in this pass: the old Workbench-authored planning action chain was
  deleted from the product path. `planning.generate`, `planning.revise`,
  `planning.confirm-execution`, `latest-bundle`, and fake planning-agent bundle
  rows are no longer valid UI/runtime acceptance targets.
- P1 scope boundary retained: the desktop-cc-gui reference uses an explicit
  Plan handoff / Exit Plan Mode execution card rather than composer text
  parsing. This pass removes the old text-parsed Workbench planning actions and
  keeps feedback in the Plan Mode path; a full reference-style handoff card is a
  follow-up, not part of this closeout.

## Verification

Partial.

- Selected verification scope: targeted Codex/Workbench server/read-model/UI
  tests, build/typecheck/lint, aggregate Workbench suites, Harness checks, and
  real browser acceptance on `goal-loop-demo-real`.
- Full / aggregate suites run: `npm run test:fast`, `npm run test:workbench`,
  `npm run build`, `npm run lint`, and `npm run typecheck` passed.
- Additional deletion-focused regression passed:
  `npx vitest run tests/unit/parent-agent-transcript.test.ts tests/unit/workbench-live-actions.test.ts tests/unit/workbench-action-service.test.ts tests/unit/action-revalidation.test.ts tests/unit/web-app.test.tsx`.
- Rationale for selected scope: the modified code path is the project-scoped
  main Agent prompt/sanitization path plus Codex app-server event evidence.
- Real browser result: `conv-mr8t1vqs-d840d00f` latest run
  `chat-conv-mr8t1vqs-d840d00f-mr8wsw6u` produced a parent main-Agent reply
  plus a separate `plan-session` message titled `计划会话`.
- Real browser deletion check: refreshed
  `http://127.0.0.1:4477/?project=goal-loop-demo-real`; visible UI did not show
  `latest-bundle`, `planning.confirm-execution`, `planning.generate`,
  `planning.revise`, `planning-agent produced`, or `planning-agent 任务`.
  Historical conversation titles may still contain user-authored
  `planning-agent` text.
- Runtime event result: latest run event counts included
  `item/agentMessage/delta`, `turn/plan/updated`, `item/started`,
  `item/completed`, `turn/started`, and `turn/completed`; no native
  child-agent/request-input event was observed.
- Code inspection result: `src/workbench/chat.ts` now forwards project-scoped
  Plan Mode output with `PROJECT_PLAN_SESSION_ROLE_ID` and disables
  `result.lastMessage` fallback when native plan output exists.
- Harness checks passed: `scripts/lint-ecl.ps1`, `scripts/lint-encoding.ps1`,
  `scripts/harness-change.ps1 reindex`, and `scripts/harness-evolve.ps1 check`.
- Code scan result: product `src/` no longer contains the removed planning
  action/bundle symbols; remaining mentions are negative tests or change/docs
  records.
- If an aggregate Workbench / slow suite exceeded the tool window: record timeout, split suite members run, pass/fail status, and whether the timeout is product failure or verification runtime-cost debt.

## Complexity Deletion Review

- Complexity deletion review applicable: yes for product/code/Harness-template/rule changes; docs-only wording changes may mark this not applicable.
- delete: none.
- reuse: reused project-scoped parent prompt owner and existing user-visible
  reply sanitizer in `src/workbench/chat.ts`.
- yagni: avoided adding a new delegation parser, fake planning card, or new
  provider abstraction during acceptance.
- shrink: smaller fix checked: prompt-only was not enough because the first real
  model output already leaked a bad claim; sanitizer was also tightened.
- net: Lean already for the safety fix; full A2A remains blocked on real
  provider event availability/design.
- Note: this is supplemental and does not replace correctness, security, source safety, validation/audit, stale-target, ToolPolicyGate, human-gate, or required coverage checks.

## Acceptance Feedback

- Real/manual acceptance performed: yes, partial.
- Real Codex acceptance claimed: partial only for main Agent live text. Full
  provider-native A2A acceptance is blocked.
- If real Codex acceptance is claimed, fake Codex / mocked PATH / fixture result / hand-written artifact exclusion evidence: not applicable.
- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids:
  - `conv-mr8suqdo-ae96d95e` / `chat-conv-mr8suqdo-ae96d95e-mr8suqe4`:
    first run, exposed hidden native-plan claim.
  - `conv-mr8t1vqs-d840d00f` / `chat-conv-mr8t1vqs-d840d00f-mr8t1vr6`:
    fixed rerun, no hidden-plan claim, no provider-native child/plan events.
- External source/state safety: not applicable. If real/self acceptance uses a managed source project, record source root, runtime home, whether same-root evidence is negative-only, and before/after `git status --short`.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: next implementation must
  expose or bridge a real provider-native child-agent/plan-session event path
  before right-side planning-agent acceptance can pass.

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

- Workbench / GUI read-model projection coverage applicable: no.
- If applicable, checked scope: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect derived read models, approval inboxes, thread/run projections, role summaries, or Harness gap reports.

## Workbench User-Surface Honesty Coverage

- Workbench user-surface honesty coverage applicable: no.
- Product-visible Workbench controls are applicable unless the review records why they cannot affect user decisions; do not mark this section not applicable only because the control does not change the authoritative primary decision surface.
- If applicable, sampled surface: not applicable.
- If applicable, visible primary UI backed by implemented workflow paths: not applicable.
- If applicable, authoritative primary-surface alignment checked across confirmation queue / decision inspector / visible primary card: not applicable.
- If applicable, stale-history override and running/archived selected-demand suppression checked: not applicable.
- If applicable, out-of-scope future capability check: not applicable.
- If applicable, forbidden visible internal terms/actions checked: not applicable.
- If applicable, duplicate primary action / in-flight suppression check: not applicable.
- If applicable, high-impact action path result: not applicable.
- If applicable, real App DOM / browser UI verification result when the behavior is product-visible: not applicable.
- If applicable, projection/unit evidence that supplements but does not replace visible-surface acceptance: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect Workbench user-facing decision surfaces, Workpad projections, composer actions, task/queue/audit controls, or post-run result actions.

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

## 2026-07-06 Native Plan Mode Projection Evidence

- Real App/browser acceptance was rerun after `npm run build` and a fresh
  `node dist/index.js workbench serve --host 127.0.0.1 --port 4477` restart.
- Real conversation: `conv-mr8t1vqs-d840d00f`.
- Earlier accepted native-plan run: `chat-conv-mr8t1vqs-d840d00f-mr8vc5sa`.
- Latest plan/session identity repair run:
  `chat-conv-mr8t1vqs-d840d00f-mr8wsw6u`.
- Event artifact:
  `C:\Users\qinghui\.agent-harness\projects\goal-loop-demo-real\workbench\conversations\conv-mr8t1vqs-d840d00f\runs\chat-conv-mr8t1vqs-d840d00f-mr8wsw6u\app-server-events.jsonl`.
- Observed provider-native event: `turn/plan/updated`.
- Not observed in accepted run: `spawn_agent`, `send_input`, `wait_agent`,
  `collabToolCall`, `collabAgentToolCall`, `item/tool/requestUserInput`.
- Product fix verified: the latest native plan update is stored as a
  `plan-session` scoped transcript message titled `计划会话`, not as a
  `planning-agent` message.
- Product fix verified: the latest parent transcript no longer receives the
  native plan body through `result.lastMessage` fallback. A global DOM selector
  can still match right-workspace transcript content because the workspace
  correctly reuses the same transcript renderer; checks must be scoped to the
  main conversation surface.
- Boundary result: this pass proves native Plan Mode planning-session
  projection, not full provider-native child-agent spawn. The old Workbench
  planning confirmation/bundle route is removed and should not be used for
  future acceptance.

