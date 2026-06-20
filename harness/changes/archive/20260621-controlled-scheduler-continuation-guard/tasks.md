# Tasks: Controlled Scheduler Continuation Guard

- [x] T-001: Add the continuation guard helper and prior-step lookup path.
  - Covers: AC-001, AC-002, AC-003, AC-004, AC-005, AC-006

- [x] T-002: Wire the guard into `planning.scheduler.controlled-advance.run` before any fresh evidence or concrete scheduler transition starts.
  - Covers: AC-002, AC-006, AC-007

- [x] T-003: Add targeted guard and handler tests for bootstrap, pass, fail-closed, scope-transition, and no-execution-on-failure behavior.
  - Covers: AC-001, AC-002, AC-003, AC-004, AC-005, AC-007

- [x] T-004: Run verification, complete independent review, update handoff docs, and close/archive if close-ready.
  - Covers: AC-001, AC-002, AC-003, AC-004, AC-005, AC-006, AC-007
