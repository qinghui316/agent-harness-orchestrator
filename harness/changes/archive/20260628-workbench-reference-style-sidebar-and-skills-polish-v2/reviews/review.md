# Review: workbench-reference-style-sidebar-and-skills-polish-v2

Status: approved.

## Findings

No blocking findings.

## Verification

- Selected verification scope: Workbench shell/sidebar, project registry,
  Skills UI/API, and aggregate Workbench read-model suites.
- Targeted suites:
  `npx vitest run tests/unit/web-app.test.tsx tests/unit/workbench-server.test.ts tests/unit/skill-bridge.test.ts tests/unit/registry.test.ts`
  passed (108 tests).
- Full / aggregate suites run:
  `npm run typecheck`, `npm run lint`, `npm run test:fast`,
  `npm run build`, and `npm run test:workbench` all passed.
- Rationale for selected scope: the change is product-shell UI and Skills
  availability polish. It does not alter scheduler, apply/close, Goal Loop,
  validation/audit, or workflow truth behavior.
- If an aggregate Workbench / slow suite exceeded the tool window: record timeout, split suite members run, pass/fail status, and whether the timeout is product failure or verification runtime-cost debt.

## Complexity Deletion Review

- Complexity deletion review applicable: yes for product/code/Harness-template/rule changes; docs-only wording changes may mark this not applicable.
- delete: ordinary sidebar menu actions for refresh, preparation, and Codex
  trust were removed from the project row menu.
- reuse: reused existing sidebar project menu, Settings surface,
  `SkillsSettingsView`, Skills API, project registry removal, and lazy run-graph
  projection.
- yagni: avoided new menu framework, new Skill store, provider matrix,
  marketplace, workflow action path, or project preparation runtime.
- shrink: custom Skill root management moved into a secondary disclosure; native
  Codex Skill copy now uses the existing runtime status instead of project-level
  enable/sync controls.
- net: modest UI reduction; no new cross-cutting layer.
- Note: this is supplemental and does not replace correctness, security, source safety, validation/audit, stale-target, ToolPolicyGate, human-gate, or required coverage checks.

## Acceptance Feedback

- Real/manual acceptance performed: yes.
- Real Codex acceptance claimed: no.
- If real Codex acceptance is claimed, fake Codex / mocked PATH / fixture result / hand-written artifact exclusion evidence: not applicable.
- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids:
  `E:\aho-accept\sidebar-skills-polish-v2\screenshots\01-sidebar-home.png`,
  `E:\aho-accept\sidebar-skills-polish-v2\screenshots\02-project-menu.png`,
  `E:\aho-accept\sidebar-skills-polish-v2\screenshots\03-skills.png`.
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
- If applicable, checked scope: selected topic graph projection remains lazy and
  visible from the conversation workspace; historical read-only access test uses
  an explicit topic deeplink.
- If applicable, tested with:
  `npx vitest run tests/unit/web-app.test.tsx tests/unit/workbench-server.test.ts tests/unit/skill-bridge.test.ts tests/unit/registry.test.ts`
  and `npm run test:workbench`.
- If not applicable, reason: not applicable.

## Workbench User-Surface Honesty Coverage

- Workbench user-surface honesty coverage applicable: yes.
- Product-visible Workbench controls are applicable unless the review records why they cannot affect user decisions; do not mark this section not applicable only because the control does not change the authoritative primary decision surface.
- If applicable, sampled surface: left sidebar project menu, project new-chat
  entry, Settings > Skills page, and conversation workspace graph tab.
- If applicable, visible primary UI backed by implemented workflow paths:
  project removal remains registry-only, new chat remains draft-only until first
  demand, and Skills selection remains runtime capability context.
- If applicable, authoritative primary-surface alignment checked across confirmation queue / decision inspector / visible primary card: confirmation rail unchanged.
- If applicable, stale-history override and running/archived selected-demand suppression checked: existing history read-only opening no longer requires project preparation.
- If applicable, out-of-scope future capability check: no fake provider,
  marketplace, terminal/browser, prepare/trust, PR/remote/merge, or scheduler
  controls were added.
