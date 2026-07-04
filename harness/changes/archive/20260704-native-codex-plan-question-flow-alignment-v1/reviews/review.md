# Review: native-codex-plan-question-flow-alignment-v1

Status: pass with one runtime limitation recorded.

## Findings

No blocking findings.

Runtime limitation: real Codex app-server acceptance did not emit a native `item/tool/requestUserInput` event in the observed run. The product handled the real planning-agent question as a right-workspace message and did not fake a plan. Native request card rendering is implemented as a scoped path but remains unproven by this runtime session.

## Verification

Passed.

- Selected verification scope: Codex bridge, Workbench read model/projection, web UI, module boundaries, full Workbench/fast regression, real browser acceptance.
- Full / aggregate suites run or skipped: `npm run test:workbench`, `npm run test:fast`, `npm run typecheck`, `npm run lint`, and `npm run build` passed.
- Rationale for selected scope: this change affects Codex app-server event handling, planning handler prompts/results, right Agent workspace, and main transcript projection.
- If an aggregate Workbench / slow suite exceeded the tool window: record timeout, split suite members run, pass/fail status, and whether the timeout is product failure or verification runtime-cost debt.

## Complexity Deletion Review

- Complexity deletion review applicable: yes for product/code/Harness-template/rule changes; docs-only wording changes may mark this not applicable.
- delete: none.
- reuse: reused existing Codex app-server bridge, planning action owners, Agent workspace transcript/composer, parent transcript projection, and `planning.confirm-execution` revalidation.
- yagni: avoided a new question engine, new workflow truth, new action type, new controller, new confirmation queue entry, and new automation permission.
- shrink: kept AHO bundle derivation as a backend adapter and retained `<proposed_plan>` only as fallback/replay instead of a second primary planning protocol.
- net: Lean already.
- Note: this is supplemental and does not replace correctness, security, source safety, validation/audit, stale-target, ToolPolicyGate, human-gate, or required coverage checks.

## Acceptance Feedback

- Real/manual acceptance performed: yes.
- Real Codex acceptance claimed: yes, for main-agent parent transcript, planning-agent right-workspace question/revision flow, and internal-term cleanup. Native `requestUserInput` card was not emitted by runtime and is not claimed as fully accepted.
- If real Codex acceptance is claimed, fake Codex / mocked PATH / fixture result / hand-written artifact exclusion evidence: real App server was built/restarted, browser used `127.0.0.1:4477`, project `goal-loop-demo-real`, and validation did not use fake Codex, mocked binary, hand-written artifacts, or manager truth writes.
- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: user required native Codex interaction, no internal UI vocabulary, no fake planning card, and real browser validation.
- Retries or environment failures: initial acceptance exposed internal vocabulary and selected-topic loss after planning feedback; both were fixed and re-tested.
- Screenshots / artifacts / run ids: real browser acceptance used `goal-loop-demo-real`; server logs were captured in the local temp acceptance directory.
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
- If applicable, checked scope: conversation-bound Change read-model selection, planning-agent workspace projection, parent transcript filtering, and preserve-selected-topic refresh behavior.
- If applicable, tested with: `tests/unit/workbench-read-model.test.ts`, `tests/unit/web-app.test.tsx`, real App acceptance.
- If not applicable, reason: not applicable.

## Workbench User-Surface Honesty Coverage

- Workbench user-surface honesty coverage applicable: yes.
- Product-visible Workbench controls are applicable unless the review records why they cannot affect user decisions; do not mark this section not applicable only because the control does not change the authoritative primary decision surface.
- If applicable, sampled surface: main transcript, right planning-agent workspace, planning feedback composer, and visible DOM after real planning-agent question/revision.
- If applicable, visible primary UI backed by implemented workflow paths: planning feedback uses existing `planning.revise`; implementation intent remains existing `planning.confirm-execution` with target revalidation.
- If applicable, authoritative primary-surface alignment checked across confirmation queue / decision inspector / visible primary card: confirmationQueue did not regain a planning draft primary card; execution remains behind existing planning confirmation.
- If applicable, stale-history override and running/archived selected-demand suppression checked: selected conversation/workspace is preserved across planning feedback refresh.
- If applicable, out-of-scope future capability check: no new raw scheduler, apply/close, remote, PR, merge, or automation permission was added.
- If applicable, forbidden visible internal terms/actions checked: real DOM scan returned no current main/agent surface hits for internal terms including `Harness`, `AGENTS.md`, `active change`, `worktree`, `TaskRun`, `WorkflowRun`, `close gate`, `validation`, `audit`, `bundle`, `AC-001`, `T-001`.
- If applicable, duplicate primary action / in-flight suppression check: not applicable.
- If applicable, high-impact action path result: not applicable.
- If applicable, real App DOM / browser UI verification result when the behavior is product-visible: passed for parent-only main transcript, right-workspace planning-agent question/revision, and internal-term cleanup; native requestUserInput card was not emitted by the runtime and is not claimed.
- If applicable, projection/unit evidence that supplements but does not replace visible-surface acceptance: targeted Workbench/read-model/web tests plus full Workbench/fast suites.
- If applicable, tested with: `tests/unit/web-app.test.tsx`, `tests/unit/workbench-read-model.test.ts`, real App acceptance.
- If not applicable, reason: not applicable.

## Reference-Driven UI / Product Source Evidence Coverage

