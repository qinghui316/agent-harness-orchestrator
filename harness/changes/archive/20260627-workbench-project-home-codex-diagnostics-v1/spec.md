# Spec: workbench-project-home-codex-diagnostics-v1

## Goal

Make the Workbench first screen behave like a desktop product entry for Harness
mode. A user should be able to open AHO, choose or create a project, understand
whether Harness memory and Codex are ready, open a minimal settings surface, and
enter the existing Harness Workbench without CLI setup knowledge.

## Users

- Local individual developer using AHO as a Codex-backed Harness-mode desktop
  product.
- Future agent implementers who need a clear Phase 1 product-layer boundary
  before adding composer/tool/provider features.

## Acceptance Criteria

- AC-001: When no project is selected, the center workspace shows a project home
  with registered projects, add-existing-folder, create-project, and refresh
  controls.
- AC-002: When a project is selected and no demand conversation is open, the
  center workspace shows a project readiness home with path, Git state, Harness
  memory status, Codex trust/readiness, recent demand summaries, and a clear
  entry to start or enter Harness Workbench.
- AC-003: A read-only Codex diagnostics surface reports CLI availability,
  version, required capability flags, config path, project trust, and errors
  without writing `config.toml`.
- AC-004: Existing write-capable project actions remain explicit user actions:
  add/create project, initialize Harness, and trust Codex require confirmed
  POSTs and are not run on page load.
- AC-005: The minimal settings panel opens from the shell and shows Harness/Codex
  diagnostics without claiming normal Agent mode or non-Codex providers are
  active.
- AC-006: Direct `workbench serve <path>` mode still auto-selects the direct
  project and exposes the same readiness/diagnostic information.
- AC-007: Workbench SQLite remains interaction/projection storage; no Change,
  validation/audit, worktree, apply, close, or Harness evolution truth is moved
  into SQLite.

## Non-Goals

- Do not implement normal Agent mode.
- Do not add Claude Code, OpenCode, Gemini, or a provider capability matrix UI.
- Do not add Tauri packaging, auto-updates, file/Git/terminal panels, or Skills
  management.
- Do not add a central workflow database or migrate Harness truth to SQLite.
- Do not automatically mutate Codex config, initialize Harness, apply source,
  close changes, remote land, merge, PR, or apply Harness evolution.

## Constraints

- Reference projects are local-only evidence. Do not vendor-copy
  `desktop-cc-gui` code or stage files under `reference-projects/`.
- New UI logic should live in small owner components instead of expanding
  `App.tsx`.
- The first slice must reuse existing project admin, marker/memory status,
  Codex trust, Workbench snapshot, and confirmation mechanisms where possible.
- User-facing copy must avoid raw internal runtime terms as the main workflow.

## Risks

- A large shell redesign could destabilize the already-accepted Workbench loop.
  Mitigation: keep layout compatible and add project home/settings as contained
  surfaces.
- Codex diagnostics could accidentally become a config writer. Mitigation:
  diagnostics route is GET/read-only; trust remains the existing explicit POST.
- Project home could imply readiness from UI state. Mitigation: derive status
  from existing project status and snapshot projections only.

