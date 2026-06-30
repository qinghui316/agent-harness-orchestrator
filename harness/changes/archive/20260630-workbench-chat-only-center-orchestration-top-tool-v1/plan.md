# Plan: workbench-chat-only-center-orchestration-top-tool-v1

## Approach

Replace center-tab navigation with a chat-only active topic body. Split graph
visibility from `centerTab` into an explicit overlay state, and reuse the
existing graph panel inside an accessible modal-style overlay. Preserve
Workpad-only user paths by moving the clarification card into the conversation
surface and keeping evidence/details reachable through existing detail owners.

## Steps

1. Audit current Workpad-only interactive paths and remove only duplicate
   primary workflow buttons.
2. Remove center tabs from the active topic view and render transcript as the
   only center body.
3. Add an orchestration top tool button beside the terminal/right-rail buttons.
4. Add overlay state, lazy graph loading, deep-link compatibility, close/focus
   behavior, and selected run/node wiring.
5. Move pending clarification answer UI into a compact conversation surface.
6. Update tests for removed tabs, overlay behavior, URL compatibility, and
   retained clarification/evidence paths.
7. Run targeted and aggregate verification, then real UI screenshot acceptance.

## Decisions

- The graph opens as a large overlay, not a right-rail tab and not a bottom
  dock.
- Old `workpad/workbench` deep links degrade to conversation; old
  `agentGraph/orchestration` deep links open the overlay.
- Workpad runtime/projection remains; only the center tab surface is removed.

## Minimality Gate Plan

- Can this be a no-op: no, current UI exposes tabs the user wants removed and
  graph opening is tied to `centerTab`.
- Reuse: existing `AgentRunGraphPanel`, Workpad clarification components,
  confirmation queue, terminal top button styling, and URL restore helpers.
- Shared root fix: remove the center-tab concept from the active topic shell
  instead of hiding individual tab buttons with CSS.
- Avoided: no new graph renderer, no new workflow action surface, no new
  provider or permission layer.
- Smallest coherent change: shell state + active topic render + compact
  clarification migration + tests.

## Module Boundary Plan

- Owner module: Workbench web shell and active conversation panel.
- New / moved responsibilities: top tool button opens graph overlay; pending
  clarification answer UI moves out of Workpad tab.
- Facade touch points: Workbench app state, active topic rendering, run graph
  projection fetch.
- Forbidden write-back locations: Harness workflow files, run artifacts,
  confirmation queue, scheduler/apply/close routes.
- Compatibility surface: old `tab=` query values and evidence selection.
- Boundary tests: no workflow action POST from opening/closing graph; no stale
  blank center tab.
- Follow-up split candidates: none.
- If not applicable, reason: TBD.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: graph projection/panel, Workpad
  clarification action, terminal/right-rail top button visual language.
- Why existing mechanisms are insufficient if a new mechanism is proposed: a
  small overlay state is needed because graph visibility is no longer a center
  tab.
- Domain-specific logic location: Workbench web UI only.
- Shared cross-cutting logic location: existing URL restore and projection
  refresh helpers.
- Local framework / state machine / projection / validation / gate avoided: no
  new projection, gate, or workflow state machine.
- Future-cost reduction for similar features: large read-only canvases can use
  the same top-tool overlay pattern without polluting center tabs.

## Planning-Discovered Gaps

- Workpad `ClarificationCard` is currently the only structured
  `answerClarification` UI and must be migrated.
- Some TaskQueue/TaskGraph detail actions are Workpad-only; implementation must
  either prove right-rail equivalence or keep them reachable in graph/detail
  surfaces.
