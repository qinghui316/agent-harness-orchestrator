# Tasks: Phase 9W Scheduler Integration Evidence Event Projection Hardening

- [x] T-001: Fill ECL artifacts and update handoff docs for Phase 9W active.
  - Covers: AC-001
- [x] T-002: Extend scheduler runtime event types/schemas for integration candidate, handoff, and outcome events.
  - Covers: AC-002, AC-006
- [x] T-003: Append SchedulerRun-scoped events from `integration-candidate`, `integration-check-handoff`, and terminal `integration-outcome` owner modules.
  - Covers: AC-003, AC-004, AC-005, AC-006, AC-007
- [x] T-004: Add or tighten tests for event writes, idempotent existing paths, waiting-for-apply behavior, non-execution boundaries, and module ownership.
  - Covers: AC-003, AC-004, AC-005, AC-007, AC-008
- [x] T-005: Run focused/full product verification and Harness verification.
  - Covers: AC-009
