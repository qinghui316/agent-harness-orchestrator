# Tasks: workbench-scoped-automation-audit-acceptance-v1

- [x] T-001: Extend automation runtime gate types and policy for one allowed
  approval action, `audit.accept`.
  - Covers: AC-001, AC-004
- [x] T-002: Implement current-primary approval revalidation for automated
  `audit.accept`, including audit status and scope checks.
  - Covers: AC-002, AC-003
- [x] T-003: Wire automation child approval dispatch through existing approval
  action behavior without bypassing decision recording or high-impact gates.
  - Covers: AC-001, AC-003, AC-004
- [x] T-004: Update Workbench UI/projection behavior so full-access appears for
  safe `audit.accept` and remains unavailable for apply/close/unsupported
  gates.
  - Covers: AC-005
- [x] T-005: Add targeted runtime, revalidation, read-model, and DOM tests.
  - Covers: AC-001, AC-002, AC-003, AC-004, AC-005
- [x] T-006: Run required product and Harness verification.
  - Covers: AC-001, AC-002, AC-003, AC-004, AC-005
- [x] T-007: Run external-sandbox real UI acceptance and record source safety
  evidence.
  - Covers: AC-006
- [x] T-008: Close/handoff update and archive the structured change.
  - Covers: AC-001, AC-002, AC-003, AC-004, AC-005, AC-006
