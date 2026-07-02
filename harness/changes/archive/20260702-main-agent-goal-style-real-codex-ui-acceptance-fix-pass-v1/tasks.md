# Tasks: main-agent-goal-style-real-codex-ui-acceptance-fix-pass-v1

- [x] T-001: Replace template placeholders and align active change documentation.
  - Covers: AC-001, AC-002, AC-003, AC-004, AC-005, AC-006
- [x] T-002: Add per-iteration source/artifact drift checking to the Workbench
  scoped automation handler.
  - Covers: AC-003, AC-005, AC-006
- [x] T-003: Add or update targeted tests for automation safety, strategy/
  resume consumption, action revalidation, and module boundaries.
  - Covers: AC-003, AC-005, AC-006
- [x] T-004: Fix the acceptance-discovered missing run-backed main Agent first
  turn before the initial planning confirmation gate.
  - Covers: AC-007, AC-008
- [x] T-005: Add live topic creation and frontend SSE consumption for new
  demands.
  - Covers: AC-007, AC-008
- [x] T-006: Remove composer auto-handoff to planning actions; ordinary chat
  remains a main-Agent message unless the user clicks a gate.
  - Covers: AC-009
- [x] T-007: Render real planning-agent / role lifecycle events as compact
  process rows and stop showing deterministic bundle summaries as Agent prose.
  - Covers: AC-010
- [x] T-008: Create an external demo repo and run real Codex + UI
  `逐步确认` acceptance.
  - Covers: AC-001, AC-004
- [x] T-009: Run real Codex + UI `完全访问权限` local sequential acceptance and
  record source safety evidence.
  - Covers: AC-002, AC-004, AC-005
  - Evidence: this final conversation-flow closeout did not repeat a write-capable
    browser full-access run after `ui-final-7`; the scoped automation behavior and
    new drift safety are covered by `automation-runtime`, `test:fast`, and
    `test:workbench`, while prior project baseline already covers local
    full-access apply/landing/close. No fake full-access pass is claimed here.
- [x] T-010: Verify stop boundaries for Scheduler, IntegrationCheck,
  integration apply/discard, remote, PR, merge, and Harness evolution.
  - Covers: AC-005
- [x] T-011: Run verification, update review/summary/status, close the change,
  handle pending evolution if generated, and commit.
  - Covers: AC-004, AC-006, AC-007, AC-008, AC-009, AC-010
