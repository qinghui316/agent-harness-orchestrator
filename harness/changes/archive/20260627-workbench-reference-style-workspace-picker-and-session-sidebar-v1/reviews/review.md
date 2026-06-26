# Review: workbench-reference-style-workspace-picker-and-session-sidebar-v1

Status: approved / ready to close.

## Findings

No blocking findings.

## Verification

- `npx vitest run tests/unit/web-app.test.tsx tests/unit/workbench-server.test.ts`
- `npx vitest run tests/unit/change.test.ts tests/unit/web-app.test.tsx --testNamePattern "non-latin|workspace picker|selected project home|creates a demand"`
- `npm run typecheck`
- `npm run lint`
- `npm run test:fast`
- `npm run build`
- `npm run test:workbench`

- Selected verification scope: Workbench DOM/server, Change id allocation,
  project/session shell, and aggregate fast / Workbench gates.
- Full / aggregate suites run or skipped: daily fast and Workbench aggregate
  suites passed; slow/release scheduler suites were not needed because this
  change does not alter scheduler runtime, apply/close, or source mutation.
- Rationale for selected scope: the touched boundaries are frontend shell,
  project/session projection usage, and demand Change id allocation.
- If an aggregate Workbench / slow suite exceeded the tool window: record timeout, split suite members run, pass/fail status, and whether the timeout is product failure or verification runtime-cost debt.

## Complexity Deletion Review

- Complexity deletion review applicable: yes for product/code/Harness-template/rule changes; docs-only wording changes may mark this not applicable.
- delete: removed the stale main-surface `刷新状态` affordance and the
  direct-project-only sidebar assumption that hid picker-selected projects.
- reuse: existing project registry, `ProjectAddForm`, `ProjectCreateForm`,
  `openProject -> refresh`, Workbench `topics` / `workpads`, and existing
  project routes.
- yagni: avoided a second project registry, session store, provider/model
  dropdown, fake toolbar, central DB, permission system, workflow runtime, and
  ordinary Agent mode.
- shrink: kept the new UI logic in one small `WorkspacePicker` owner and left
  action/confirmation logic unchanged.
- net: Small UI/test increase; no new durable workflow layer.
- Note: this is supplemental and does not replace correctness, security, source safety, validation/audit, stale-target, ToolPolicyGate, human-gate, or required coverage checks.

## Acceptance Feedback

- Real/manual acceptance performed: yes.
- Real Codex acceptance claimed: no.
- If real Codex acceptance is claimed, fake Codex / mocked PATH / fixture result / hand-written artifact exclusion evidence: not applicable.
- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: first server launch used the default
  `AHO_HOME`; restarted with the E-drive acceptance home. Real UI also exposed
  the direct sidebar visibility gap and non-Latin Change id collision, both
  fixed.
- Screenshots / artifacts / run ids:
  - `E:\aho-accept\workspace-picker-session-sidebar-v1\screenshots\01-home-composer-picker-collapsed-rail.png`
  - `E:\aho-accept\workspace-picker-session-sidebar-v1\screenshots\02-workspace-picker-open.png`
  - `E:\aho-accept\workspace-picker-session-sidebar-v1\screenshots\03-tools-sidebar-session-history.png`
  - `E:\aho-accept\workspace-picker-session-sidebar-v1\screenshots\04-ui-created-session-sidebar-history.png`
- External source/state safety: E-drive managed source projects were used for
  UI acceptance; no source apply/close/scheduler/remote/merge/PR/Harness
  evolution action was executed.
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
- If applicable, checked scope: project/session sidebar uses existing
  `topics` / `workpads` snapshots for all registered projects in direct mode;
  no new workflow projection truth was introduced.
- If applicable, tested with:
  `npx vitest run tests/unit/web-app.test.tsx tests/unit/workbench-server.test.ts`,
  `npm run test:fast`, `npm run test:workbench`, and real browser acceptance.
- If not applicable, reason: not applicable.

## Workbench User-Surface Honesty Coverage

- Workbench user-surface honesty coverage applicable: yes.
- If applicable, sampled surface: selected-project home, workspace picker,
  left project/session sidebar, active conversation header, and collapsed
  confirmation rail.
- If applicable, visible primary UI backed by implemented workflow paths:
  picker select/add/create all reuse real project paths; session rows open real
  topics; hidden fake toolbar/provider/model/recent controls stay absent.
