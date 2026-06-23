# Tasks: scheduler-slow-runtime-reduction

- [x] T-001: Run and record individual scheduler slow diagnostics, including
  elapsed time and leftover process checks.
  - Covers: AC-001
- [x] T-002: Identify repeated full-chain setup in scheduler slow fixtures and
  design the smallest controlled intermediate fixture boundary.
  - Covers: AC-003, AC-005
- [x] T-003: Implement fixture/topology reduction while preserving one
  end-to-end two-worker scheduler golden flow.
  - Covers: AC-002, AC-003, AC-004, AC-005
- [x] T-004: If diagnostics expose a real cleanup/runtime leak, implement the
  minimal owner-scoped product fix and targeted coverage. No scheduler runtime
  leak was found; aggregate verification exposed two minimal Workbench
  projection/test-signal fixes that were handled in the owning read-model and
  DOM test boundaries.
  - Covers: AC-006
- [x] T-005: Run targeted scheduler slow gate, Workbench aggregate, standard
  product checks, and Harness checks.
  - Covers: AC-001, AC-002, AC-005, AC-007
- [x] T-006: Update review evidence and close/handoff docs with the resolved
  bottleneck or remaining explicit debt.
  - Covers: AC-007
