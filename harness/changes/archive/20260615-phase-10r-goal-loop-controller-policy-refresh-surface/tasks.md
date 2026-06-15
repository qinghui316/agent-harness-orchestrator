# Tasks: Phase 10R Goal Loop Controller Policy Refresh Surface

- [x] T-001: Fix post-10Q docs handoff and record Phase 10R active.
  - Covers: AC-001
- [x] T-002: Add scoped controller refresh action type, request fields, target/scope payload, and stale-target revalidation.
  - Covers: AC-002, AC-004, AC-005
- [x] T-003: Add thin Workbench handler that calls `compileGoalLoopControllerPolicy()` with the current gate snapshot.
  - Covers: AC-002, AC-006, AC-007, AC-009
- [x] T-004: Attach refresh only as a secondary action on matching concrete Harness gates.
  - Covers: AC-003, AC-008
- [x] T-005: Add focused tests for refresh action, stale/mismatched scope rejection, read-model verdict projection, and non-execution.
  - Covers: AC-002 through AC-009
- [x] T-006: Run full product and Harness verification.
  - Covers: AC-010
