# Tasks: maintenance-artifact-store-write-validation-reuse

- [x] T-001: Move write-time validation into `writeMaintenanceJsonMarkdownArtifact()` without changing persisted object behavior.
  - Covers: AC-001, AC-003
- [x] T-002: Remove duplicate canonical maintenance pre-write parses only where the shared writer now owns validation.
  - Covers: AC-002, AC-003
- [x] T-003: Add boundary test for invalid writer input rejection and no partial JSON/Markdown writes.
  - Covers: AC-004
- [x] T-004: Run targeted/product/Harness verification, independent review, and prepare close-ready handoff.
  - Covers: AC-005

