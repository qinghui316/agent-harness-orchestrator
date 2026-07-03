# Tasks: workbench-conversation-delete-harness-resume-entry-v1

- [x] T-001: Implement Workbench conversation delete/tombstone store behavior without mutating Harness Change truth.
  - Covers: AC-001, AC-002
- [x] T-002: Split sidebar-visible topics from addressable/resume topics so deleted active Changes remain reachable.
  - Covers: AC-003, AC-004
- [x] T-003: Add project-level active-work resume entry and deleted-conversation resume context that excludes deleted transcript.
  - Covers: AC-004, AC-005
- [x] T-004: Update sidebar UI wording and deletion behavior without exposing Change lifecycle options.
  - Covers: AC-001, AC-003, AC-006
- [x] T-005: Add regression tests for deletion, Harness preservation, resume entry, prompt-context exclusion, and unchanged gates.
  - Covers: AC-001, AC-002, AC-003, AC-004, AC-005, AC-006, AC-007
- [x] T-006: Update docs and run targeted, standard, and Harness verification.
  - Covers: AC-007
