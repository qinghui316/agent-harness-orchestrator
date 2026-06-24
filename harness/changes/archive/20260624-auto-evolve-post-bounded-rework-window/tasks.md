# Tasks: auto-evolve-post-bounded-rework-window

- [x] T-001: Read pending evolution, candidate archive summaries, ECL rules,
  current handoff docs, and current plan.
  - Covers: AC-001

- [x] T-002: Draft evolution proposal with recommendation and Experience
  Retention Scan.
  - Covers: AC-001, AC-003

- [x] T-003: Run authorized subagent independent review and record its verdict.
  - Covers: AC-002, AC-003

- [x] T-004: Apply any validated minimal Harness/handoff delta, or record `noop`
  rationale if existing rules are sufficient.
  - Covers: AC-003, AC-005

- [x] T-005: Run Harness verification and mark evolution complete through
  `scripts/harness-evolve.ps1 mark-complete`.
  - Covers: AC-004, AC-006

- [x] T-006: Close active change, update final handoff pointers, verify, and git
  settle while excluding unrelated `README.md`.
  - Covers: AC-005, AC-006
