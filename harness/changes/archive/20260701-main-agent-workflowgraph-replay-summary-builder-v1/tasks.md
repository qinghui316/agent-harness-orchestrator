# Tasks: main-agent-workflowgraph-replay-summary-builder-v1

- [x] T-001: Add read-only WorkflowGraph replay summary types and builder.
  - Covers: AC-001, AC-002, AC-005
- [x] T-002: Add evidence health and gap handling for missing, malformed,
  old-schema, stale, and scope-mismatched inputs.
  - Covers: AC-003, AC-004
- [x] T-003: Export the builder and add architecture/boundary tests.
  - Covers: AC-001, AC-005
- [x] T-004: Add replay behavior tests for canonical state priority,
  created/unbound WorkflowRun, scope mismatch, malformed jsonl, and completed
  state with no executable recommendation.
  - Covers: AC-002, AC-003, AC-004
- [x] T-005: Fix handoff documentation drift and update review evidence.
  - Covers: AC-006
