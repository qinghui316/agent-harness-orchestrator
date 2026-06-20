# Tasks: controlled-scheduler-reconfirm-copy

- [x] T-001: Add refreshed controlled scheduler reconfirmation copy in the existing scheduler user-surface owner.
  - Covers: AC-001, AC-003, AC-005
- [x] T-002: Wire the current Workpad into controlled scheduler advance confirmation projection and select refreshed copy only from matching current Goal Loop/controller/preflight evidence.
  - Covers: AC-001, AC-003, AC-005
- [x] T-003: Preserve action invariants: one controlled-advance action, scoped target ids retained, stale Goal Loop ids stripped, no duplicate primary action.
  - Covers: AC-002, AC-005
- [x] T-004: Add projection unit coverage for default and refreshed copy behavior.
  - Covers: AC-001, AC-002, AC-003
- [x] T-005: Add real web DOM coverage for the right confirmation card showing refreshed/new-single-step/non-auto-loop wording.
  - Covers: AC-004
- [x] T-006: Run targeted product and Harness verification, complete review, update handoff, and close the change if ready.
  - Covers: AC-001, AC-002, AC-003, AC-004, AC-005
