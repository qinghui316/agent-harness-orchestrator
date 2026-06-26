# Spec: workbench-orchestration-map-real-ui-and-collapsible-confirmation-rail-v1

## Goal

Complete the real-browser acceptance gap for the Rudder-style `Agent 编排图`
and make the Workbench right confirmation column default to a compact
Codex-style collapsed rail. The center workspace should gain width while the
rail is collapsed, and expanding the rail should show the existing
`DecisionInspectorPane` without changing confirmation semantics.

## Users

- Local Workbench users who need a cleaner conversation / graph workspace while
  still seeing when a human confirmation is pending.
- Future agents validating Workbench visual behavior through deterministic DOM
  tests plus real browser screenshots.

## Acceptance Criteria

- AC-001: Workbench App defaults the right confirmation surface to a compact
  collapsed rail with a panel icon, pending count badge, and lightweight
  primary-gate emphasis.
- AC-002: Clicking the rail expands the existing confirmation pane; clicking the
  pane collapse control returns to the rail. The expanded pane shows the real
  `DecisionInspectorPane` and the current `decision-inspector-primary` when one
  exists.
- AC-003: Collapsing the rail is frontend-only UI state. It does not persist to
  backend, SQLite, durable memory, project marker, or Workpad, and it does not
  submit workflow actions.
- AC-004: With the rail collapsed, the center Workbench workspace and
  `Agent 编排图` use the expanded layout and still render the canvas, SVG edges,
  avatar cards, status dots, and zoom / fit controls.
- AC-005: Real in-app browser acceptance captures screenshots for the default
  collapsed rail, the Rudder-style orchestration map, and the expanded
  confirmation pane.

## Non-Goals

- No workflow truth, confirmation queue, action revalidation, apply/close,
  scheduler, automation, remote, merge, PR, or Harness evolution behavior
  change.
- No persisted user preference for the collapsed state in V1.
- No new permission system, projection framework, workflow runtime, central
  database, or action path.
- No Rudder code vendoring; Rudder remains visual reference evidence only.

## Constraints

- `confirmationQueue.primary` remains the authoritative executable surface.
- Confirmation buttons may only appear inside the expanded
  `DecisionInspectorPane`.
- `DecisionInspectorPane` keeps confirmation/action logic ownership; the new
  shell may only own layout and toggle state.
- Use existing icons from `lucide-react`; do not add handcrafted SVG.
- Keep visual language restrained and operational, aligned with the current
  Workbench shell.

## Risks

- Existing App DOM tests that expect the right pane to be expanded by default
  need to explicitly open the rail.
- A collapsed rail could hide a pending confirmation too well; the badge and
  primary-gate emphasis must remain visible.
- Real UI acceptance can fail if the selected external sandbox cannot restore a
  graph-bearing project; in that case create a fresh E-drive sandbox or record
  an environment blocker rather than claiming screenshot acceptance.