- If applicable, forbidden visible internal terms/actions checked: ordinary
  sidebar and Skills page avoid `Harness`, `memory`, `AHO_HOME`, `TaskGraph`,
  `SchedulerRun`, Skill ID, hash, and raw runtime payload.
- If applicable, duplicate primary action / in-flight suppression check: not changed.
- If applicable, high-impact action path result: no source mutation, apply,
  close, scheduler, remote, merge, PR, or Harness evolution action was triggered.
- If applicable, real App DOM / browser UI verification result when the behavior is product-visible: browser smoke on `http://127.0.0.1:4413/?project=aho-self` captured screenshots and confirmed native Skills show as `Codex 可用` without enable/sync buttons.
- If applicable, projection/unit evidence that supplements but does not replace visible-surface acceptance: web DOM tests cover menu contents, historical conversation graph access, and Skills detail behavior.
- If applicable, tested with: targeted web/server/skill/registry suites and real browser smoke.
- If not applicable, reason: not applicable.

## Reference-Driven UI / Product Source Evidence Coverage

- Reference-driven UI/product coverage applicable: yes.
- If applicable, reference map section inspected:
  `docs/design-docs/ref-desktop-cc-gui.md` and `docs/references/index.md`.
- If applicable, reference source files or inspected commit used:
  `reference-projects/desktop-cc-gui/src/features/app/hooks/useSidebarMenus.ts`,
  `reference-projects/desktop-cc-gui/src/features/app/components/SidebarWorkspaceMenuOverlay.tsx`,
  `reference-projects/desktop-cc-gui/src/features/skills/hooks/useSkills.ts`,
  and `reference-projects/desktop-cc-gui/src/features/curated-skills/components/CuratedSection.tsx`.
- If applicable, controls copied / adapted / intentionally omitted: adapted the
  lightweight workspace menu and runtime Skills browsing pattern; intentionally
  omitted unsupported refresh/trust/prepare row actions, provider matrix,
  marketplace, and non-Codex runtime targets.
- If applicable, fake-control check: passed through DOM tests and browser smoke.
- If applicable, tested with: targeted web tests plus real browser screenshots.
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
- If applicable, checked boundary: native/global Codex Skills stay runtime
  native and do not enter AHO bridge copy list; custom/AHO-managed Skills keep
  existing sync status and bridge path.
- If applicable, tested with:
  `npx vitest run tests/unit/skill-bridge.test.ts` and the combined targeted
  suite.
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
- If applicable, module owners checked: `src/web/src/shell/sidebar.tsx`,
  `src/web/src/panels/SkillsSettingsView.tsx`, `src/web/src/App.tsx`, and
  `src/web/src/styles.css`.
- If applicable, moved responsibilities: none; UI responsibilities stayed in
  existing shell/settings owners.
- If applicable, retained facade responsibilities: confirmation rail and
  action revalidation unchanged.
- If applicable, forbidden write-back locations: no Harness workflow truth,
  source root, Codex global Skills, or project evidence writes added.
- If applicable, compatibility surface: existing APIs and settings routes reused.
- If applicable, behavior path tested: menu, draft new chat, historical topic
  graph access, Skills browsing, and native/custom Skill status.
- If applicable, follow-up split candidates: none required.
- If applicable, boundary tests or lint checks: targeted DOM/API tests, lint,
  typecheck, test:fast, build, test:workbench.
- If applicable, compatibility result: passed.
- If applicable, tested with: listed verification commands.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Coverage

- Core mechanism reuse / architecture growth control coverage applicable: yes.
- If applicable, existing mechanisms reused or strengthened: existing sidebar,
  settings Skills view, project registry, Skill catalog/bridge APIs, and lazy
  run-graph projection.
- If applicable, new cross-cutting mechanism and owner: none.
- If applicable, why existing mechanisms were insufficient: not applicable;
  existing owners were sufficient.
- If applicable, domain-specific logic location: UI shell and Skills settings
  components only.
- If applicable, shared cross-cutting logic location: unchanged.
- If applicable, local framework / state machine / projection / validation / gate avoided: avoided.
- If applicable, public API / facade / Workbench compatibility result: compatible.
- If applicable, future-cost reduction result: fewer ordinary-menu actions and
  clearer Skills availability semantics reduce user-facing confusion.
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

