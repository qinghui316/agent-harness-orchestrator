# Plan: workbench-reference-style-sidebar-and-skills-polish-v2

## Approach

Reuse the existing Workbench sidebar, settings, and Skill APIs. Make the
ordinary project menu truthful and small, keep technical recovery in settings
or contextual failure states, and restyle the Skills settings surface without
introducing a new Skill store or bridge path.

## Steps

1. Update `ProjectConversationSidebar` to remove ordinary refresh/trust/prepare
   menu items and keep project settings as the recovery entrypoint.
2. Adjust sidebar rendering so history rows can render/open when snapshots are
   available even if new execution preparation is not ready.
3. Tighten sidebar labels, placeholder text, and row CSS alignment.
4. Rework `SkillsSettingsView` and CSS so native Codex Skills are primary
   available items, custom roots/sync are secondary, and technical fields stay
   out of ordinary detail.
5. Add/update tests for menu contents, new conversation behavior, historical
   read-only opening, native Skill availability, and fake/internal term checks.
6. Run targeted and aggregate verification, then update review/summary and
   close the change.

## Decisions

- Reference source inspected:
  `reference-projects/desktop-cc-gui/src/features/app/hooks/useSidebarMenus.ts`,
  `reference-projects/desktop-cc-gui/src/features/app/components/SidebarWorkspaceMenuOverlay.tsx`,
  `reference-projects/desktop-cc-gui/src/features/skills/hooks/useSkills.ts`,
  and `reference-projects/desktop-cc-gui/src/features/curated-skills/components/CuratedSection.tsx`.
- AHO omits reference actions that do not exist in Harness mode, such as
  provider-specific sessions, worktree/clone agents, marketplace, or fake
  provider controls.
- Native Codex Skills are available by default. Custom/managed Skills keep
  AHO-managed bridge sync.

## Minimality Gate Plan

- Can this be a no-op: no; visible UI still exposes reference-mismatched
  project-menu actions and overly technical Skills hierarchy.
- Reuse: existing sidebar, settings, Skills API, registry removal, and Codex
  Skill runtime status.
- Shared root fix: fix the sidebar menu owner and Skills settings owner rather
  than hiding individual strings in tests.
- Avoided: no new settings framework, Skill store, provider matrix, or sidebar
  menu system.
- Smallest coherent change: product-surface polish plus tests.

## Module Boundary Plan

- Owner module: `src/web/src/shell/sidebar.tsx` for sidebar behavior and
  `src/web/src/panels/SkillsSettingsView.tsx` for Skills settings rendering.
- New / moved responsibilities: no new owner; existing owners are narrowed.
- Facade touch points: `App.tsx` only if existing callbacks need wiring.
- Forbidden write-back locations: no new workflow logic in broad runtime or
  Harness action owners for this UI-only change.
- Compatibility surface: existing project, conversation, Skills, and settings
  APIs remain compatible.
- Boundary tests: web DOM and server tests cover visible actions and flow.
- Follow-up split candidates: none.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: project registry removal,
  first-demand preparation, settings categories, Codex Skill discovery, and
  AHO-managed bridge sync.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no
  new mechanism is proposed.
- Domain-specific logic location: sidebar and Skills settings components.
- Shared cross-cutting logic location: existing server/API owners remain.
- Local framework / state machine / projection / validation / gate avoided:
  no new projection, permission, or workflow framework.
- Future-cost reduction for similar features: future reference-style UI work
  can follow the same rule: expose only implemented actions in the relevant
  product surface.

## Planning-Discovered Gaps

None.
