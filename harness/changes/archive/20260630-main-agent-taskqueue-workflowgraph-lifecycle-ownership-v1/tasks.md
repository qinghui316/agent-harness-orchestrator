# Tasks: main-agent-taskqueue-workflowgraph-lifecycle-ownership-v1

- [x] T-001: Add main-agent TaskQueue lifecycle owner.
  - Covers: AC-001, AC-007, AC-008
- [x] T-002: Move stage-resume orchestration under main-agent ownership with
  fail-closed scope checks.
  - Covers: AC-003, AC-004, AC-005
- [x] T-003: Reduce old TaskQueue runner to a compatibility wrapper and remove
  direct old rework production usage.
  - Covers: AC-002, AC-006
- [x] T-004: Update architecture and behavior tests for the new owner boundary,
  resume semantics, gate scope, and no-authority-expansion guarantees.
  - Covers: AC-001, AC-002, AC-003, AC-004, AC-005, AC-006, AC-007, AC-008
- [x] T-005: Run targeted and aggregate verification, then update review and
  closeout evidence.
  - Covers: AC-001, AC-002, AC-003, AC-004, AC-005, AC-006, AC-007, AC-008
