# Tasks: workbench-two-tier-scoped-automation-authorization-v1

- [x] T-001: Add workflow action contract and payload plumbing for `planning.automation.scoped-auto.run`.
  - Covers: AC-001, AC-002, AC-007

- [x] T-002: Implement `src/automation-runtime/` authorization, run, iteration, allowed-action policy, and stop rules.
  - Covers: AC-002, AC-003, AC-004, AC-005, AC-006, AC-008, AC-011

- [x] T-003: Extract reusable current-gate revalidation for server endpoint and automation child executor.
  - Covers: AC-004, AC-007, AC-008, AC-011

- [x] T-004: Add Workbench automation action handler and child dispatch path that preserves ToolPolicyGate and target validation.
  - Covers: AC-004, AC-005, AC-006, AC-007, AC-008

- [x] T-005: Add two-tier Workbench projection and UI surface without duplicate primary gates or fake future capabilities.
  - Covers: AC-001, AC-009, AC-010, AC-011

- [x] T-006: Add targeted runtime, action revalidation, read-model, and DOM tests.
  - Covers: AC-001, AC-002, AC-003, AC-004, AC-005, AC-006, AC-007, AC-008, AC-009, AC-010, AC-011

- [x] T-007: Run verification, update review evidence, perform real UI acceptance if feasible, update handoff docs, and close/archive.
  - Covers: AC-001, AC-002, AC-003, AC-004, AC-005, AC-006, AC-007, AC-008, AC-009, AC-010, AC-011
