# Tasks: main-agent-controlled-scheduler-state-backflow-v1a

- [x] T-001: Fix expected SchedulerRun mismatch gap in controlled-step replay.
  - Covers: AC-001
- [x] T-002: Add read-only latest same-Change SchedulerRun/runtime state
  backflow summary.
  - Covers: AC-002, AC-003
- [x] T-003: Wire bounded summary into WorkflowGraph replay and replay
  consumption helper without execution semantics.
  - Covers: AC-002, AC-003, AC-004
- [x] T-004: Add regression, summary, policy, and boundary tests.
  - Covers: AC-001, AC-002, AC-003, AC-004, AC-005
- [x] T-005: Run verification, update review/summary/handoff, close.
  - Covers: AC-005
