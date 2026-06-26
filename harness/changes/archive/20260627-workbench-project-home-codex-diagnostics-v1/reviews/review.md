# Review: workbench-project-home-codex-diagnostics-v1

Status: completed.

## Findings

No blocking findings.

Notes:

- Codex diagnostics is read-only and uses the existing Codex capability/config
  trust helpers; it does not write `config.toml`.
- The App shell only chooses between product entry surfaces and the existing
  Workbench. Confirmation, apply, close, scheduler, automation, remote, merge,
  PR, and Harness evolution authority paths are unchanged.
- The project home uses local UI state for add/create forms and no longer shares
  that state with the sidebar menu, avoiding duplicated form/button state.

## Verification

Passed.

- Selected verification scope: touched Workbench server route, Codex helper,
  project home/settings DOM, and aggregate Workbench shell.
- Full / aggregate suites run or skipped: `npm run test:workbench` was run and
  passed because the Workbench shell and DOM contract changed.
- Rationale for selected scope: the change adds a server read route, new
  product entry UI, settings panel, App-shell routing, and DOM behavior, so
  targeted route/DOM coverage plus the daily Workbench aggregate was required.
- If an aggregate Workbench / slow suite exceeded the tool window: record timeout, split suite members run, pass/fail status, and whether the timeout is product failure or verification runtime-cost debt.

## Complexity Deletion Review

- Complexity deletion review applicable: yes.
- delete: none.
- reuse: existing project registry/status, Harness init/trust actions, Codex
  capability/trust helpers, Workbench snapshot/status DTOs, sidebar shell, and
  `CodexTrustButton`.
- yagni: avoided provider matrix UI, normal Agent mode, settings persistence,
  central workflow DB, automatic Codex trust, automatic Harness init, and a new
  permission/action system.
- shrink: kept diagnostics as one read-only composition module and project
  entry as small UI owner components instead of redesigning the Workbench shell.
- net: Lean already.
- Note: this is supplemental and does not replace correctness, security, source safety, validation/audit, stale-target, ToolPolicyGate, human-gate, or required coverage checks.

## Acceptance Feedback

- Real/manual acceptance performed: yes, with in-app browser against E-drive
  external sandbox.
- Real Codex acceptance claimed: no.
- If real Codex acceptance is claimed, fake Codex / mocked PATH / fixture result / hand-written artifact exclusion evidence: not applicable.
- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: screenshot helper initially produced blank
  files when saved as `Buffer.from(object)`; the valid screenshots were saved
  after converting numeric-key objects to ordered byte arrays.
- Screenshots / artifacts / run ids:
  - `E:\aho-accept\project-home-v1\app-project-home.png`
  - `E:\aho-accept\project-home-v1\selected-project-home.png`
  - `E:\aho-accept\project-home-v1\direct-project-home.png`
  - `E:\aho-accept\project-home-v1\settings-panel.png`
- External source/state safety: source `E:\aho-accept\project-home-v1\src`,
  runtime home `E:\aho-accept\project-home-v1\home`. The source was only
  initialized for Harness readiness. `git status --short` showed `.agent-harness/`
  and `AGENTS.md`; no Codex run, source apply, remote, merge, PR, close, or
  Harness evolution was executed.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy Coverage