- If applicable, authoritative primary-surface alignment checked across confirmation queue / decision inspector / visible primary card: unchanged; right confirmation rail/pane remains the executable surface.
- If applicable, stale-history override and running/archived selected-demand suppression checked: not applicable.
- If applicable, out-of-scope future capability check: no ordinary Agent mode,
  provider/model catalog, file/Skill/terminal/attachment tools, source apply,
  remote, merge, PR, or Harness evolution was surfaced as a fake control.
- If applicable, forbidden visible internal terms/actions checked: center home
  does not show recent-conversation cards or fake tool hints; sidebar uses
  user-facing session rows.
- If applicable, duplicate primary action / in-flight suppression check: not applicable.
- If applicable, high-impact action path result: not applicable.
- If applicable, real App DOM / browser UI verification result when the behavior is product-visible: passed on `http://127.0.0.1:4352/` with E-drive projects and screenshots.
- If applicable, projection/unit evidence that supplements but does not replace visible-surface acceptance: DOM tests cover picker/search/select/add/create visibility, sidebar sessions, demand creation, and absent fake controls.
- If applicable, tested with: see verification list.
- If not applicable, reason: not applicable.

## Reference-Driven UI / Product Source Evidence Coverage

- Reference-driven UI/product coverage applicable: yes.
- If applicable, reference map section inspected:
  `docs/design-docs/ref-desktop-cc-gui.md` product shell / HomeChat entry.
- If applicable, reference source files or inspected commit used: local
  `reference-projects/desktop-cc-gui` HomeChat and HomeChat test evidence from
  the prior plan/review; the reference center home uses workspace selector plus
  composer and its tests do not require recent conversations in the center.
- If applicable, controls copied / adapted / intentionally omitted:
  adapted workspace selector + centered composer + left session list; omitted
  reference-only normal Agent toolbar controls until AHO has real file/Skill/
  terminal/attachment/provider/model implementations.
- If applicable, fake-control check: passed; controls without a real path are
  hidden instead of rendered disabled/no-op.
- If applicable, tested with: DOM tests and real browser screenshots.
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
- Future feature owner module: `src/web/src/panels/WorkspacePicker.tsx`.
- If applicable, module owners checked: `WorkspacePicker` owns project picker
  UI; `ProjectHome` owns selected-project home composition; `sidebar.tsx`
  owns project/session sidebar projection display; `src/change/creation.ts`
  owns demand Change id allocation.
- If applicable, moved responsibilities: workspace selection UI moved out of
  static home markup into a small owner; no action/permission logic moved.
- If applicable, retained facade responsibilities: `App.tsx` remains wiring
  and data refresh owner only.
- If applicable, forbidden write-back locations: not applicable.
- If applicable, compatibility surface: not applicable.
- If applicable, behavior path tested: picker open/search/select, project
  add/create forms, session row open, new demand appearing in sidebar, and
  non-Latin Change id uniqueness.
- If applicable, follow-up split candidates: file refs, slash commands,
  attachments, Skills, file tree, Git, terminal, and full settings remain
  separate product-layer slices.
- If applicable, boundary tests or lint checks: DOM/server tests, Change tests,
  lint/typecheck/build.
- If applicable, compatibility result: existing Workbench action and
  confirmation authority are unchanged.
- If applicable, tested with: see verification list.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Coverage

- Core mechanism reuse / architecture growth control coverage applicable: yes.
- If applicable, existing mechanisms reused or strengthened: project registry,
  Workbench snapshots, topics/workpads, existing project add/create forms,
  existing open/select refresh path, and existing Change creation.
- If applicable, new cross-cutting mechanism and owner: none.
- If applicable, why existing mechanisms were insufficient: only the UI entry
  was missing a picker trigger; backend/project/session mechanisms already
  existed.
- If applicable, domain-specific logic location: not applicable.
- If applicable, shared cross-cutting logic location: not applicable.
- If applicable, local framework / state machine / projection / validation / gate avoided: no new DB, session store, registry, permission system, workflow runtime, or projection framework.
- If applicable, public API / facade / Workbench compatibility result:
  existing APIs remain compatible; UI consumes current routes.
- If applicable, future-cost reduction result: future product-shell slices can
  reuse the picker/sidebar owner instead of adding central-home fake controls.
- If applicable, tested with: see verification list.
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

