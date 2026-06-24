# Tasks: workbench-real-ui-continuation-next-blocker-scout

- [x] T-001: Confirm clean baseline and external sandbox setup.
  - Covers: AC-001
  - Evidence: repo baseline excluded unrelated `README.md`; final sandbox used
    `C:\aho-accept\continue-next-external\src` and
    `C:\aho-accept\continue-next-external\home` with external-local memory.

- [x] T-002: Build and launch Workbench against the external sandbox.
  - Covers: AC-001, AC-002
  - Evidence: `npm run build` passed; Workbench ran at
    `http://127.0.0.1:4335/`.

- [x] T-003: Drive the real browser UI through the ordinary manual-gated path and record visible primary gates.
  - Covers: AC-002, AC-004, AC-005
  - Evidence: real UI gates reached planning, decomposition/readiness,
    `code.run`, validation/audit, audit accept, apply with local commit, and
    close/archive.

- [x] T-004: Exercise one visible bounded continuation gate if the ordinary path exposes a supported controlled Scheduler gate.
  - Covers: AC-003
  - Evidence: the ordinary single-change path did not naturally expose a
    supported controlled Scheduler gate, so no fake continuation was
    manufactured. Existing V1 continuation smoke remains the baseline.

- [x] T-005: Classify any blocker and implement the smallest owned-boundary fix when needed.
  - Covers: AC-006, AC-007
  - Evidence: fixed `.agent-harness/workbench/` ignore ownership in
    `src/harness/init.ts`; fixed BOM-safe package JSON reads in
    `src/workbench/intake.ts` and `src/worktree/dependencies.ts`.

- [x] T-006: Run required verification and update review evidence.
  - Covers: AC-002, AC-003, AC-004, AC-005, AC-006, AC-007
  - Evidence: targeted suites, `npm run typecheck`, `npm run lint`,
    `npm run test:fast`, `npm run build`, and `npm run test:workbench` passed.

- [x] T-007: Close out handoff docs and archive the change.
  - Covers: AC-001, AC-006
  - Evidence: summary/review updated with close-ready evidence; handoff docs are
    prepared for archive closeout.
