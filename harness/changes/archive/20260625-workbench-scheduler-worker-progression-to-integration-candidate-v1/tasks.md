# Tasks: Workbench Scheduler Worker Progression To Integration Candidate V1

- [x] T-001: Run diagnostics on existing scheduler progression, automation allowlist, and candidate coverage.
  - Covers: AC-001, AC-003, AC-005

- [x] T-002: Add or tighten deterministic coverage for two same-Change worker outputs producing a ready SchedulerIntegrationCandidate.
  - Covers: AC-002, AC-003, AC-006

- [x] T-003: Add or tighten fail-closed coverage for cross-Change, stale, missing, forged, and drifted scheduler/candidate targets.
  - Covers: AC-004

- [x] T-004: Verify `完全访问权限` consumes only the controlled scheduler wrapper and never raw scheduler actions or IntegrationCheck apply/discard.
  - Covers: AC-001, AC-005

- [x] T-005: Fix the smallest existing owner if diagnostics reveal a real product gap.
  - Covers: AC-001, AC-002, AC-003, AC-004, AC-005, AC-006

- [x] T-006: Record reference evidence, Complexity Deletion Review, module boundary, core reuse, Goal Loop, Workbench surface, payload, runtime, and source safety coverage.
  - Covers: AC-007

- [x] T-007: Run required verification and E-drive real UI acceptance or record why deterministic evidence is sufficient.
  - Covers: AC-001, AC-002, AC-003, AC-004, AC-005, AC-006, AC-007

- [x] T-008: Close the change, update handoff docs, regenerate index, run Harness checks, and git settle excluding unrelated README.md.
  - Covers: AC-007
