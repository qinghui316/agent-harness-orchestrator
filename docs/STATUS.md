# Project Status

## Current Handoff

- Current date: 2026-06-28.
- Active ECL change: none.
- Pending Harness evolution:
  `harness/evolution/pending.md` (generated after
  `workbench-reference-style-product-shell-polish-v1`; do not auto-apply).
- Latest archived product change:
  `harness/changes/archive/20260628-workbench-reference-style-product-shell-polish-v1/summary.md`.
- Previous archived product change:
  `harness/changes/archive/20260628-workbench-reference-style-left-sidebar-and-project-preparation-ux-v1/summary.md`.
- Previous archived product change:
  `harness/changes/archive/20260628-workbench-reference-style-app-data-and-real-codex-skills-v1/summary.md`.
- Previous archived product change:
  `harness/changes/archive/20260628-workbench-reference-style-sidebar-settings-skills-ui-v1/summary.md`.
- Previous archived product change:
  `harness/changes/archive/20260628-workbench-ui-acceptance-deeplink-restore-v1/summary.md`.
- Previous archived product change:
  `harness/changes/archive/20260627-workbench-reference-style-subtle-transcript-activity-rows-v1/summary.md`.
- Previous archived product change:
  `harness/changes/archive/20260627-workbench-reference-style-transcript-reading-surface-v1/summary.md`.
- Previous archived product change:
  `harness/changes/archive/20260627-workbench-reference-style-readonly-git-status-diff-panel-v1/summary.md`.
- Previous archived product change:
  `harness/changes/archive/20260627-workbench-reference-style-codex-runtime-model-picker-v1/summary.md`.
- Previous archived product change:
  `harness/changes/archive/20260627-workbench-reference-style-codex-model-selection-v1/summary.md`.
- Previous archived product change:
  `harness/changes/archive/20260627-workbench-minimal-right-tool-rail-files-panel-v1/summary.md`.
- Previous archived product change:
  `harness/changes/archive/20260627-workbench-reference-style-file-reference-composer-v1/summary.md`.
- Previous archived product change:
  `harness/changes/archive/20260627-workbench-reference-style-skills-catalog-and-codex-bridge-v1/summary.md`.
- Latest completed Harness evolution:
  `harness/changes/archive/20260628-auto-evolve-post-ui-transcript-deeplink-window/summary.md`
  (`docs_merge`; subagent Descartes score 86; existing ECL/template coverage
  sufficient, no new Harness rule/template needed, pending evolution marked
  complete).

## Latest Product Closeout

`harness/changes/archive/20260628-workbench-reference-style-product-shell-polish-v1/summary.md`.

It polishes the Harness-mode product shell toward the `desktop-cc-gui`
reference: the project home is now a sparse creation surface (`创造任何东西`,
workspace picker, composer), project add/create lives in the workspace picker,
ordinary Settings/Skills views hide technical internals, and home/settings no
longer show the bottom technical status footer. Browser smoke screenshots are
under `E:\aho-accept\product-shell-polish-v1\screenshots`.

Previous closeout:
`harness/changes/archive/20260628-workbench-reference-style-left-sidebar-and-project-preparation-ux-v1/summary.md`.

It aligns the ordinary Workbench left sidebar and project preparation flow with
the `desktop-cc-gui` product interaction style: the sidebar is project/session
navigation only, unprepared projects use "项目准备" language, quick new
conversation does not create empty topics, and first demand submission can run
deterministic project preparation before topic/change creation. Technical
Harness/memory details remain in advanced diagnostics.

Previous closeout:
`harness/changes/archive/20260628-workbench-reference-style-app-data-and-real-codex-skills-v1/summary.md`.

It aligns AHO project history and Skills with the `desktop-cc-gui` style
runtime model: default app data resolves to the user-home `.agent-harness`
directory, projects can be saved from direct/temporary opens into the stable
registry, `$CODEX_HOME/skills` are discovered as native read-only Codex Skills,
and only custom/managed/project Skills materialize through the AHO-managed
Codex bridge. Old `E:\aho-accept` acceptance temp children were safely cleaned.

Previous closeout:
`harness/changes/archive/20260628-workbench-reference-style-sidebar-settings-skills-ui-v1/summary.md`.

It realigns the Harness-mode product shell with the `desktop-cc-gui`
interaction model: settings are now a center workspace surface with categories,
Skills have a dedicated settings management view, the left sidebar uses compact
project/session navigation and a lightweight project menu, quick new
conversation only clears/focuses the composer until the first demand is sent,
and ordinary home/settings surfaces no longer show fake or over-technical
controls. Real browser screenshots were captured under
`E:\aho-accept\reference-sidebar-settings-skills-v1\screenshots`.

Previous closeout:
`harness/changes/archive/20260628-workbench-ui-acceptance-deeplink-restore-v1/summary.md`.

It fixes Workbench real-UI acceptance restore: clean browser profiles now
validate URL/direct project inputs and can open deterministic project/topic/tab
views instead of relying on previous localStorage selection. Real headless
screenshots were captured under `E:\aho-accept\deeplink-restore-v1`.

Previous closeout:
`harness/changes/archive/20260627-workbench-reference-style-subtle-transcript-activity-rows-v1/summary.md`.

