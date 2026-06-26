# Tasks: workbench-cursor-incremental-transcript-projection-v2

- [x] T-001: Add bounded message paging in the existing Workbench store/thread-log path.
  - Covers: AC-001, AC-002, AC-003
- [x] T-002: Add incremental transcript page projection and server route wiring.
  - Covers: AC-001, AC-002, AC-003, AC-004
- [x] T-003: Avoid full transcript construction in the default snapshot shell.
  - Covers: AC-005
- [x] T-004: Preserve frontend virtual transcript behavior with opaque cursors.
  - Covers: AC-006
- [x] T-005: Add targeted regression coverage for store, projection, route, and DOM behavior.
  - Covers: AC-001, AC-002, AC-003, AC-004, AC-005, AC-006
- [x] T-006: Run one-time 100k / 500k synthetic pressure acceptance and delete generated data.
  - Covers: AC-007
- [x] T-007: Complete verification, ECL closeout, handoff updates, and git settlement.
  - Covers: AC-001, AC-002, AC-003, AC-004, AC-005, AC-006, AC-007
