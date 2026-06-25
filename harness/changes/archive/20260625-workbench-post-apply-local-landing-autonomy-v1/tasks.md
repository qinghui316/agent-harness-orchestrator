# Tasks: workbench-post-apply-local-landing-autonomy-v1

- [x] T-001: Inspect scoped automation, landing projection, action
  revalidation, and current tests.
  - Covers: AC-001, AC-003, AC-004, AC-005
- [x] T-002: Add `landing.prepare` to existing scoped local automation without
  adding new runtime/permission/projection systems.
  - Covers: AC-001, AC-002, AC-003
- [x] T-003: Preserve stale/cross-change/target fail-closed behavior for
  landing automation.
  - Covers: AC-001, AC-004
- [x] T-004: Update Workbench projection/DOM tests so `landing.prepare` is
  eligible and remote/high-impact gates are not.
  - Covers: AC-005
- [x] T-005: Run targeted and required verification.
  - Covers: AC-001, AC-002, AC-003, AC-004, AC-005
- [x] T-006: Record acceptance, source safety, handoff drift, and later
  `workbench-confirmation-feedback-to-rework-v1` direction.
  - Covers: AC-006
