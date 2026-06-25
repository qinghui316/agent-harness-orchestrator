# Tasks: workbench-integrationfix-real-ui-acceptance-v1

- [x] T-001: Create active change scope and handoff pointers.
  - Covers: AC-001
- [x] T-002: Build and prepare the E-drive external sandbox with dependencies and real aggregate validation setup.
  - Covers: AC-001, AC-004, AC-007
- [x] T-003: Drive the real Workbench UI path to same-Change scheduler workers and ready integration candidate.
  - Covers: AC-001, AC-002, AC-003
- [x] T-004: Manually confirm IntegrationCheck and capture aggregate failure plus Codex-backed IntegrationFix evidence.
  - Covers: AC-003, AC-004, AC-005
- [x] T-005: Verify post-repair aggregate validation/audit and final human gate or blocker classification.
  - Covers: AC-005, AC-006, AC-007
- [x] T-006: If needed, patch only the blocker owner and run targeted verification.
  - Covers: AC-002, AC-003, AC-004, AC-005, AC-006, AC-007
- [x] T-008: Patch the Workbench planning/decomposition owner so accepted low-conflict two-file plans produce scheduler-ready TaskGraph structure instead of a single-worktree fallback.
  - Covers: AC-002, AC-003
- [x] T-009: Patch controlled continuation so it stops at the manual `planning.scheduler.integration-check.run` barrier instead of auto-consuming it.
  - Covers: AC-003, AC-006
- [x] T-007: Complete review coverage, handoff docs, Harness checks, close, and git settlement.
  - Covers: AC-001, AC-006, AC-007
