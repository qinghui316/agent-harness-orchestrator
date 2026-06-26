# Tasks: workbench-rudder-style-agent-orchestration-map-v1

- [x] T-001: Extend the run-graph projection/types with optional visual stage,
  visual kind, edge style, and edge role metadata while preserving
  compatibility.
  - Covers: AC-002

- [x] T-002: Add a pure extensible stage-based DAG layout helper with stable
  placement for sequential, loop/rework, worker branch/join, and unknown-node
  cases.
  - Covers: AC-003

- [x] T-003: Replace the current Workbench run-graph lane/list view with the
  `Agent 编排图` canvas, avatar cards, SVG edges, status dots, zoom, fit, and
  existing node detail reuse.
  - Covers: AC-001, AC-004

- [x] T-004: Add user-surface honesty checks so graph copy stays read-only and
  does not expose unsupported full-auto, raw scheduler, merge/remote, or action
  execution affordances.
  - Covers: AC-004, AC-005

- [x] T-005: Add targeted projection/layout/DOM tests and run required
  verification.
  - Covers: AC-006
