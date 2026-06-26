# Spec: workbench-rudder-style-agent-orchestration-map-v1

## Goal

Make the Workbench selected-demand agent graph visually understandable as an
orchestration map, similar in composition to the Rudder organization canvas:
large scrollable canvas, node cards with avatars/status, SVG connectors, and
zoom/fit controls. The map must communicate AHO's local loop, scheduler worker
branches, rework loops, IntegrationCheck joins, and terminal gates without
exposing internal runtime terms as the primary user vocabulary.

## Users

- Local Workbench users who need to understand what the Agent did, where the
  current demand is blocked, and what stage is next.
- Developers/debuggers who need to click a graph node and inspect existing
  evidence/raw logs.

## Acceptance Criteria

- AC-001: The Workbench center tab is labeled `Agent 编排图` and renders a
  Rudder-style canvas with SVG edges, avatar cards, status dots, and zoom/fit
  controls.
- AC-002: The backend graph projection remains derived from existing
  Workpad/Goal Loop/automation/scheduler/IntegrationCheck/landing/close
  summaries and includes only minimal visual metadata: `stage`, `visualKind`,
  `edgeStyle`, and `edgeRole`.
- AC-003: The DAG layout is stage-driven and stable for sequential flows,
  rework loops, unknown node kinds, and two-worker scheduler branch/join shapes
  without hard-coded agent coordinates.
- AC-004: Graph nodes stay read-only and clicking a node only opens existing
  details/evidence/raw-log surfaces; nodes do not trigger workflow actions.
- AC-005: The primary graph copy hides or avoids unsupported future
  capabilities and raw internal labels such as `TaskRun`, `WorkerLease`, raw
  scheduler buttons, fake full-auto, merge queue, or automatic remote/merge.
- AC-006: Tests cover projection/layout and DOM behavior, including loop/rework
  edge styling, worker join visibility, unknown node fallback, node detail
  click, and no action dispatch from graph nodes.

## Non-Goals

- No editable workflow canvas.
- No new workflow runtime, central database, permission system, scheduler
  executor, child Change framework, or evidence family.
- No change to `confirmationQueue.primary`, action revalidation, automation,
  Goal Loop, scheduler, apply/close, PR, remote, merge, or Harness evolution
  authority.
- No vendor-copy of Rudder source.

## Constraints

- The graph is a read-only projection; Change/artifact/validation/audit/apply
  records remain workflow truth.
- Existing lazy run-graph route and graph detail behavior must remain
  compatible.
- New node kinds or future agents must degrade to a default avatar/stage rather
  than breaking the layout.
- UI must remain dense and utilitarian, not a marketing hero or decorative page.

## Risks

- A graph UI can accidentally look like a workflow editor or executor.
  Mitigation: no action buttons on graph nodes and DOM tests for unsupported
  action copy.
- Hard-coded positions would make future loop/scheduler shapes brittle.
  Mitigation: pure stage-based layout helper with tests.
- Overloading the graph projection with workflow truth would violate runtime
  boundaries. Mitigation: only additive visual metadata and review coverage.