- Reference-driven UI/product coverage applicable: yes.
- If applicable, reference map section inspected: Codex app-server native item lifecycle, Plan Mode events, request-user-input runtime requests, and cc-gui-style transcript/process ownership.
- If applicable, reference source files or inspected commit used: local Codex app-server protocol understanding from prior review plus current AHO implementation paths.
- If applicable, controls copied / adapted / intentionally omitted: reused transcript/workspace projection pattern; did not copy external runtime authority.
- If applicable, fake-control check: no fake plan card, fake assistant reply, or fake question engine is used for acceptance.
- If applicable, tested with: real App acceptance plus targeted UI tests.
- If not applicable, reason: not applicable.

## Scoped Workbench Action Payload Coverage

- Scoped Workbench action payload coverage applicable: yes.
- If applicable, checked target ids: planning feedback and implementation intent remain routed through existing planning action payloads and revalidation.
- If applicable, tested action path: planning feedback in real UI; unit coverage for Workbench action projection and UI behavior.
- If applicable, duplicate action/evidence affordance and in-flight duplicate submission check: not applicable.
- If not applicable, reason: change does not add or change Workbench live/server UI actions that depend on explicit target ids.

## Transcript Renderer Source-Boundary Coverage

- Transcript renderer source-boundary coverage applicable: yes.
- If applicable, canonical transcript projection checked: main transcript receives parent-level user/assistant/process rows only.
- If applicable, assistant markdown source checked: main assistant text is sanitized for user-facing vocabulary.
- If applicable, process/tool row compactness checked: planning delegation/return are process rows, not long plan prose.
- If applicable, derived workflow summary exclusion checked: full plan, checklist, task list, and internal ids remain out of main transcript.
- If applicable, worker/role transcript scoping checked: planning-agent messages stay in the right Agent workspace.
- If applicable, private chain-of-thought exclusion checked: no hidden reasoning is exposed; planning-agent text is normal assistant output.
- If applicable, tested with: `tests/unit/parent-agent-transcript.test.ts`, `tests/unit/web-app.test.tsx`, real App acceptance.
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
- If applicable, checked boundary: Codex app-server planning mode, plan events, user-input request events, planning-agent role scoping, and fallback/replay separation.
- If applicable, tested with: `tests/unit/codex.test.ts`, real App acceptance.
- If not applicable, reason: not applicable.

## Proposal / Runtime Boundary Coverage

- Proposal/runtime boundary coverage applicable: yes.
- If applicable, artifact type and authority classification: native Codex plan output is runtime interaction; AHO planning bundle remains backend adapter target for existing confirm-execution.
- If applicable, boundary matrix checked: planning-agent cannot execute code, apply, close, dispatch scheduler, or become workflow truth.
- If applicable, out-of-scope execution paths checked: no automation allowlist, Scheduler, IntegrationCheck, apply/close, remote, PR, merge, or Harness evolution authority changed.
- If applicable, stale/forged target behavior checked: implementation intent remains tied to existing `planning.confirm-execution` target freshness/revalidation.
- If applicable, tested with: targeted Workbench/action tests and real planning feedback acceptance.
- If not applicable, reason: not applicable.

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
- If applicable, module owners checked: Codex bridge owns runtime event parsing, planning action handler owns planning-agent run/bundle adapter, read-model owns projection, web UI owns rendering/interactions.
- If applicable, moved responsibilities: planning prose and questions moved out of main transcript into planning-agent workspace projection.
- If applicable, retained facade responsibilities: existing planning action facade and confirm-execution revalidation retained.
- If applicable, forbidden write-back locations: no direct manager truth writes, no fake artifacts, no worker context injection.
- If applicable, compatibility surface: old `<proposed_plan>` retained only for fallback/replay.
- If applicable, behavior path tested: real UI planning-agent question/revision and targeted unit suites.
- If applicable, follow-up split candidates: native requestUserInput card acceptance remains runtime-dependent follow-up if Codex emits the event.
- If applicable, boundary tests or lint checks: `tests/unit/workbench-module-boundaries.test.ts`.
- If applicable, compatibility result: pass.
- If applicable, tested with: module boundaries, Workbench/read-model/web/Codex tests, real UI acceptance.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Coverage

- Core mechanism reuse / architecture growth control coverage applicable: yes.
- If applicable, existing mechanisms reused or strengthened: reused Codex app-server Plan Mode, existing Agent workspace transcript/composer, existing planning action owners, and existing confirm-execution.
- If applicable, new cross-cutting mechanism and owner: no new broad framework; only narrow bridge/projection handling in existing owners.
- If applicable, why existing mechanisms were insufficient: previous custom plan prompt/proposed-plan protocol leaked AHO vocabulary and did not match native Codex interaction.
- If applicable, domain-specific logic location: planning handler and Agent workspace projection.
- If applicable, shared cross-cutting logic location: Codex bridge event routing and Workbench parent transcript filtering.
- If applicable, local framework / state machine / projection / validation / gate avoided: avoided a new question engine, new planning gate, new controller, and new UI-only truth.
- If applicable, public API / facade / Workbench compatibility result: existing action facade retained.
- If applicable, future-cost reduction result: planning-agent now follows native Codex interaction shape instead of bespoke XML-like output.
- If applicable, tested with: Workbench/read-model/web/Codex tests and real UI acceptance.
- If not applicable, reason: not applicable.

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

