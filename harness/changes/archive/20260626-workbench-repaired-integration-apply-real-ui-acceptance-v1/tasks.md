# Tasks: workbench-repaired-integration-apply-real-ui-acceptance-v1

- [x] T-001: Verify repo and external sandbox preconditions.
  - Covers: AC-001, AC-003
- [x] T-002: Start Workbench against the external source and capture the real UI primary gate.
  - Covers: AC-001, AC-002, AC-006
- [x] T-003: Confirm `apply-check.apply` through the browser UI and record source safety evidence.
  - Covers: AC-003, AC-004
- [x] T-004: Verify post-apply IntegrationCheck status and that stale apply/discard is not the primary gate.
  - Covers: AC-004, AC-005
- [x] T-005: If product code changes are needed, make only the minimal owner-scoped fix and run targeted verification.
  - Covers: AC-002, AC-005, AC-006
- [x] T-006: Complete review evidence, Harness checks, closeout, and git settlement.
  - Covers: AC-001, AC-002, AC-003, AC-004, AC-005, AC-006
