# Tasks: controlled-scheduler-post-step-routing-preflight-handoff

- [x] T-001: Add optional controlled Scheduler post-step routing support types,
  schema, and rendering to Goal Loop preflight.
  - Covers: AC-001, AC-004, AC-005
- [x] T-002: Validate optional support in
  `compileGoalLoopGateReadinessPreflight()` with deterministic fail-closed
  checks.
  - Covers: AC-002, AC-003, AC-004
- [x] T-003: Add targeted tests for supported preflight inclusion, legacy
  preflight compatibility, stale/mismatched rejection, and no-authority flags.
  - Covers: AC-001, AC-002, AC-003, AC-004, AC-005
- [x] T-004: Run verification and complete independent close-ready review.
  - Covers: AC-005
- [x] T-005: Update close handoff docs, fix stale next-resume wording, close,
  and git commit when clean.
  - Covers: AC-006
