# Plan: workbench-rudder-style-agent-orchestration-map-v1

## Approach

Use Rudder as a visual reference only: it combines an SVG edge layer, HTML
cards, deterministic hand-written tree layout, status dots, and pan/zoom/fit
controls. AHO should not copy its org data model or source code. The AHO version
will reuse the existing `DemandAgentRunGraph` projection and add a small
stage-driven DAG layout helper so future agents/process stages can enter the map
through node/edge metadata instead of hard-coded coordinates.

## Steps

1. Update graph types and read-model projection with optional visual metadata.
2. Add a pure stage-based DAG layout helper for node positions, canvas bounds,
   edge paths, stable ordering, and unknown-node fallback.
3. Replace the current lane/list graph UI with a read-only orchestration canvas
   while preserving node detail/raw-log behavior.
4. Add CSS for the Rudder-style canvas, avatar cards, status dots, edge styles,
   zoom/fit controls, and reduced-motion-safe highlights.
5. Add targeted projection/layout/DOM tests.
6. Run targeted and required verification, then update closeout evidence.

## Decisions

- Use a custom lightweight pure layout instead of ReactFlow/Dagre/ELK in V1.
  This keeps dependencies and behavior small while preserving a replaceable
  layout boundary.
- Keep `DemandAgentRunGraph` as the API shape. Add optional visual metadata
  rather than creating a new graph projection.
- Do not persist avatars or layout positions. Avatars are deterministic
  presentation derived from node kind/stage.

## Minimality Gate Plan

- Can this be a no-op: no; the current lane/list view cannot communicate worker
  branching, rework loops, and integration joins like the requested visual map.
- Reuse: reuse `DemandAgentRunGraph`, lazy run-graph route, node detail panel,
  existing evidence/raw-log links, and Workbench styles.
- Shared root fix: update the read-model projection and shared frontend graph
  renderer rather than adding one-off cards in a separate tab.
- Avoided: ReactFlow/ELK/Dagre dependency, editable graph builder, agent
  registry, graph database, workflow runtime, and action buttons in the graph.
- Smallest coherent change: optional metadata + pure layout helper + UI
  renderer/CSS/tests.

## Module Boundary Plan

- Owner module: backend graph projection remains
  `src/workbench/projections/read-model/run-graph.ts`; frontend graph rendering
  moves into a focused orchestration-map component/helper under
  `src/web/src/panels/workbench/`.
- New / moved responsibilities: visual layout and canvas rendering move out of
  the broad `ConversationPanel.tsx` body into owned frontend files.
- Facade touch points: `ConversationPanel.tsx` remains the tab shell and detail
  composition point.
- Forbidden write-back locations: do not add graph layout or action authority
  into `App.tsx`, `workbench-server.ts`, `chat.ts`, or runtime managers.
- Compatibility surface: lazy run-graph JSON route remains compatible; added
  fields are optional.
- Boundary tests: layout unit test plus web DOM run-graph test.
- Follow-up split candidates: none.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: `DemandAgentRunGraph`, Workpad
  summaries, scheduler/IntegrationCheck/landing/close projections, node detail,
  lazy projection route, and evidence refs.
- Why existing mechanisms are insufficient if a new mechanism is proposed: the
  only new mechanism is a replaceable pure visual layout helper; the existing
  lane/list renderer lacks spatial branch/join layout.
- Domain-specific logic location: graph node/edge visual classification stays in
  run-graph projection and frontend layout helpers.
- Shared cross-cutting logic location: action authority, stale validation,
  source safety, scheduler, apply/close remain in existing owners.
- Local framework / state machine / projection / validation / gate avoided: no
  new workflow engine, permission system, graph DB, action registry, or evidence
  family.
- Future-cost reduction for similar features: future agent/process nodes can add
  stage/edge metadata and enter the same layout without new per-flow UI.

## Planning-Discovered Gaps

None yet.
