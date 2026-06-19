# Tasks: Workbench Test Architecture Task Runtime Domain Split

- [x] T-001: Move shared TaskRun / TaskQueue / WorkflowRun fixture helpers to `tests/unit/workbench/fixtures.ts`
  - Covers: AC-001, AC-002
- [x] T-002: Create `tests/unit/workbench-task-runtime.test.ts` and move the runtime/action-validation cluster
  - Covers: AC-001, AC-003
- [x] T-003: Remove moved tests and duplicate helper implementations from `tests/unit/workbench.test.ts`
  - Covers: AC-002, AC-003, AC-005
- [x] T-004: Update package scripts for explicit Workbench suite routing and fast-test exclusion
  - Covers: AC-004
- [x] T-005: Run targeted verification and record review/close evidence
  - Covers: AC-001, AC-002, AC-003, AC-004, AC-005
