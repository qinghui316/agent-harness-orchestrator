# Spec: workbench-codex-style-top-tool-alignment-right-launcher-terminal-squeeze-v1

## Goal

Make the Workbench shell match the Codex-style tool layout requested by the
user: the terminal dock toggle and right rail toggle share one aligned top tool
button style, the expanded right rail opens to a centered launcher instead of
segmented tabs, and the terminal dock squeezes the current workspace instead of
covering the transcript or composer.

## Users

Local AHO users working in Harness mode who need a clean conversation-first
workspace with optional terminal and right-side tools.

## Acceptance Criteria

- AC-001: The terminal dock toggle, collapsed right rail toggle, and expanded
  rail collapse/back controls use the same top tool button sizing and visual
  language.
- AC-002: Expanding the right rail first shows a centered launcher with only
  implemented tools: `确认`, `文件`, `Git`, and `诊断`.
- AC-003: Selecting a launcher item opens the corresponding panel with a
  header back button and collapse button; the old top segmented tabs are not
  rendered.
- AC-004: Opening the terminal dock keeps it as a bottom flex item and does not
  overlap the homepage composer, active transcript, or active topic composer.
- AC-005: The change does not alter `TerminalRuntime`, confirmation authority,
  workflow actions, Goal Loop, Scheduler, apply/close, remote, PR, merge, or
  Harness evolution behavior.

## Non-Goals

- Do not change terminal backend/session behavior.
- Do not add Rust/Tauri or a new native adapter.
- Do not add Browser, side-chat, remote, PR, merge, or other unimplemented tool
  launchers.
- Do not move confirmation actions out of the `确认` panel.

## Constraints

- Reuse existing `RightToolRailShell`, `WorkspaceDockToggleBar`,
  `TerminalDock`, and App shell state.
- Keep the right rail as navigation only; executable confirmation controls stay
  in `DecisionInspectorPane`.
- Terminal remains a user-manual tool only.

## Risks

- Layout regressions can hide or overlap the composer when the terminal is
  open.
- Existing tests that assume the right rail opens directly to the confirmation
  pane need to route through the new launcher.
