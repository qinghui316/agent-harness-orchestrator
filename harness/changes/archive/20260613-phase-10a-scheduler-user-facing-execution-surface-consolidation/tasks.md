# Tasks: Phase 10A Scheduler User Facing Execution Surface Consolidation

- [x] T-001: Repair Phase 9Z -> Phase 10A docs handoff.
  - Covers: AC-001
- [x] T-002: Add scheduler user-facing confirmation surface helper and apply it to Workbench projection / action labels.
  - Covers: AC-002, AC-003, AC-004, AC-008
- [x] T-003: Move scheduler Workbench action handler glue into an owned scheduler handler module.
  - Covers: AC-004, AC-005, AC-006
- [x] T-004: Add focused tests for confirmation surface, action compatibility, and module boundaries.
  - Covers: AC-002, AC-003, AC-004, AC-006, AC-007, AC-008
- [x] T-005: Run focused/full verification and update review/summary.
  - Covers: AC-009

## Verification Notes

- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run build` passed.
- `npm run test -- tests/unit/workbench-module-boundaries.test.ts` passed.
- `npm run test -- tests/unit/workflow-actions.test.ts` passed.
- `npm run test -- tests/unit/workbench-server.test.ts` passed.
- `npm run test -- tests/unit/workbench.test.ts -t "shows the scheduler first worker rework audit gate"` passed.
- `npm run test -- tests/unit/workbench.test.ts -t "refreshes scheduler integration candidate"` passed.
- `npm run test -- tests/unit/workbench.test.ts -t "compiles SchedulerContract"` passed.
- `npm run test -- tests/unit/web-app.test.tsx` passed.
- `npm run test` first full run completed 358/359 tests and failed only `tests/unit/web-app.test.tsx > renders Chinese workbench panes and replay artifacts` on a tab `aria-selected` timing assertion; the exact failing test and full `web-app.test.tsx` file passed immediately when rerun in isolation.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` passed.
