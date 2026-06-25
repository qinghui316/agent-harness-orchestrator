# Tasks: auto-evolve-post-integrationfix-apply-window

- [x] T-001: Read pending evolution, candidate archives, ECL evolution rules,
  and current handoff docs.
  - Covers: AC-001
- [x] T-002: Produce evolution proposal with Experience Retention Scan.
  - Covers: AC-002, AC-005
- [x] T-003: Record independent subagent review and score.
  - Covers: AC-003
- [x] T-004: Apply the final minimal decision, if any durable docs/template
  delta is justified.
  - Covers: AC-005
- [x] T-005: Mark evolution complete with `harness-evolve mark-complete`.
  - Covers: AC-004
- [x] T-006: Run Harness checks, close active change, and git-settle.
  - Covers: AC-006
