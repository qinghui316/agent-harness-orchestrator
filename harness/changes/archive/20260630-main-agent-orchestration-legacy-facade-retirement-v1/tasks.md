# Tasks: main-agent-orchestration-legacy-facade-retirement-v1

- [x] T-001: Add explicit main-agent orchestration entrypoints for TaskRun,
  source-refresh rework, and feedback rework.
  - Covers: AC-002, AC-003, AC-004
- [x] T-002: Replace production legacy facade imports/calls/exports and remove
  `runLegacyCodeValidateAuditFacade` from the public surface.
  - Covers: AC-001, AC-002
- [x] T-003: Update tests to protect the new owner boundary and preserve
  TaskRun/rework behavior.
  - Covers: AC-001, AC-003, AC-004, AC-005
- [x] T-004: Run verification and update review/summary with outcomes.
  - Covers: AC-005
