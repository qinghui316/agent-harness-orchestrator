# Review: Workbench Verification Runtime Convergence

Status: completed.

## Findings

No blocking issues remain.

## Verification Runtime Coverage

- Daily Workbench aggregate now passes in the ordinary tool window:
  `npm run test:workbench` passed in 768.6 seconds with 0 repo-scoped
  Node/Vitest processes before and after the run.
- Release/deep Workbench coverage remains explicit:
  `npm run test:workbench:release` passed in 2073.9 seconds with 0
  repo-scoped Node/Vitest processes before and after the run.
- Full scheduler two-worker golden coverage is retained in
  `npm run test:workbench:slow:scheduler:release`.
- Daily scheduler slow coverage retains focused capability-domain checks:
  worker runtime, worker rework, discard/completion, integration outcome,
  run completion, blocked closeout, source-safety, and Goal Loop handoff
  boundaries.

## Process Cleanup Coverage

- Baseline failure: the old full `test:workbench` aggregate timed out around
  1204 seconds while running `workbench-goal-loop-prompt-flow.test.ts` and left
  20 repo-scoped Node/Vitest/tinypool processes after forced timeout.
- Root cause addressed: Windows process termination returned before the
  `taskkill` helper finished releasing the child process tree, which could
  leave temp directories busy under aggregate cleanup.
- Fix: `executeProcessStreaming` now waits for Windows `taskkill` to return
  before starting the kill-grace settle window.
- Targeted proof: `npx vitest run tests/unit/run.test.ts` passed.
- Aggregate proof: `npm run test:fast` passed after the fix.

## Verification

Passed:

- `npx vitest run tests/unit/run.test.ts`
- `npm run test:fast`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run test:workbench:slow:scheduler`
- `npm run test:workbench`
- `npm run test:workbench:release`

Harness checks are part of closeout and are recorded in the final archive
summary after close.

## Documentation Entropy Coverage

- Documentation entropy coverage applicable: yes.
- Documents checked: `AGENTS.md`, `docs/STATUS.md`,
  `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- Before line counts: `AGENTS.md` 196 lines, `docs/STATUS.md` 185 lines.
- Duplicate current-state fields checked: yes; duplicate next-step/status
  language was removed or shortened.
- Roadmap/current-direction stale language checked: yes; stale "full
  test:workbench still exceeded" and old Harness-evolution pointers were
  replaced with the current daily/release split.
- Archive-ledger content promoted / retained / merged / retired /
  archive-only: detailed timing evidence is archive-only in this change;
  current docs retain only the actionable result.

## Experience Lifecycle Coverage

- Experience lifecycle coverage applicable: yes for handoff cleanup, not as a
  Harness auto-evolve.
- Promote decisions: none.
- Retain decisions: retain the current rule that daily Workbench verification
  should be bounded and release/deep verification explicit.
- Merge decisions: merged duplicate Workbench verification next-step language
  into a single current handoff.
- Retire decisions: retired stale current-state text saying full
  `test:workbench` still exceeded the ordinary tool window.
- Archive-only decisions: keep per-suite timings and old timeout process
  counts in this archived review/summary.

## Workbench User-Surface Honesty Coverage

- Workbench user-surface honesty coverage applicable: no.
- Reason: this change adjusts verification topology and process lifecycle, not
  Workbench UI decision surfaces, confirmation queues, or visible product
  actions.

## Scoped Workbench Action Payload Coverage

- Scoped Workbench action payload coverage applicable: no.
- Reason: this change does not add or change Workbench live/server actions or
  target payload contracts.

## Runtime Bridge Boundary Coverage

- Runtime bridge boundary coverage applicable: yes.
- Checked boundary: shared local process execution lifecycle used by Codex,
  validation, audit, and local command runners.
- Result: termination still preserves timeout/completion semantics while
  waiting for Windows process-tree cleanup before forced settle.
- Tested with: `npx vitest run tests/unit/run.test.ts`,
  `npm run test:fast`, `npm run test:workbench`,
  `npm run test:workbench:release`.

## Module Boundary Coverage

- Module boundary coverage applicable: yes.
- Owner module: `src/run/process.ts`.
- Moved responsibilities: none.
- Retained facade responsibilities: callers still use `executeProcessStreaming`
  unchanged.
- Compatibility surface: no external CLI/API or artifact schema change.
- Tested with: targeted run tests, fast aggregate, Workbench daily aggregate,
  and Workbench release/deep aggregate.

## Core Mechanism Reuse Coverage

- Core mechanism reuse / architecture growth control coverage applicable: yes.
- Existing mechanisms reused or strengthened: package script layers and shared
  process execution lifecycle.
- New cross-cutting mechanism and owner: none.
- Local framework avoided: no new test runner or cleanup wrapper was added.
- Future-cost reduction result: daily Workbench verification is a reliable
  signal; deep coverage remains available without being confused with ordinary
  iteration health.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- Handoff files checked: `AGENTS.md`, `docs/STATUS.md`,
  `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- Stale active-path / phase grep: run before closeout; active paths are
  expected until archive.
- Latest archive / active path alignment: will be checked again after close.
- Pending evolution state checked: no pending Harness evolution before close.
