# Spec: workbench-reference-style-workspace-picker-and-session-sidebar-v1

## Goal

Make the selected-project Workbench home behave like the inspected
`desktop-cc-gui` home pattern: the center surface stays focused on creating work
and includes a real workspace picker, while session history stays in the left
project/session sidebar.

## Users

- Local Harness-mode users who open AHO and need to choose a project, start a
  demand, or resume a prior demand without learning internal Workbench objects.

## Acceptance Criteria

- AC-001: The selected-project home shows `创造任何东西`, the composer controls,
  and a clickable workspace picker backed by registered projects.
- AC-002: The workspace picker can search, select a project through the
  existing open-project flow, and expose existing add/create project forms.
- AC-003: The left sidebar shows real demand conversations from existing
  topics/workpads with status, waiting decision count, and blocker text when
  present.
- AC-004: Creating a demand uses the existing topic creation flow, migrates the
  selected composer execution mode, and makes the new demand selectable from
  the sidebar.
- AC-005: The center home does not show center-page recent conversation cards,
  fake toolbar buttons, fake provider/model dropdowns, or other controls without
  implemented behavior.
- AC-006: The change does not alter Harness workflow truth or action authority.

## Non-Goals

- No normal Agent mode.
- No new central workflow database or session store.
- No provider/model catalog editing.
- No file refs, slash commands, attachments, Skills, file tree, Git, terminal,
  PR, remote, merge, or packaging work.

## Constraints

- Reuse existing project registry/status routes, `ProjectAddForm`,
  `ProjectCreateForm`, `openProject`, `refresh`, `createTopicFromText`, and
  Workbench `topics` / `workpads`.
- Treat reference source as evidence only; do not vendor-copy it.
- Keep SQLite, topics, workpads, and UI state as interaction/projection layers,
  not Harness workflow truth.

## Risks

- UI can regress into fake controls if toolbar/settings/recent affordances are
  shown before they have real logic.
- Adding a project picker can accidentally duplicate project state unless it
  delegates to existing App open/add/create callbacks.
