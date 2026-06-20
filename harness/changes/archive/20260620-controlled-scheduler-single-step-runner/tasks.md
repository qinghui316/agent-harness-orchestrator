# Tasks: controlled-scheduler-single-step-runner

- [x] T-001: Register `planning.scheduler.controlled-step.run` as a live, high-impact, revalidated workflow action with strict required targets.
  - Covers: AC-001, AC-004
- [x] T-002: Add controlled-step guard/conversion logic that accepts only fresh Goal Loop-assisted `planning.scheduler.*` gates and reconstructs one concrete scheduler request.
  - Covers: AC-002, AC-004
- [x] T-003: Add a thin controlled-step scheduler handler that audits/revalidates the nested concrete action and dispatches exactly one existing scheduler handler.
  - Covers: AC-003, AC-004
- [x] T-004: Update Workbench confirmation projection/copy to expose a single controlled-step affordance only when fresh matching Goal Loop evidence exists.
  - Covers: AC-005, AC-006
- [x] T-005: Add targeted unit and slow scheduler-flow coverage.
  - Covers: AC-001, AC-002, AC-003, AC-004, AC-005, AC-006, AC-007
- [x] T-006: Run verification, complete independent review, update handoff, and close/git if close-ready.
  - Covers: AC-007
