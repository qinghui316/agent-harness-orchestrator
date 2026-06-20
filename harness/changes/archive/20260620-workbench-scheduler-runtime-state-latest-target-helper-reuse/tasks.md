# Tasks: workbench-scheduler-runtime-state-latest-target-helper-reuse

- [x] T-001: Replace the two `planning.scheduler.plan.prepare` latest id branches with `assertLatestWorkbenchActionTarget`.
  - Covers: AC-001
- [x] T-002: Replace the `planning.scheduler.runtime.reserve-claims` latest SchedulerReconcileSnapshot branch with `assertLatestWorkbenchActionTarget`.
  - Covers: AC-002
- [x] T-003: Update module-boundary assertions for helper adoption and old raw comparison removal.
  - Covers: AC-003, AC-004
- [x] T-004: Run targeted product verification and Harness checks, recording full-test skip rationale if applicable.
  - Covers: AC-005
- [x] T-005: Complete close-ready review, update handoff docs, close the change, and check Harness evolution state.
  - Covers: AC-005
