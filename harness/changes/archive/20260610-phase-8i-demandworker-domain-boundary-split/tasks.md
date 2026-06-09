# Tasks: Phase 8I DemandWorker Domain Boundary Split

- [x] T-001: Record pre-existing dirty state and update Phase 8I handoff docs.
  - Covers: AC-001
- [x] T-002: Split DemandWorker schemas/types and paths/artifacts.
  - Covers: AC-002, AC-003, AC-004
- [x] T-003: Split repository, decisions, and queue projection modules.
  - Covers: AC-002, AC-003, AC-004, AC-010, AC-013
- [x] T-004: Split slot policy, claim service, lifecycle, and reconcile modules.
  - Covers: AC-002, AC-003, AC-006, AC-007, AC-008, AC-009, AC-010, AC-011
- [x] T-005: Keep `src/demand-worker/manager.ts` as a compatibility facade and add boundary tests.
  - Covers: AC-002, AC-004, AC-005
- [x] T-006: Preserve Workbench demand worker pump behavior and focused regressions.
  - Covers: AC-012, AC-013, AC-014
- [x] T-007: Run product and Harness verification and update close evidence.
  - Covers: AC-015
