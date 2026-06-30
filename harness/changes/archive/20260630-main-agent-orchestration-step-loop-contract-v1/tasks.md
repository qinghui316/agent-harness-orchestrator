# Tasks: main-agent-orchestration-step-loop-contract-v1

- [x] T-001: Add the internal main-agent step-loop contract and owner.
  - Covers: AC-001, AC-002

- [x] T-002: Refactor runner entrypoints onto the step-loop while preserving top-level, TaskRun, source-refresh, and PR feedback semantics.
  - Covers: AC-003, AC-004, AC-005

- [x] T-003: Remove stale internal full-sequence naming and prevent old facade drift from returning.
  - Covers: AC-001, AC-006

- [x] T-004: Add or update behavior tests for success, failure, rework, and single-attempt paths.
  - Covers: AC-003, AC-004, AC-005, AC-007

- [x] T-005: Add or update module-boundary tests proving no UI/action/scheduler authority expansion.
  - Covers: AC-006, AC-007

- [x] T-006: Run targeted, aggregate, build, Workbench, and Harness verification; record results in review and summary.
  - Covers: AC-007
