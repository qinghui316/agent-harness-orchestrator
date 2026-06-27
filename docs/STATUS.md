# Project Status

## Current Handoff

- Current date: 2026-06-27.
- Active ECL change: none.
- Pending Harness evolution: none.
- Latest archived product change:
  `harness/changes/archive/20260627-workbench-minimal-right-tool-rail-files-panel-v1/summary.md`.
- Previous archived product change:
  `harness/changes/archive/20260627-workbench-reference-style-file-reference-composer-v1/summary.md`.
- Previous archived product change:
  `harness/changes/archive/20260627-workbench-reference-style-slash-skill-composer-v1/summary.md`.
- Previous archived product change:
  `harness/changes/archive/20260627-workbench-reference-style-skills-catalog-and-codex-bridge-v1/summary.md`.
- Latest completed Harness evolution:
  `harness/changes/archive/20260627-auto-evolve-post-slash-skill-window/summary.md`
  (`docs_merge`; subagent Singer score 82; existing ECL coverage sufficient,
  compact AGENTS/STATUS/CURRENT handoff alignment applied).

## Latest Product Closeout

`harness/changes/archive/20260627-workbench-minimal-right-tool-rail-files-panel-v1/summary.md`.

It replaces the right confirmation shell with a minimal right tool rail. The
collapsed state is one panel button; expanded state exposes only implemented
tabs: `确认` for the existing decision inspector and `文件` for safe read-only
project file browsing, text preview, and composer file-reference insertion.
No file tab control executes workflow actions or changes Harness truth.

## Current Baseline

- Local manual-gated Workbench has real acceptance through planning, code,
  validation/audit, human apply, and close/archive.
- Harness-mode product entry now follows the `desktop-cc-gui` reference for
  the current implemented surface: sparse project/session sidebar, centered
  `创造任何东西` composer, workspace picker, real execution-mode control strip,
  Skills catalog, Codex bridge sync, `/skill` composer selection, and `@file`
  project file references.
- The right side is a single collapsed tool rail. Expanded, it contains only
  `确认` and `文件`: confirmation remains the existing decision inspector, while
  files are read-only project tree/preview/reference tools. Browser, Git,
  terminal, log, editor, upload, and fake future controls stay hidden.
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
Good next slices are actual skill-usage evidence, model settings, provider
capability matrix, project creation/open/restore polish, runtime diagnostics,
Git, terminal, browser, attachment panels, or file editing once each has real
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
