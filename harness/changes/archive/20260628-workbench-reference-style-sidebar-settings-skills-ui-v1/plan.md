# Plan: workbench-reference-style-sidebar-settings-skills-ui-v1

## Approach

Use the inspected `desktop-cc-gui` product shell as interaction evidence:
settings is a center view, sidebar project menus are overlays, and Skills is a
managed settings section. In AHO, implement this as a shell/UI refactor over the
existing Workbench state and Skills APIs, not as a new workflow or settings
backend.

## Steps

1. Add center settings state and a `SettingsSurface` owner with category
   navigation.
2. Move Skills management from `ProjectHome.tsx` into a `SkillsSettingsView`
   owner backed by existing Skills routes.
3. Update sidebar project/menu/new-conversation behavior without creating
   topics before first send.
4. Remove ordinary-page technical clutter and old drawer settings rendering.
5. Update DOM tests and run targeted verification.

## Decisions

- Keep right rail unchanged except ensuring it remains settings-free.
- Keep Skills as runtime capability UI only; no Codex bridge or run-context
  behavior changes.
- Use frontend center-tab state for settings; do not persist settings view in
  Harness memory or SQLite.

## Minimality Gate Plan

- Can this be a no-op: no; current UI still exposes settings as a drawer and
  Skills inside the project home, which conflicts with the accepted reference
  interaction.
- Reuse: existing owner/helper/mechanism considered: App center tabs,
  ProjectConversationSidebar, ProjectReadinessHome, ComposerControls,
  Skills APIs, and RightToolRailShell.
- Shared root fix: callers / route owners / shared helpers checked: settings
  opening currently routes through one `settingsOpen` state; replacing that
  shell-level owner fixes both footer settings and composer Skills indicator.
- Avoided: local framework / single-use abstraction / future-only branch
  avoided: no new settings backend, permission system, workflow runtime,
  project registry, or Skill storage.
- Smallest coherent change: add `SettingsSurface` / `SkillsSettingsView`,
  update sidebar shell behavior, and adjust tests.

## Module Boundary Plan

- Owner module: Workbench web shell/panels.
- New / moved responsibilities: settings category layout moves to
  `SettingsSurface`; Skills management moves to `SkillsSettingsView`.
- Facade touch points: `App.tsx` wires center settings state and passes
  existing Skills/settings props.
- Forbidden write-back locations: Harness memory, Workbench workflow truth,
  Codex config, right rail state, project marker files.
- Compatibility surface: existing Skills REST routes, composer Skills
  indicator, project/topic selection, right tool rail tabs.
- Boundary tests: DOM tests for settings surface, Skills section, quick-new
  conversation, and no fake controls.
- Follow-up split candidates: none.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: project registry/open flow,
  topic creation-on-send, existing Skills catalog routes, composer Skill
  indicator, and right rail shell.
- Why existing mechanisms are insufficient if a new mechanism is proposed:
  the existing settings drawer/inline Skills panel are the wrong UI owners, so
  small presentation owners are needed.
- Domain-specific logic location: Settings/Skills presentation only.
- Shared cross-cutting logic location: existing APIs and App state remain the
  single source for project/topic/skill state.
- Local framework / state machine / projection / validation / gate avoided:
  no new workflow state, projection layer, or action path.
- Future-cost reduction for similar features: future settings categories can
  plug into `SettingsSurface` without stuffing main home/sidebar components.

## Planning-Discovered Gaps

None yet.
