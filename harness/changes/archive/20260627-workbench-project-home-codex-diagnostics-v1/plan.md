# Plan: workbench-project-home-codex-diagnostics-v1

## Approach

Reuse the current project registry, status, Harness init, Codex trust, and
Workbench snapshot APIs, then add a small read-only Codex diagnostics endpoint
and front-end owner components for project home, readiness, and settings.
Keep Workbench behavior and action authority unchanged.

## Steps

1. Add a server-side Codex diagnostics read model that composes
   `detectCodexCapabilities`, Codex config path, and per-project trust status.
2. Add a GET API route for app/project Codex diagnostics without any write
   behavior.
3. Add front-end types/API calls for diagnostics.
4. Add `ProjectHomeView`, `ProjectReadinessHome`, `CodexDiagnosticsCard`, and a
   minimal `SettingsPanel` under Workbench web owners.
5. Wire the App shell so no-project and selected-project/no-topic states use the
   new product entry surfaces while existing conversation Workbench remains
   unchanged.
6. Add targeted backend and DOM tests.
7. Run required verification and real UI acceptance with an E-drive sandbox.

## Decisions

- Project home is a product shell surface, not workflow state.
- Codex diagnostics are read-only; existing `codex/trust` POST remains the only
  config-writing Codex action in scope.
- Settings V1 is diagnostic and entry-point only; it does not persist UI
  preferences or add provider settings.
- Workbench SQLite schema is unchanged.

## Minimality Gate Plan

- Can this be a no-op: no; current abilities exist but are discoverable only
  through side-panel details, which does not satisfy the desktop product entry
  requirement.
- Reuse: project registry/status, `getProjectStatus`, Harness init,
  `readCodexProjectTrust`, `trustCodexProject`, Workbench snapshots, and
  existing project create/add routes.
- Shared root fix: project readiness and Codex readiness should be exposed
  through shared status/diagnostic read models, not duplicated per component.
- Avoided: provider framework, settings persistence system, workflow DB, normal
  Agent mode, and Tauri packaging.
- Smallest coherent change: add one diagnostics read path and contained UI
  owner components.

## Module Boundary Plan

- Owner module: Workbench server project/admin/status route owners for
  diagnostics; Workbench web panel/shell owners for project home/settings.
- New / moved responsibilities: new read-only Codex diagnostic DTO; new front-end
  project home/settings components.
- Facade touch points: `App.tsx` only wires state and routes props; it must not
  own diagnostic rendering logic.
- Forbidden write-back locations: no writes to `config.toml`, SQLite schema,
  Change artifacts, source root, Harness archive, or reference projects from
  diagnostics/page load.
- Compatibility surface: existing `/api/projects`, snapshot, add/create/init,
  and trust routes remain compatible.
- Boundary tests: route confirms diagnostics read-only; DOM confirms page load
  does not call write routes.
- Follow-up split candidates: full settings persistence and provider capability
  matrix.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: project registry, memory resolver,
  Harness audit, Codex trust/capability helpers, Workbench snapshots, existing
  confirmation/action routes.
- Why existing mechanisms are insufficient if a new mechanism is proposed:
  existing Codex helpers are not exposed as a product diagnostic read model, so a
  thin composition layer is needed.
- Domain-specific logic location: Codex diagnostics in Codex/Workbench server
  read path; UI rendering in Workbench panel components.
- Shared cross-cutting logic location: keep source safety/action authority in
  existing Workbench actions and project admin routes.
- Local framework / state machine / projection / validation / gate avoided:
  no new permission system, workflow runtime, database, provider matrix, or
  settings engine.
- Future-cost reduction for similar features: establishes the product-shell
  pattern for later files/Git/terminal/settings panels without changing Harness
  truth.

## Planning-Discovered Gaps

- Existing project add/create/init/trust actions are present, but the user
  journey is buried in the sidebar.
- Existing Codex trust status exists; full CLI capability diagnostics are not
  exposed to the Workbench UI.

