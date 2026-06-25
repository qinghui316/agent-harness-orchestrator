# Tasks: workbench-codex-plan-mode-post-plan-local-autonomy-v1

- [x] T-001: Add proposed-plan parser and tests.
  - Covers: AC-001, AC-002, AC-003

- [x] T-002: Add Codex planning mode options to app-server/chat adapters with native-or-fallback metadata.
  - Covers: AC-001, AC-003

- [x] T-003: Extend planning bundle schemas/types/rendering with optional proposal metadata and warnings.
  - Covers: AC-002, AC-003

- [x] T-004: Update planning generation so proposed plan drives visible draft/`planMd` while AHO derives spec/tasks/AC conservatively.
  - Covers: AC-001, AC-002, AC-003, AC-009

- [x] T-005: Add `postPlanAutomationMode` to action payload/server forwarding and make plan confirmation start automation only after successful artifact write.
  - Covers: AC-004, AC-005, AC-006, AC-007

- [x] T-006: Update DecisionPanels UI and DOM tests for two-tier plan confirmation semantics.
  - Covers: AC-004, AC-008, AC-009

- [x] T-007: Update automation/action validation tests to prove plan confirmation is not in child automation allowlist and post-plan automation starts from fresh gate.
  - Covers: AC-005, AC-006, AC-007, AC-009

- [x] T-008: Run targeted verification and required product checks.
  - Covers: AC-009

- [x] T-009: Perform or record E-drive real UI acceptance.
  - Covers: AC-001, AC-004, AC-006, AC-007, AC-008

- [x] T-010: Closeout, handoff drift update, Harness checks, archive, and git settlement.
  - Covers: AC-009
