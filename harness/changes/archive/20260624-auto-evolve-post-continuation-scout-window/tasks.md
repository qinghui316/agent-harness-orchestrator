# Tasks: auto-evolve-post-continuation-scout-window

- [x] T-001: Read pending archive window and current Harness evolution rules.
  - Covers: AC-001

- [x] T-002: Write `harness/evolution/proposals/20260624-post-continuation-scout-window-noop.md`.
  - Covers: AC-001, AC-003

- [x] T-003: Run user-authorized subagent independent review/scoring.
  - Covers: AC-002

- [x] T-004: Apply the selected Harness delta.
  - Covers: AC-003
  - Decision: no ECL/template/lint rule change; compress duplicated handoff
    current-state text in `AGENTS.md` and `docs/STATUS.md`.

- [x] T-005: Run Harness verification.
  - Covers: AC-003, AC-005

- [x] T-006: Record results row and mark evolution complete.
  - Covers: AC-004

- [x] T-007: Update final handoff docs and close the active change.
  - Covers: AC-005
