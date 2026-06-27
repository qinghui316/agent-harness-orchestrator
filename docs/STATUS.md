# Project Status

## Current Handoff

- Current date: 2026-06-27.
- Active ECL change: none.
- Pending Harness evolution: none.
- Latest archived product change:
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

`harness/changes/archive/20260627-workbench-reference-style-file-reference-composer-v1/summary.md`.

It adds reference-style `@file` project file references to the home and topic
composer. File search is selected-project scoped and excludes unsafe/cache
paths; selected refs become chips, are removed from submitted text, bind to the
first/current user message, and appear in Codex runtime context as relative
paths/kinds only. File refs remain runtime context only and do not alter
Harness workflow truth, confirmation queues, apply/close, scheduler, remote,
merge, PR, or Harness evolution.

## Current Baseline

- Local manual-gated Workbench has real acceptance through planning, code,
  validation/audit, human apply, and close/archive.
- Harness-mode product entry now follows the `desktop-cc-gui` reference for
  the current implemented surface: sparse project/session sidebar, centered
  `创造任何东西` composer, workspace picker, real execution-mode control strip,
  Skills catalog, Codex bridge sync, `/skill` composer selection, and `@file`
  project file references.
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

Git-settle the completed Harness evolution if not already committed. Continue
to exclude unrelated `README.md`, `reference-projects/`, and pre-existing
package metadata edits.

Product work should continue from `docs/design-docs/ref-desktop-cc-gui.md`.
Good next slices are actual skill-usage evidence, model settings, provider
capability matrix, project creation/open/restore polish, runtime diagnostics,
file tree, Git, terminal, or attachment panels.

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
