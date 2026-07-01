# Tasks: main-agent-workflowgraph-decision-policy-v1

- [x] T-001: Add non-executing WorkflowGraph decision policy owner.
  - Covers: AC-001, AC-005
- [x] T-002: Refactor replay summary construction to use summary core plus policy-derived `nextObservation`.
  - Covers: AC-002, AC-003, AC-005
- [x] T-003: Remove public `decideMainAgentWorkflowGraph` barrel export while preserving graph observation evidence behavior.
  - Covers: AC-004
- [x] T-004: Add and update unit / boundary tests for policy mapping, replay behavior, and module boundaries.
  - Covers: AC-001, AC-002, AC-003, AC-004, AC-005, AC-006
- [x] T-005: Run verification and update review/summary closeout.
  - Covers: AC-006
