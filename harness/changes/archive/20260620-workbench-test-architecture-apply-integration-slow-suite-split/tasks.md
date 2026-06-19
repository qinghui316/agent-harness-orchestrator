# Tasks: Workbench Test Architecture Apply Integration Slow Suite Split

- [x] T-001: Move shared `writeRawActiveChange` setup into a hook-free helper under `tests/unit/workbench/`.
  - Covers: AC-001

- [x] T-002: Move the nine apply/integration/source-refresh tests into `tests/slow/workbench-apply-integration-flow.test.ts`.
  - Covers: AC-001, AC-002, AC-003, AC-005

- [x] T-003: Update Workbench slow test script staging.
  - Covers: AC-004

- [x] T-004: Verify targeted suites, full Workbench contract, product checks, and Harness checks.
  - Covers: AC-001, AC-002, AC-003, AC-004, AC-005
