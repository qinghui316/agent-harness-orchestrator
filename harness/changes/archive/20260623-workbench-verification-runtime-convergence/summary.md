# Workbench Verification Runtime Convergence

## Purpose

Converge the current known Workbench verification runtime problems in one
structured change. The target is a daily `npm run test:workbench` gate that can
finish in an ordinary tool window while preserving the full scheduler golden
coverage through an explicit release/deep gate.

This is test topology and verification-signal work. It does not expand product
runtime behavior, Scheduler authority, Goal Loop authority, source apply, or
automation.

## Scope

In scope:

- Diagnose current Workbench unit/slow/scheduler aggregate timings and
  repo-scoped leftover Node/Vitest process behavior.
- Split the over-heavy scheduler two-worker golden path out of the daily
  Workbench aggregate.
- Add or adjust a release/deep Workbench gate for the full scheduler
  two-worker golden path.
- Preserve scheduler/runtime/source-safety/Goal Loop/IntegrationCheck coverage
  in daily seeded capability-domain tests plus release coverage.
- Clean small handoff drift in `docs/STATUS.md` and
  `docs/CURRENT-DEVELOPMENT-PLAN.md`.

Out of scope:

- Product behavior expansion.
- Full-auto task mode, Scheduler loop, parallel executor, child Change auto
  creation, automatic apply/close, or remote push/merge.
- Deleting safety assertions to make tests pass faster.
- Including unrelated untracked `README.md`.

## Current Status

Completed / ready to close.

## Changes Made

- Split Workbench verification into daily and release/deep package scripts:
  - `npm run test:workbench` remains the daily Workbench aggregate.
  - `npm run test:workbench:release` runs the daily aggregate plus explicit
    deep slow coverage.
  - `npm run test:workbench:slow:scheduler:release` owns the full
    two-worker scheduler golden path.
- Kept daily scheduler coverage broad by retaining focused capability-domain
  suites in `test:workbench:slow:scheduler`: worker runtime, worker rework,
  discard/completion, integration outcome, run completion, blocked closeout,
  source-safety, and Goal Loop handoff boundaries.
- Moved the heaviest full-chain scenarios out of the daily aggregate and into
  release/deep coverage: two-worker scheduler golden, apply/integration
  deep flow, and Goal Loop prompt deep flow.
- Hardened `executeProcessStreaming` on Windows so timeout/completion
  termination waits for `taskkill` to return before starting the kill-grace
  settle window. This fixed the aggregate-only `EBUSY` cleanup failure seen in
  `tests/unit/run.test.ts`.
- Cleaned current handoff drift by removing duplicate next-step language and
  stale latest-Harness-evolution pointers.

## Verification

Passed:

- `npx vitest run tests/unit/run.test.ts`
- `npm run test:fast`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run test:workbench:slow:scheduler`
  - Final run: passed, 286.3 seconds, repo-scoped Node/Vitest processes before
    0 and after 0.
- `npm run test:workbench`
  - Final run: passed, 768.6 seconds, repo-scoped Node/Vitest processes before
    0 and after 0.
- `npm run test:workbench:release`
  - Final run: passed, 2073.9 seconds, repo-scoped Node/Vitest processes
    before 0 and after 0.

Diagnostic baseline from this change:

- Old daily `npm run test:workbench` topology timed out after about 1204
  seconds while running `workbench-goal-loop-prompt-flow.test.ts` and left 20
  repo-scoped Node/Vitest/tinypool processes after the forced timeout.
- Individual slow-file diagnostics passed without leftovers:
  - `workbench-demand-to-execution-golden-flow`: 43.7 seconds.
  - `workbench-remote-landing-flow`: 189.5 seconds.
  - `workbench-apply-integration-flow`: 391.6 seconds.
  - `workbench-maintenance-flow`: 23.5 seconds.
  - `workbench-goal-loop-prompt-flow`: 395.9 seconds.
- `npm run test:fast` initially exposed `EBUSY` during
  `tests/unit/run.test.ts`; the process termination fix resolved it and the
  final `test:fast` passed.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: the fix is in the shared
  process runner, not a test-only workaround.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: applicable for AGENTS/STATUS/current-plan
  active pointers and final handoff. Timing detail is retained here in the
  archive record; handoff docs should keep only the current result and next
  decision.
- Experience lifecycle result: not an auto-evolve change.
- Roadmap/current-direction stale language check: active pointer update and
  final closeout required.
- Old experience retained / merged / retired / archive-only: scheduler timing
  details should remain in this change archive, not be copied into handoff
  docs.
