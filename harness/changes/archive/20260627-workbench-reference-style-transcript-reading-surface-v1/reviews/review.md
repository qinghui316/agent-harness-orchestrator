# Review: workbench-reference-style-transcript-reading-surface-v1

Status: ready to close.

## Findings

None recorded yet.

## Verification

No blocking findings.

- Selected verification scope: targeted Workbench DOM/read-model suites plus required aggregate project checks.
- Full / aggregate suites run or skipped: `npm run test:workbench` was run and passed; full `npm run test` was not required because this change only affects Workbench transcript presentation.
- Rationale for selected scope: touched frontend transcript presentation, CSS, and height estimation; backend workflow/runtime paths are unchanged.
- If an aggregate Workbench / slow suite exceeded the tool window: record timeout, split suite members run, pass/fail status, and whether the timeout is product failure or verification runtime-cost debt.

## Complexity Deletion Review

- Complexity deletion review applicable: yes for product/code/Harness-template/rule changes; docs-only wording changes may mark this not applicable.
- delete: none.
- reuse: reused `ParentAgentTranscriptCell`, cursor paging, `TranscriptVirtualList`, Pretext measurement, long-message folding, and evidence ref labels.
- yagni: avoided full Markdown runtime, tool grouping, fake copy/retry/edit/fork controls, new transcript datasource, database, workflow runtime, or permission layer.
- shrink: extracted one display owner instead of widening `ConversationPanel.tsx` or copying desktop-cc-gui components.
- net: Lean already.
- Note: this is supplemental and does not replace correctness, security, source safety, validation/audit, stale-target, ToolPolicyGate, human-gate, or required coverage checks.

## Acceptance Feedback

- Real/manual acceptance performed: yes, in-app browser visual pass against a local Workbench server.
- Real Codex acceptance claimed: no.
- If real Codex acceptance is claimed, fake Codex / mocked PATH / fixture result / hand-written artifact exclusion evidence: not applicable.
- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: `E:\aho-accept\transcript-reading-surface-v1\transcript-reading-surface.png`; DOM showed user prompt, assistant Markdown flow, and collapsed activity row with detail toggle.
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
- If applicable, checked scope: verified read-model transcript projection remains compatible; presentation changes consume existing cells only.
- If applicable, tested with: `npx vitest run tests/unit/web-app.test.tsx tests/unit/workbench-read-model.test.ts`, `npm run test:workbench`.

## Workbench User-Surface Honesty Coverage

- Workbench user-surface honesty coverage applicable: yes.
- Product-visible Workbench controls are applicable unless the review records why they cannot affect user decisions; do not mark this section not applicable only because the control does not change the authoritative primary decision surface.
- If applicable, sampled surface: main Workbench conversation transcript.
- If applicable, visible primary UI backed by implemented workflow paths: no new primary action or workflow control was added.
- If applicable, authoritative primary-surface alignment checked across confirmation queue / decision inspector / visible primary card: confirmation surfaces were not changed.
- If applicable, stale-history override and running/archived selected-demand suppression checked: unchanged by this display-only change.
- If applicable, out-of-scope future capability check: no copy/retry/edit/fork/tool buttons were added.
- If applicable, forbidden visible internal terms/actions checked: DOM tests and existing forbidden transcript assertions cover fake full-auto, raw stdout, `TaskRun`, and `WorkerLease`.
- If applicable, duplicate primary action / in-flight suppression check: not applicable; no action buttons added.
- If applicable, high-impact action path result: no high-impact action path changed.
- If applicable, real App DOM / browser UI verification result when the behavior is product-visible: in-app browser checked `http://127.0.0.1:4370/`; screenshot saved under E-drive acceptance folder.
- If applicable, projection/unit evidence that supplements but does not replace visible-surface acceptance: targeted DOM/read-model and `test:workbench` passed.
- If applicable, tested with: `npx vitest run tests/unit/web-app.test.tsx tests/unit/workbench-read-model.test.ts`, `npm run test:workbench`, in-app browser visual pass.

## Reference-Driven UI / Product Source Evidence Coverage

