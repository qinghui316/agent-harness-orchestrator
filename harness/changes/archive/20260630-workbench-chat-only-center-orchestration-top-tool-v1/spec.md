# Spec: workbench-chat-only-center-orchestration-top-tool-v1

## Goal

The active conversation should behave like a clean chat-first product surface:
the center workspace shows the conversation and composer, while advanced
orchestration is opened from a top tool button as a large read-only overlay.
Removing the visible Workpad tab must not remove real user capabilities.

## Users

- Local AHO users working in Harness mode.
- Developers reviewing orchestration state or evidence for a selected Change.

## Acceptance Criteria

- AC-001: Active topic center UI no longer renders `对话`, `工作台`, or
  `Agent 编排图` as center tabs.
- AC-002: A top tool button opens/closes a read-only `Agent 编排图` overlay,
  aligned with the terminal and right-rail buttons.
- AC-003: Old deep links for `tab=workpad` safely show conversation, while
  `tab=agentGraph`/`tab=orchestration` opens the graph overlay.
- AC-004: Evidence/run selection paths that previously switched to the graph
  tab now open the overlay and preserve selected run/node context.
- AC-005: Pending clarifications remain answerable through a non-tab
  conversation surface using the existing clarification action.
- AC-006: Workpad-only evidence/details or TaskGraph/TaskQueue actions are not
  silently lost; duplicate primary workflow buttons are not reintroduced in
  the conversation center.
- AC-007: Opening/closing the overlay does not reset the right rail, terminal
  sessions, confirmation queue, or trigger workflow actions.

## Non-Goals

- Do not change Harness workflow truth, confirmation authority, Goal Loop,
  Scheduler, validation/audit, apply/close, remote, merge, PR, or Harness
  evolution.
- Do not add fake actions, new provider modes, new workflow routes, or a new
  graph renderer.

## Constraints

- `确认` remains the only primary workflow action surface.
- `Agent 编排图` remains a projection and never executes actions.
- Terminal remains a separate bottom dock; right rail remains the auxiliary
  tool area.
- Reuse existing Workpad, graph, and confirmation owners where possible.

## Risks

- Removing the Workpad tab can hide structured clarification answers or
  task/evidence details if not migrated carefully.
- Existing tests and deep-link restore logic depend on `centerTab` values.
- Overlay z-index/focus can conflict with terminal, right rail, composer
  popovers, and attachment preview if not scoped deliberately.
