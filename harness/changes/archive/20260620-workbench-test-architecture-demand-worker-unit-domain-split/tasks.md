# Tasks: Workbench Test Architecture Demand Worker Unit Domain Split

- [x] T-001: Move the 10-test DemandWorker Workbench cluster into `tests/unit/workbench-demand-worker.test.ts`.
  - Covers: AC-001, AC-002, AC-005

- [x] T-002: Update npm test scripts so `test:workbench` includes the new suite and `test:fast` excludes it.
  - Covers: AC-003, AC-004

- [x] T-003: Verify targeted suites, staged Workbench tests, product checks, and Harness checks.
  - Covers: AC-001, AC-002, AC-003, AC-004, AC-005
