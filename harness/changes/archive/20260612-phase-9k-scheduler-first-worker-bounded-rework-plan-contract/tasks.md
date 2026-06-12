# Tasks: Phase 9K Scheduler First Worker Bounded Rework Plan Contract

- [x] T-001: Repair post-9J handoff docs and mark Phase 9K active.
  - Covers: AC-001
- [x] T-002: Add scheduler-runtime rework plan types, schemas, paths, repository, rendering, and facade exports.
  - Covers: AC-002, AC-003, AC-006, AC-009
- [x] T-003: Implement `compileSchedulerFirstWorkerReworkPlan()` with strict scheduler lineage guards and idempotency.
  - Covers: AC-002, AC-003, AC-004, AC-005, AC-006, AC-008
- [x] T-004: Wire Workbench action, stale revalidation, result summary, confirmation queue, read-model/lazy projection, and frontend payload types.
  - Covers: AC-007
- [x] T-005: Add or extend focused tests for rework plan success, fail-closed boundaries, idempotency, non-execution, action consistency, and module ownership.
  - Covers: AC-004, AC-005, AC-007, AC-008, AC-009
- [x] T-006: Run focused and full verification; record outcomes.
  - Covers: AC-010
