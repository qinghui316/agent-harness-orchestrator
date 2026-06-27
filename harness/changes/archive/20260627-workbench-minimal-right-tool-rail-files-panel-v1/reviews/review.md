# Review: workbench-minimal-right-tool-rail-files-panel-v1

Status: ready to close.

## Findings

No blocking findings.

- The right tool rail remains a projection/UI shell. `DecisionInspectorPane`
  still owns confirmation execution and no file panel control submits workflow
  actions.
- File APIs reuse the same project-root safety model as composer file
  references. Unsafe paths, ignored directories, symlinks, and oversized files
  do not become previewable project context.
- The UI intentionally exposes only `确认` and `文件`. Browser/Git/terminal/log
  controls remain absent until real feature owners exist.

## Verification

Completed.

- Selected verification scope: file reference helper, Workbench server routes,
  Workbench DOM shell, full fast suite, build, Workbench aggregate.
- Full / aggregate suites run or skipped: `npm run test:workbench` passed;
  slow/release suites skipped because this change does not alter scheduler,
  apply, validation/audit, or remote behavior.
- Rationale for selected scope: the change touches Workbench shell/DOM and
  project-scoped read-only file APIs, so targeted DOM/server/helper tests plus
  fast/build/workbench aggregate are sufficient.
- If an aggregate Workbench / slow suite exceeded the tool window: record timeout, split suite members run, pass/fail status, and whether the timeout is product failure or verification runtime-cost debt.
  Not applicable.

## Complexity Deletion Review

- Complexity deletion review applicable: yes for product/code/Harness-template/rule changes; docs-only wording changes may mark this not applicable.
- delete: old single-purpose decision shell wrapper replaced by
  `RightToolRailShell`; no future placeholder tool buttons retained.
- reuse: existing `DecisionInspectorPane`, composer file refs, Workbench server
  project resolution, and `file-references` safety helper were reused.
- yagni: avoided editable file manager, tab registry, new workflow action path,
  central DB, permission system, and future browser/Git/terminal/log tabs.
- shrink: kept the files panel read-only and route-level; did not introduce a
  second file index, editor state, or durable UI preference.
- net: Lean already.
- Note: this is supplemental and does not replace correctness, security, source safety, validation/audit, stale-target, ToolPolicyGate, human-gate, or required coverage checks.

## Acceptance Feedback

- Real/manual acceptance performed: yes, with in-app browser.
- Real Codex acceptance claimed: no.
- If real Codex acceptance is claimed, fake Codex / mocked PATH / fixture result / hand-written artifact exclusion evidence: not applicable.
- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids:
  `E:\aho-accept\minimal-right-tool-rail-files-v1\collapsed-rail.png`,
  `E:\aho-accept\minimal-right-tool-rail-files-v1\files-tab-preview.png`,
  `E:\aho-accept\minimal-right-tool-rail-files-v1\confirm-tab.png`.
- External source/state safety: acceptance source
  `E:\aho-accept\minimal-right-tool-rail-files-v1\src`, runtime home
  `E:\aho-accept\minimal-right-tool-rail-files-v1\home`; file panel was
  read-only and no source mutation or workflow action ran.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: acceptance project was not
  initialized, so composer chip visibility was not present in that screenshot;
  `tests/unit/web-app.test.tsx` covers file tab insertion into composer state.

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
- If applicable, checked scope: right rail shell and files panel consume
  existing selected project and confirmation queue without altering read-model
  authority.
- If applicable, tested with:
  `npx vitest run tests/unit/file-references.test.ts tests/unit/workbench-server.test.ts tests/unit/web-app.test.ts`,
  `npm run test:workbench`, and in-app browser screenshots.
- If not applicable, reason: not applicable.

## Workbench User-Surface Honesty Coverage

- Workbench user-surface honesty coverage applicable: yes.
- If applicable, sampled surface: collapsed rail, `确认` tab, `文件` tab.
- If applicable, visible primary UI backed by implemented workflow paths:
  confirmation actions remain only inside `DecisionInspectorPane`; file tab
  has no confirmation or workflow buttons.
