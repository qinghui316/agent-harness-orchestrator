# Plan: workbench-reference-style-workspace-picker-and-session-sidebar-v1

## Approach

Add a focused frontend owner for the workspace picker and wire it into
`ProjectReadinessHome`. The picker delegates all project operations to existing
callbacks and forms. Sidebar conversation history already uses `workpads` and
`topics`; keep that source and add tests to lock the real-data behavior.

## Steps

1. Record the inspected `desktop-cc-gui` source evidence and AHO current owner
   boundaries.
2. Add a small workspace picker component that receives `projects`,
   `selectedProjectId`, and callback props; it owns only popover/search UI.
3. Wire the picker into `ProjectReadinessHome` and `App.tsx` using existing
   project add/create/open callbacks.
4. Remove or demote visible primary-surface controls that do not match the
   reference or have no real logic.
5. Add DOM tests for picker behavior, sidebar conversation history, demand
   creation, and fake-control absence.
6. Run targeted and required verification, then real UI acceptance if build
   passes.

## Decisions

- Do not add center-page recent conversations because the inspected
  `desktop-cc-gui` HomeChat tests explicitly assert they are not rendered.
- Keep history in the sidebar, backed by existing `workpads` / `topics`.
- Do not add backend APIs unless implementation proves existing snapshot/project
  data is insufficient.

## Minimality Gate Plan

- Can this be a no-op: no; the central project label is static and cannot switch
  workspace like the reference home.
- Reuse: existing project registry/status, add/create forms, open/refresh
  callbacks, composer mode storage, and workpad/topic projection.
- Shared root fix: checked `App.tsx`, `ProjectHome.tsx`, `sidebar.tsx`, and
  Workbench read-model topic/workpad summaries before adding UI.
- Avoided: new project registry, central workflow DB, normal Agent session
  store, provider/model dropdown, fake recent cards, and workflow action paths.
- Smallest coherent change: one frontend picker owner plus wiring/tests.

## Module Boundary Plan

- Owner module: frontend project-home shell, with a new `WorkspacePicker`
  component under `src/web/src/panels/`.
- New / moved responsibilities: picker owns popover/search display only.
- Facade touch points: `App.tsx` passes existing callbacks into
  `ProjectReadinessHome`.
- Forbidden write-back locations: Harness memory, SQLite, project marker, and
  workflow artifacts.
- Compatibility surface: existing Workbench project/topic routes and snapshot
  shape.
- Boundary tests: DOM tests for no workflow action during project selection and
  fake-control absence.
- Follow-up split candidates: file refs, slash commands, attachments, Skills,
  file tree, Git, terminal, provider settings.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: `ProjectAddForm`,
  `ProjectCreateForm`, `openProject`, `refresh`, `createTopicFromText`,
  `migrateDraftComposerExecutionMode`, `workpads`, and `topics`.
- Why existing mechanisms are insufficient if a new mechanism is proposed: the
  missing piece is only the workspace picker UI owner.
- Domain-specific logic location: frontend project-home components.
- Shared cross-cutting logic location: unchanged existing project/topic owners.
- Local framework / state machine / projection / validation / gate avoided: no
  new session store, workflow DB, permission layer, or projection layer.
- Future-cost reduction for similar features: establishes a real-control-only
  pattern for future file refs / Skills / terminal surfaces.

## Planning-Discovered Gaps

None yet.