- Reference-driven UI/product coverage applicable: yes.
- If applicable, reference map section inspected: `docs/design-docs/ref-desktop-cc-gui.md` Chat / Composer and runtime log sections.
- If applicable, reference source files or inspected commit used: local-only `reference-projects/desktop-cc-gui/src/features/messages/components/MessagesRows.tsx`, `Markdown.tsx`, `ToolBlockRenderer.tsx`, `BashToolBlock.tsx`, `GenericToolBlock.tsx`, `groupToolItems.ts`, and message/tool-block CSS.
- If applicable, controls copied / adapted / intentionally omitted: adapted user bubble, assistant transparent reading flow, and collapsed tool-row hierarchy; omitted full Markdown runtime, tool grouping, copy/retry/edit/fork/rewind buttons, and provider/session logic.
- If applicable, fake-control check: no new clickable action controls besides display expansion.
- If applicable, tested with: targeted DOM tests and in-app browser visual pass.

## Scoped Workbench Action Payload Coverage

- Scoped Workbench action payload coverage applicable: no.
- If applicable, checked target ids: not applicable.
- If applicable, tested action path: not applicable.
- If applicable, duplicate action/evidence affordance and in-flight duplicate submission check: not applicable.
- If not applicable, reason: change does not add or change Workbench live/server UI actions that depend on explicit target ids.

## Transcript Renderer Source-Boundary Coverage

- Transcript renderer source-boundary coverage applicable: yes.
- If applicable, canonical transcript projection checked: unchanged; components render existing `ParentAgentTranscriptCell` values.
- If applicable, assistant markdown source checked: MarkdownLite consumes only cell text from the existing projection.
- If applicable, process/tool row compactness checked: process/evidence rows collapse by default and expand only details/evidence refs.
- If applicable, derived workflow summary exclusion checked: existing forbidden transcript assertions remain and passed.
- If applicable, worker/role transcript scoping checked: unchanged by UI-only rendering.
- If applicable, private chain-of-thought exclusion checked: no new source is read or rendered.
- If applicable, tested with: `npx vitest run tests/unit/web-app.test.tsx tests/unit/workbench-read-model.test.ts`.

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
- If applicable, module owners checked: Workbench frontend panel owner.
- If applicable, moved responsibilities: transcript cell presentation and MarkdownLite moved to `TranscriptReadingSurface.tsx`.
- If applicable, retained facade responsibilities: `ConversationPanel.tsx` still owns Workbench tab layout, transcript paging, virtual range state, and shell composition.
- If applicable, forbidden write-back locations: backend, SQLite, Harness memory, workflow actions, source root, and runtime artifacts untouched.
- If applicable, compatibility surface: existing test ids and `.parent-agent-tool-result` selector preserved.
- If applicable, behavior path tested: Workbench DOM transcript rendering and read-model compatibility.
- If applicable, follow-up split candidates: none.
- If applicable, boundary tests or lint checks: targeted DOM tests, lint, typecheck.
- If applicable, compatibility result: passed.
- If applicable, tested with: `npm run typecheck`, `npm run lint`, targeted DOM/read-model tests.

## Core Mechanism Reuse Coverage

- Core mechanism reuse / architecture growth control coverage applicable: yes.
- If applicable, existing mechanisms reused or strengthened: virtual list, Pretext measurement, long folding, cell projection, evidence labels.
- If applicable, new cross-cutting mechanism and owner: small `TranscriptReadingSurface.tsx` display owner.
- If applicable, why existing mechanisms were insufficient: inline rendering in `ConversationPanel.tsx` made presentation evolution harder.
- If applicable, domain-specific logic location: transcript message/activity rendering.
- If applicable, shared cross-cutting logic location: height estimation remains in `transcriptMeasurement.ts`.
- If applicable, local framework / state machine / projection / validation / gate avoided: no new framework/state machine/projection/gate.
- If applicable, public API / facade / Workbench compatibility result: existing Workbench panel exports unchanged.
- If applicable, future-cost reduction result: future transcript polish can target the display owner without action/runtime changes.
- If applicable, tested with: typecheck, lint, DOM/read-model tests, build, Workbench aggregate.

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