- If applicable, authoritative primary-surface alignment checked across confirmation queue / decision inspector / visible primary card: checked by DOM tests and real UI; files tab does not create a second primary surface.
- If applicable, stale-history override and running/archived selected-demand suppression checked: not applicable.
- If applicable, out-of-scope future capability check: no browser/Git/terminal/log tabs or fake controls were visible.
- If applicable, forbidden visible internal terms/actions checked: not applicable.
- If applicable, duplicate primary action / in-flight suppression check: not applicable.
- If applicable, high-impact action path result: not applicable.
- If applicable, real App DOM / browser UI verification result when the behavior is product-visible: passed with screenshots listed above.
- If applicable, projection/unit evidence that supplements but does not replace visible-surface acceptance: targeted DOM/server/helper tests passed.
- If applicable, tested with: targeted suites, `npm run test:workbench`, in-app browser.
- If not applicable, reason: not applicable.

## Reference-Driven UI / Product Source Evidence Coverage

- Reference-driven UI/product coverage applicable: yes.
- If applicable, reference map section inspected:
  `docs/design-docs/ref-desktop-cc-gui.md` app shell / Files domain.
- If applicable, reference source files or inspected commit used:
  `reference-projects/desktop-cc-gui/src/features/layout/hooks/useLayoutNodes.tsx`,
  `reference-projects/desktop-cc-gui/src/features/layout/components/DesktopLayout.tsx`,
  `reference-projects/desktop-cc-gui/src/features/files/components/FileTreePanel.tsx`,
  `reference-projects/desktop-cc-gui/src/features/files/components/FileViewPanel.tsx`.
- If applicable, controls copied / adapted / intentionally omitted: adapted
  right-panel mode + file tree/preview shape; intentionally omitted editor,
  search/notes/prompts/memory/activity/radar/Git tabs and write features.
- If applicable, fake-control check: DOM tests and screenshot confirmed only
  `确认` / `文件` tabs.
- If applicable, tested with: targeted DOM tests and real UI screenshots.
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
- Future feature owner module: Workbench right tool shell and read-only files panel.
- If applicable, module owners checked:
  `src/web/src/panels/workbench/DecisionPaneShell.tsx`,
  `src/web/src/panels/workbench/ProjectFilesPanel.tsx`,
  `src/workbench/file-references.ts`,
  `src/server/workbench/api-router.ts`.
- If applicable, moved responsibilities: shell layout moved from decision-only
  wrapper into `RightToolRailShell`; confirmation logic stayed in
  `DecisionInspectorPane`.
- If applicable, retained facade responsibilities: `App.tsx` only wires state
  and panels; file safety and preview stay in backend/helper owners.
- If applicable, forbidden write-back locations: not applicable.
- If applicable, compatibility surface: not applicable.
- If applicable, behavior path tested: file tree/preview/reference insertion
  and confirmation-tab isolation.
- If applicable, follow-up split candidates: not applicable.
- If applicable, boundary tests or lint checks: not applicable.
- If applicable, compatibility result: not applicable.
- If applicable, tested with: targeted suites and Workbench aggregate.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Coverage

- Core mechanism reuse / architecture growth control coverage applicable: yes.
- If applicable, existing mechanisms reused or strengthened: existing composer
  file reference context, file safety rules, decision inspector, Workbench
  project routing, and collapsed rail layout.
- If applicable, new cross-cutting mechanism and owner: not applicable.
- If applicable, why existing mechanisms were insufficient: not applicable.
- If applicable, domain-specific logic location: not applicable.
- If applicable, shared cross-cutting logic location: not applicable.
- If applicable, local framework / state machine / projection / validation / gate avoided: no file index DB, no right-tool registry, no workflow action/projection rewrite.
- If applicable, public API / facade / Workbench compatibility result: not applicable.
- If applicable, future-cost reduction result: not applicable.
- If applicable, tested with: targeted suites, typecheck, lint, fast, build,
  Workbench aggregate, in-app browser.
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

