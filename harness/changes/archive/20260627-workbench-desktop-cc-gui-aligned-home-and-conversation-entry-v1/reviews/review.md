# Review: workbench-desktop-cc-gui-aligned-home-and-conversation-entry-v1

Status: passed.

## Findings

No blocking findings.

## Verification

Passed.

- Selected verification scope: Workbench home / shell DOM, selected-project
  topic creation, settings diagnostics placement, and permission-mode toggle.
- Full / aggregate suites run or skipped: `npm run test:workbench` passed.
- Rationale for selected scope: this is a Workbench UI-shell change with no
  workflow runtime, validation/audit, apply/close, scheduler, or remote
  behavior change.
- Commands:
  - `npx vitest run tests/unit/web-app.test.tsx` passed.
  - `npm run typecheck` passed.
  - `npm run lint` passed.
  - `npm run test:fast` passed.
  - `npm run build` passed.
  - `npm run test:workbench` passed.
- If an aggregate Workbench / slow suite exceeded the tool window: record timeout, split suite members run, pass/fail status, and whether the timeout is product failure or verification runtime-cost debt.

## Complexity Deletion Review

- Complexity deletion review applicable: yes for product/code/Harness-template/rule changes; docs-only wording changes may mark this not applicable.
- delete: removed fake top refresh/home helper/recent/fake project-dropdown
  affordances from the selected-project home.
- reuse: reused existing App state, ProjectHome owner, DecisionPanels scoped
  automation mode semantics, topic creation API, settings overlay, and Codex
  diagnostics route.
- yagni: avoided project dropdown, recent-session chips, toolbar icon actions,
  provider/model selector, and future file/skill/attachment controls without
  real behavior.
- shrink: kept project switching in the sidebar and mode selection in the
  composer instead of introducing a new home-page shell framework.
- net: Lean already.
- Note: this is supplemental and does not replace correctness, security, source safety, validation/audit, stale-target, ToolPolicyGate, human-gate, or required coverage checks.

## Acceptance Feedback

- Real/manual acceptance performed: yes.
- Real Codex acceptance claimed: no.
- If real Codex acceptance is claimed, fake Codex / mocked PATH / fixture result / hand-written artifact exclusion evidence: not applicable.
- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: first UI restart inherited the wrong
  `AHO_HOME` and showed missing memory for `C:\Users\qinghui\projects\src`;
  server was restarted with `AHO_HOME=E:\aho-accept\desktop-home-ui-v1\home`.
- Screenshots / artifacts / run ids:
  `E:\aho-accept\desktop-home-ui-v1\screenshots\final-home-mode-toggle-clean.png`.
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
- If applicable, checked scope: selected-project no-topic home, settings
  diagnostics placement, demand topic creation, and permission-mode state.
- If applicable, tested with: `tests/unit/web-app.test.tsx`,
  `npm run test:workbench`, and real browser DOM/screenshot evidence.
- If not applicable, reason: not applicable.

## Workbench User-Surface Honesty Coverage

- Workbench user-surface honesty coverage applicable: yes.
- If applicable, sampled surface: selected-project home composer and settings
  advanced diagnostics.
- If applicable, visible primary UI backed by implemented workflow paths:
  demand creation uses the existing Workbench topic API; permission mode uses
  real request-approval/full-access UI state; settings opens the real settings
  surface.
- If applicable, authoritative primary-surface alignment checked across confirmation queue / decision inspector / visible primary card: no confirmation gate is shown on the no-topic home; created topics enter the existing Workbench surface.
- If applicable, stale-history override and running/archived selected-demand suppression checked: selected no-topic state does not show stale previous demand primary cards.
- If applicable, out-of-scope future capability check: unsupported file,
  skill, attachment, provider/model, recent-session, refresh, and fake project
  dropdown controls are hidden.
- If applicable, forbidden visible internal terms/actions checked: no raw
  scheduler, merge queue, automatic remote/merge, `TaskRun`, or `WorkerLease`
  text is shown on the home.
- If applicable, duplicate primary action / in-flight suppression check: not
  changed; no workflow action button is present on the no-topic home.
- If applicable, high-impact action path result: not applicable.
- If applicable, real App DOM / browser UI verification result when the behavior is product-visible: browser at `http://127.0.0.1:4344/` showed `创造任何东西`, project label `src`, Codex label, clickable `请求批准` / `完全访问权限` buttons with `aria-pressed`; after clicking full-access it stayed selected. Old helper text, `最近会话`, home Codex diagnostics, and fake refresh were absent.
- If applicable, projection/unit evidence that supplements but does not replace visible-surface acceptance: DOM tests cover the same surface and settings diagnostics.
- If applicable, tested with: `tests/unit/web-app.test.tsx`, `npm run test:workbench`, real browser screenshot.
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
- If applicable, checked boundary: Workbench UI-only entry surface; no Harness
  workflow truth, validation/audit, apply/close, scheduler, remote, merge, or
  Harness evolution runtime path changed.
- If applicable, tested with: `npm run test:fast`, `npm run test:workbench`,
  real browser no-action acceptance.
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
- Future feature owner module: Workbench frontend home / shell components.
- If applicable, module owners checked: `ProjectHome` owns the home composer;
  `App.tsx` only wires selected surface and global mode state;
  `DecisionPanels` retains confirmation-card behavior.
- If applicable, moved responsibilities: selected-project no-topic home moved
  from diagnostic dashboard to home composer.
- If applicable, retained facade responsibilities: App selection and handler
  wiring only.
- If applicable, forbidden write-back locations: no server route, workflow
  runtime, permission system, or durable memory write added.
- If applicable, compatibility surface: existing topic creation and settings
  diagnostics surfaces retained.
- If applicable, behavior path tested: home submit creates/selects topic;
  settings advanced shows Codex diagnostics; permission toggle changes state.
- If applicable, follow-up split candidates: future rich composer features
  should be separate product slices.
- If applicable, boundary tests or lint checks: DOM tests, lint, typecheck,
  build.
- If applicable, compatibility result: existing DecisionInspectorPane standalone
  tests remain compatible through internal fallback state.
- If applicable, tested with: listed verification commands.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Coverage

- Core mechanism reuse / architecture growth control coverage applicable: yes.
- If applicable, existing mechanisms reused or strengthened: topic creation,
  settings overlay, Codex diagnostics, selected project summaries, and existing
  scoped automation mode semantics.
- If applicable, new cross-cutting mechanism and owner: none.
- If applicable, why existing mechanisms were insufficient: not applicable;
  existing mechanisms were enough once the home surface was corrected.
- If applicable, domain-specific logic location: Workbench web home components.
- If applicable, shared cross-cutting logic location: existing Workbench topic
  and settings owners.
- If applicable, local framework / state machine / projection / validation / gate avoided: no new planner, provider registry, permission system, workflow runtime, or fake feature layer.
- If applicable, public API / facade / Workbench compatibility result: no
  external API contract change.
- If applicable, future-cost reduction result: rich composer and provider
  selector can be added later as real features without changing Harness truth.
- If applicable, tested with: listed verification commands.
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

