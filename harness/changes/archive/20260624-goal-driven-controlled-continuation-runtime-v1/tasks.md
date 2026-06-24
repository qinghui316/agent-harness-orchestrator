# Tasks: Goal-Driven Controlled Continuation Runtime V1

- [x] T-001: Extend workflow action contracts and payload plumbing for `planning.goal-loop.controlled-continue.run`.
  - Covers: AC-001, AC-002, AC-003

- [x] T-002: Add server/current-target revalidation for bounded continuation targets.
  - Covers: AC-002, AC-003, AC-006

- [x] T-003: Implement `src/goal-loop-runtime/` authorization, run, iteration, stop-reason, and child-step orchestration.
  - Covers: AC-004, AC-005, AC-006, AC-007

- [x] T-004: Add Workbench action handler integration and child audit scope linkage.
  - Covers: AC-004, AC-005, AC-006

- [x] T-005: Add Workbench projection/UI affordance for one bounded continuation primary gate.
  - Covers: AC-001, AC-002, AC-008, AC-009

- [x] T-006: Add targeted unit, service, projection, and DOM tests.
  - Covers: AC-001, AC-002, AC-003, AC-004, AC-005, AC-006, AC-007, AC-008, AC-009

- [x] T-007: Run required verification and update review/handoff evidence.
  - Covers: AC-001, AC-002, AC-003, AC-004, AC-005, AC-006, AC-007, AC-008, AC-009
  - Status: targeted verification, fast/type/lint/build, full `npm run test:workbench`, real browser UI smoke, and Harness checks passed. Real UI smoke used external sandbox `C:\aho-accept\continue-v1` and confirmed one bounded continuation authorization executed two controlled Scheduler child steps before stopping at the next real gate.
