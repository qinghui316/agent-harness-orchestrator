# workbench-project-home-codex-diagnostics-v1

## Purpose

Add the first Phase 1 desktop product-layer slice for Harness mode: a user-facing
project home, project readiness surface, Codex diagnostics, and a minimal
settings entry. The goal is to make the existing Workbench usable from a
desktop-style product entry instead of requiring users to discover project,
Harness, and Codex readiness through side-panel details.

This change follows the `desktop-cc-gui` product-layer reference while preserving
AHO's Harness authority model. Project lists, UI state, settings display, and
Workbench SQLite remain interaction/projection state; Change artifacts,
validation/audit, worktrees, apply, landing, close, and Harness evolution remain
workflow truth.

## Scope

In scope:

- Project home for no selected project: registered projects, add existing
  folder, create project, refresh.
- Project readiness home for selected projects: path, Git state, Harness memory,
  Codex trust/readiness, recent demand summaries, and entry into Harness
  Workbench.
- Read-only Codex diagnostics API and UI card.
- Minimal settings panel for Harness/Codex diagnostics and existing safe
  project actions.

Out of scope:

- Normal Agent mode.
- Claude Code / OpenCode / Gemini provider support.
- Tauri packaging or desktop updater work.
- Central workflow database or SQLite workflow-truth migration.
- Automatic Codex trust, Harness init, source apply, remote, merge, PR, or
  Harness evolution.

## Current Status

Completed. Ready to close.

Implemented the Phase 1 Harness-mode product entry slice:

- read-only Codex diagnostics API at app/project scope;
- project home for app mode with registered projects, add/create/refresh entry
  points;
- selected-project readiness home with path, Git state, Harness memory,
  Codex trust/readiness, recent demand state, and Harness Workbench entry
  affordances;
- minimal Harness/Codex settings panel;
- direct `workbench serve <path>` still auto-selects the direct project and
  shows the same readiness/diagnostic surface.

The change does not add a provider matrix, normal Agent mode, Tauri packaging,
central workflow DB, automatic Codex trust, automatic Harness init, source
apply, remote, merge, PR, or Harness evolution behavior.

## Verification

Passed:

- `npx vitest run tests/unit/workbench-server.test.ts tests/unit/web-app.test.tsx tests/unit/codex.test.ts --reporter=default`
- `npm run typecheck`
- `npm run lint`
- `npm run test:fast`
- `npm run build`
- `npm run test:workbench`

Real UI acceptance:

- App-mode URL: `http://127.0.0.1:4339`
- Direct-project URL: `http://127.0.0.1:4338`
- Source: `E:\aho-accept\project-home-v1\src`
- Runtime home: `E:\aho-accept\project-home-v1\home`
- Screenshots:
  - `E:\aho-accept\project-home-v1\app-project-home.png`
  - `E:\aho-accept\project-home-v1\selected-project-home.png`
  - `E:\aho-accept\project-home-v1\direct-project-home.png`
  - `E:\aho-accept\project-home-v1\settings-panel.png`
- DOM evidence confirmed:
  - app home shows `选择项目开始`, registered project, add/create/refresh
    controls;
  - selected/direct project home shows `项目主页`, Harness memory
    `external-local`, Git branch/dirty status, Codex trust status, and
    `Codex 诊断`;
  - settings panel shows `Harness / Codex`, Codex CLI version, config path, and
    current project status;
  - no visible claim that Claude Code, OpenCode, Gemini, or normal Agent mode is
    implemented.

The browser screenshot helper initially saved blank files because the returned
image was a numeric-key byte object. Re-saving from ordered byte values produced
valid PNG files. Workbench servers on ports `4338` and `4339` were stopped after
acceptance.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: screenshot save needed one retry because the
  browser helper returned an object-shaped byte array; DOM interaction itself
  worked.
- Screenshots / artifacts / run ids: see `Verification`.
- External source/state safety: `E:\aho-accept\project-home-v1\src` was used as
  an external sandbox. It was initialized for Harness readiness only; no
  workflow action, Codex run, source apply, remote, merge, PR, or Harness
  evolution action was executed. `git status --short` showed only expected
  Harness initialization files: `.agent-harness/` and `AGENTS.md`.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: the `新建需求` affordance is
  visible on the project home, but full composer/new-demand usage layer remains
  Phase 2 product work. This change intentionally stops at project readiness
  and diagnostics entry.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: updated `AGENTS.md`, `docs/STATUS.md`, and
  `docs/CURRENT-DEVELOPMENT-PLAN.md` with only the current Phase 1 product-entry
  delta and latest archive pointer.
- Experience lifecycle result: no Harness rule/template/runtime evolution.
- Roadmap/current-direction stale language check: next direction now points to
  remaining desktop product-layer slices rather than the completed project
  home/diagnostics slice.
- Old experience retained / merged / retired / archive-only: retained current
  product-entry behavior; detailed screenshots, DOM excerpts, and verification
  remain archive-only.