- Documentation entropy coverage applicable: yes.
- If applicable, documents checked: `AGENTS.md`, `docs/STATUS.md`,
  `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- If applicable, before/after line counts: after closeout edits,
  `AGENTS.md` 236, `docs/STATUS.md` 436,
  `docs/CURRENT-DEVELOPMENT-PLAN.md` 273.
- If applicable, duplicate current-state fields checked: latest product change
  points to
  `harness/changes/archive/20260627-workbench-project-home-codex-diagnostics-v1/summary.md`
  across the entry/handoff/current-plan docs; active/pending state remains
  `none`.
- If applicable, roadmap/current-direction stale language checked: next product
  direction now points to the remaining desktop product-layer slices instead of
  the already-implemented project home/diagnostics slice.
- If applicable, archive-ledger content promoted / retained / merged / retired /
  archive-only: retained only the current behavior delta; screenshot paths,
  DOM excerpts, and detailed verification stay in the active summary/review and
  future archive.
- If applicable, over-budget documents and rationale: `AGENTS.md` and
  `docs/STATUS.md` were already over target budget before this closeout. This
  change added only the shortest current routing facts needed for future agents.
- If applicable, tested with: `rg` for active paths/latest archive and Harness
  checks.
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

- Workbench / GUI read-model projection coverage applicable: yes.
- If applicable, checked scope: project status/readiness and Codex diagnostics
  are derived read surfaces only; they do not become workflow truth.
- If applicable, tested with:
  - `tests/unit/workbench-server.test.ts`
  - `tests/unit/web-app.test.tsx`
  - real browser DOM evidence for app project home, selected/direct project
    readiness, and settings panel.
- If not applicable, reason: not applicable.

## Workbench User-Surface Honesty Coverage

- Workbench user-surface honesty coverage applicable: yes.
- If applicable, sampled surface: app project home, selected/direct project
  readiness home, Codex diagnostics card, and settings panel.
- If applicable, visible primary UI backed by implemented workflow paths:
  add/create/init/trust remain explicit existing POST actions; diagnostics and
  settings are read-only.
- If applicable, authoritative primary-surface alignment checked across confirmation queue / decision inspector / visible primary card: not applicable.
- If applicable, stale-history override and running/archived selected-demand suppression checked: not applicable.
- If applicable, out-of-scope future capability check: DOM evidence showed no
  claim that Claude Code, OpenCode, Gemini, or normal Agent mode is implemented.
- If applicable, forbidden visible internal terms/actions checked: the new
  product entry uses Harness/Codex readiness language and does not expose
  scheduler/apply/merge/remote future actions as current actions.
- If applicable, duplicate primary action / in-flight suppression check: page
  load does not submit trust/init/create/workflow actions; action authority is
  unchanged.
- If applicable, high-impact action path result: no source apply, close,
  remote, merge, PR, or Harness evolution action is reachable from diagnostics
  or settings read state.
- If applicable, real App DOM / browser UI verification result when the behavior
  is product-visible: passed; screenshots and DOM excerpts are in `summary.md`.
- If applicable, projection/unit evidence that supplements but does not replace
  visible-surface acceptance: targeted DOM tests assert no write route is called
  on load and project/settings surfaces render.
- If applicable, tested with:
  - `tests/unit/web-app.test.tsx`
  - real browser DOM/screenshot acceptance.
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
- If applicable, checked boundary: Codex diagnostics reads CLI capability,
  config path, and project trust; it remains a runtime/project readiness
  diagnostic and does not become workflow truth or a config writer. SQLite
  remains interaction/projection storage; no workflow truth migrated.
- If applicable, tested with:
  - `tests/unit/workbench-server.test.ts`
  - `tests/unit/codex.test.ts`
  - real browser diagnostics card/settings panel.
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
- Future feature owner module: `src/server/workbench/codex-diagnostics.ts` for
  Codex readiness read model; `src/web/src/panels/ProjectHome.tsx` for project
  home/readiness/settings UI.
- If applicable, module owners checked: App shell only loads diagnostics and
  chooses the surface; rendering logic lives in project-home/settings owner
  components.
- If applicable, moved responsibilities: exported `CodexTrustButton` for reuse
  instead of duplicating trust UI logic.
- If applicable, retained facade responsibilities: `App.tsx` retains shell
  routing, selected project/topic state, and existing Workbench rendering.
- If applicable, forbidden write-back locations: no writes to `config.toml`,
  SQLite schema, Change artifacts, source root, Harness archive, or reference
  projects from diagnostics/page load.
- If applicable, compatibility surface: existing project, snapshot, add/create,
  init, and trust routes remain compatible.
- If applicable, behavior path tested: server diagnostics route and project home
  DOM paths.
- If applicable, follow-up split candidates: full settings persistence,
  provider capability matrix, project creation wizard, and Phase 2 composer/file
  reference UX.
- If applicable, boundary tests or lint checks:
  - `tests/unit/workbench-server.test.ts`
  - `tests/unit/web-app.test.tsx`
  - `npm run lint`
- If applicable, compatibility result: passed.
- If applicable, tested with: targeted suites and `npm run test:workbench`.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Coverage

- Core mechanism reuse / architecture growth control coverage applicable: yes.
- If applicable, existing mechanisms reused or strengthened: project registry,
  project status, Harness init/trust routes, Codex capability/trust helpers,
  Workbench snapshots, and existing explicit action routes.
- If applicable, new cross-cutting mechanism and owner: no new cross-cutting
  mechanism; only a thin diagnostics read model owner.
- If applicable, why existing mechanisms were insufficient: existing helpers
  were not exposed as a desktop product readiness card/API.
- If applicable, domain-specific logic location: Codex diagnostics in server
  Workbench read path; project home/settings rendering in Workbench web panels.
- If applicable, shared cross-cutting logic location: project/action authority
  remains in existing project admin and Workbench action owners.
- If applicable, local framework / state machine / projection / validation /
  gate avoided: no workflow runtime, permission system, central DB, provider
  matrix, settings engine, or new confirmation path.
- If applicable, public API / facade / Workbench compatibility result: existing
  routes remain compatible; new diagnostics routes are additive GET endpoints.
- If applicable, future-cost reduction result: establishes the Phase 1 product
  shell pattern for later files/Git/terminal/settings work without altering
  Harness truth.
- If applicable, tested with: targeted route/DOM suites and aggregate Workbench.
- If not applicable, reason: not applicable.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- If applicable, handoff files checked: `AGENTS.md`, `docs/STATUS.md`,
  `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- If applicable, stale active-path / phase grep: checked with `rg` for
  `harness/changes/active`, `Active ECL change`, `Active change`, and latest
  product path. Only generic loading instructions mention active paths.
- If applicable, latest archive / active path alignment: current docs point to
  expected archive
  `harness/changes/archive/20260627-workbench-project-home-codex-diagnostics-v1/summary.md`;
  no docs point at this active path as current state.
- If applicable, pending evolution state checked: `none`.
- If not applicable, reason: not applicable.

## Remote Handoff Acceptance Coverage

- Remote handoff coverage applicable: no.
- If applicable, checked provider/repository/action boundary: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect Draft PR creation/update, PR feedback refresh, provider capability detection, remote checks/reviews, or remote handoff evidence.

