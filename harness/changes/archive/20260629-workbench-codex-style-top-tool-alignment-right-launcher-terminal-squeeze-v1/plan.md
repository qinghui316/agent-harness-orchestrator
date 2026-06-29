# Plan: workbench-codex-style-top-tool-alignment-right-launcher-terminal-squeeze-v1

## Approach

Make the requested behavior a shell-level UI adjustment. Keep the existing
backend and tool panels intact, but change the right rail state from "active
tab" to "launcher or active tool panel". Centralize top tool button styling in
CSS and remove the active conversation composer's sticky positioning so the
bottom terminal dock naturally squeezes workspace content.

## Steps

1. Extend `RightToolRailShell` with a launcher view and per-tool panel view.
2. Update App shell state from `RightToolRailTab` to `RightToolRailView`.
3. Apply one shared `top-tool-button` style to terminal toggle, rail toggle,
   back, and collapse buttons.
4. Remove the old right-tool tab rendering and stale CSS.
5. Ensure terminal dock remains a bottom flex item and topic composer is not
   sticky/overlayed.
6. Update DOM tests to cover launcher navigation, tool button class reuse,
   absence of fake/unimplemented tools, and non-action behavior.

## Decisions

- Use `确认事项` as the panel title to avoid ambiguity with the real
  confirmation action button while keeping the launcher entry label `确认`.
- Do not persist right rail launcher/panel state. This is transient shell UI.
- Do not introduce a new layout framework; the existing grid/flex shell is
  sufficient.

## Minimality Gate Plan

- Can this be a no-op: no; the current UI exposes top tabs and misaligned tool
  buttons.
- Reuse: existing `RightToolRailShell`, `TerminalDock`, and Workbench shell
  layout are reused.
- Shared root fix: alignment is solved by one CSS class rather than per-button
  local styles.
- Avoided: no new workflow action, runtime service, projection, or state store.
- Smallest coherent change: frontend shell, CSS, and DOM tests only.

## Module Boundary Plan

- Owner module: `src/web/src/panels/workbench/DecisionPaneShell.tsx` for right
  rail shell and `src/web/src/panels/workbench/TerminalDock.tsx` for terminal
  toggle.
- New / moved responsibilities: right rail launcher state is shell-only; tool
  panel owners remain unchanged.
- Facade touch points: App passes `activeView`, `onToolOpen`, and
  `onBackToLauncher`.
- Forbidden write-back locations: no backend, SQLite, Harness memory, source
  root, or terminal session behavior changes.
- Compatibility surface: existing panel components keep their props.
- Boundary tests: `tests/unit/web-app.test.tsx`.
- Follow-up split candidates: none.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: existing Workbench shell, right
  rail panels, terminal dock, and diagnostics rail panel.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no
  new mechanism is proposed.
- Domain-specific logic location: launcher/panel rendering stays in
  `DecisionPaneShell`.
- Shared cross-cutting logic location: top tool visual contract stays in
  `.top-tool-button`.
- Local framework / state machine / projection / validation / gate avoided: no
  workflow state or projection layer added.
- Future-cost reduction for similar features: future real dock buttons can reuse
  the same top tool button class without inventing another style.

## Planning-Discovered Gaps

- Existing `topic-composer` used sticky positioning, which risked overlaying the
  terminal dock. The fix is to let the timeline flex column place it above the
  dock naturally.