It quiets Workbench transcript activity rows to match the `desktop-cc-gui`
visual hierarchy: ordinary completed tool/process/evidence/Agent events are
compact, low-contrast disclosure rows; duplicate title/status summaries are
suppressed; and error/blocker rows remain visibly distinct. It preserves
cursor paging, virtual rendering, Pretext height estimates, long-message
folding, and existing transcript workflow boundaries.

Previous closeout:
`harness/changes/archive/20260627-workbench-reference-style-transcript-reading-surface-v1/summary.md`.

It makes the Workbench transcript closer to the `desktop-cc-gui` reading
surface: user prompts are lightweight right-aligned bubbles, assistant output
is a clean Markdown reading flow, and runtime/evidence output is a compact
expandable activity row.

Previous closeout:
`harness/changes/archive/20260627-workbench-reference-style-readonly-git-status-diff-panel-v1/summary.md`.

It adds a reference-style readonly Git tool to the right rail: branch/dirty
status, staged/unstaged/untracked groups, file reference insertion, and a center
`Git Diff` viewer for selected files. It does not add stage, discard, commit,
push, PR, merge, remote, or any Harness workflow action.

Previous closeout:
`harness/changes/archive/20260627-workbench-reference-style-codex-runtime-model-picker-v1/summary.md`.

It tightens Codex-only model selection to reference-style runtime semantics:
AHO reads Codex `config.toml`, best-effort reads project-scoped runtime model
candidates, falls back to the Codex default, and persists only selections from
real candidates. Arbitrary custom model ids are ignored/cleaned, raw
`model/list` stderr is kept out of the ordinary composer/picker UI, and browser
refresh restores the last valid selected project. It does not edit Codex
config, add non-Codex providers, expose fake provider controls, or change
Harness workflow truth.

## Current Baseline

- Local manual-gated Workbench has real acceptance through planning, code,
  validation/audit, human apply, and close/archive.
- Harness-mode product entry now follows the `desktop-cc-gui` reference for
  the current implemented surface: sparse project/session sidebar, centered
  `创造任何东西` composer, workspace picker, real execution-mode control strip,
  real Codex runtime/config model selection, Skills catalog, Codex bridge sync, `/skill`
  composer selection, and `@file` project file references.
  Clean browser profiles can restore a direct-served project or explicit
  `?project=&topic=&tab=` Workbench URL without prior localStorage state.
- The right side is a single collapsed tool rail. Expanded, it contains only
  real implemented tools: `确认`, `文件`, and `Git`. Confirmation remains the
  existing decision inspector; files are read-only project tree/preview/reference
  tools; Git is a read-only status/diff/reference tool with the diff shown in
  the center workspace. Browser, terminal, log, editor, upload, Git write
  operations, and fake future controls stay hidden.
- Unsupported reference-style controls remain hidden until their behavior
  exists. Do not expose fake provider/model dropdowns, file/attachment tools,
  marketplace, terminal, Git, or ordinary Agent-mode controls as clickable UI.
- `请求批准` and scoped `完全访问权限` share the local Goal Loop coordinator.
  Plan confirmation remains human. Scoped full-access may consume only current
  Change local gates after plan confirmation; raw scheduler, manual
  IntegrationCheck, integration apply/discard, PR, remote, merge, and Harness
  evolution remain excluded.
- Workbench transcripts use cursor-incremental SQLite message paging, virtual
  rendering, long-message folding, and `@chenglou/pretext` height estimates.
  The reading surface is reference-style: user prompts are lightweight,
  assistant output is clean Markdown prose, and ordinary tool/Agent activity is
  low-noise expandable context while errors/blockers remain visible.
  Workflow truth remains Change/artifact/validation/audit/apply/close evidence,
  not SQLite transcript paging.
- `Agent 编排图` is a read-only projection with Rudder-style canvas, avatars,
  SVG edges, and pan/zoom/fit. It does not execute actions or replace
  `confirmationQueue.primary`.
- Real scheduler acceptance has reached same-Change worker worktrees,
  validation/audit, ready IntegrationCandidate, manual IntegrationCheck,
  aggregate validation/audit, and human integration apply/discard. Full
  parallel executor, child Change creation, remote merge/PR, and automatic
  Harness evolution remain future work.

## Next Resume Point

Product work should continue from `docs/design-docs/ref-desktop-cc-gui.md`.
Good next slices are actual skill-usage evidence,
provider capability matrix,
project creation/open/restore polish, runtime diagnostics, terminal, browser,
attachment panels, Git write/history flows, or file editing once each has real
behavior.

Do not widen `完全访问权限` into raw scheduler, manual IntegrationCheck,
integration apply/discard, PR/remote/merge, Harness evolution, or full parallel
execution without a separate structured change.

## Verification Commands

Harness/documentation verification:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check
```

Product verification when product code changes:

```powershell
npm run typecheck
npm run lint
npm run test:fast
npm run build
npm run test:workbench
```

## Archive Lookup

Use `harness/changes/INDEX.json` for historical detail. Start with archived
`summary.md` files; open specs, plans, reviews, screenshots, E-drive paths, or
source only when the current task needs that evidence.

Detailed historical phase narratives are archive-only. Do not copy them back
into this handoff unless they change current agent decisions.
