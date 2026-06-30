# Tasks: main-agent-workflowgraph-observation-evidence-queue-wrapper-drain-v1

- [x] T-001: Add WorkflowGraph observation/evidence owner with schema, reader, writer, stage decisions, and fail-closed reads.
  - Covers: AC-001, AC-002, AC-003, AC-006
- [x] T-002: Record graph observation evidence from planning artifact handlers and TaskQueue lifecycle without changing execution behavior.
  - Covers: AC-004, AC-006
- [x] T-003: Drain production Workbench usage of `runTaskQueueSequence` while keeping the wrapper compatibility-only.
  - Covers: AC-005
- [x] T-004: Add architecture and behavior tests for graph evidence, no-execution, no-duplication, wrapper drain, and boundary imports.
  - Covers: AC-001, AC-002, AC-003, AC-004, AC-005, AC-006
- [x] T-005: Run verification and update close/handoff docs.
  - Covers: AC-001, AC-002, AC-003, AC-004, AC-005, AC-006
