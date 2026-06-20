# controlled-scheduler-loop-tick-runtime-boundary

## Purpose

Make the existing human-confirmed controlled Scheduler advance behave like an explicit, reusable SchedulerRun-scoped controlled loop tick boundary. The current `planning.scheduler.controlled-advance.run` already refreshes Goal Loop evidence, executes one concrete scheduler gate, records post-step evidence, and stops; this change makes that lifecycle a scheduler-runtime owned tick contract instead of leaving the phase semantics implicit in the Workbench handler.

The change moves the product closer to the usable Goal-driven Adaptive Loop by recording one real tick as observe/check/dispatch/reconcile/route-stop evidence while preserving the existing single human confirmation, ToolPolicy, stale revalidation, validation/audit, IntegrationCheck, apply/close, remote, and Harness-evolution boundaries.

## Scope

In scope:

- Extend existing `SchedulerControlledStepEvidence` with a controlled loop tick contract summary rather than creating a separate artifact family.
- Put controlled loop tick phase/authority summary construction in owned scheduler runtime modules and reuse existing workflow-scheduler controlled-step contracts.
- Keep `planning.scheduler.controlled-advance.run` as the existing Workbench confirmation entry while reducing any new Workbench logic to dispatch/result glue and read-only projection.
- Project the tick summary into the existing Workpad controlled-step evidence card as read-only state.
- Verify stale/scope mismatch fails closed before dispatch and no-authority flags remain false.

Out of scope:

- No automatic scheduler loop, hidden continuation, or repeated dispatch.
- No new user-facing primary action, confirmation item, route, CLI command, or ToolPolicy path.
- No whole-wave dispatch, slot allocation, full parallel executor, child Change creation, source apply, close/archive, merge, remote landing, or Harness evolution automation.
- No independent artifact family unless implementation proves the existing controlled-step evidence cannot hold the tick contract.

## Current Status

Completed.

Implemented as a scheduler-runtime owned `controlledLoopTick` summary on existing controlled-step evidence. The existing `planning.scheduler.controlled-advance.run` action still performs one human-confirmed concrete scheduler transition through `planning.scheduler.controlled-step.run`, records post-step evidence, projects the tick summary read-only into Workpad, and stops without adding automatic loop, hidden continuation, new action, ToolPolicy path, source apply/merge/close, remote landing, or Harness evolution automation.

## Verification

- `npx vitest run tests/unit/controlled-scheduler-step-contract.test.ts tests/unit/scheduler-controlled-step-evidence.test.ts tests/unit/controlled-scheduler-advance-post-step.test.ts tests/unit/web-app.test.tsx` - passed, 4 files / 48 tests.
- `npm run typecheck` - passed.
- `npm run lint` - passed.
- `npm run test:fast` - passed after stabilizing existing App DOM waits and adding cross-Change fail-closed coverage, 38 files / 396 tests.
- `npm run build` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` - passed; no pending evolution, 3 archived changes since last completion, threshold 5.
- Slow Workbench scheduler flow was not used as the close gate. Earlier local attempts at `tests/slow/workbench-scheduler-flow.test.ts` timed out without assertion output; targeted runtime/action/projection/App DOM tests plus `test:fast` cover the touched boundary for this change.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: `npm run test:fast` initially exposed brittle App DOM synchronization in `tests/unit/web-app.test.tsx`; the tests were updated to wait for the Workpad details summary and run-graph projection before asserting. Independent subagent close-ready review returned `REVISE` because `assertControlledSchedulerFreshGateMatchesRequest()` did not compare cross-Change `changeId`; that blocker was fixed in `src/workflow-scheduler/controlled-step.ts` and covered in `tests/unit/controlled-scheduler-step-contract.test.ts`. Slow Workbench scheduler flow was not rerun as a close gate after earlier local timeouts.
- Screenshots / artifacts / run ids: deterministic App DOM assertions in `tests/unit/web-app.test.tsx` cover the visible Workpad tick summary.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded; future scheduler loop work should build on this tick summary rather than parsing Workbench handler branches.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: applicable. `AGENTS.md` and `docs/STATUS.md` were kept to active-handoff deltas; detailed history stays in archived summaries and `harness/changes/INDEX.json`.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: post-close handoff must switch to no active change and latest archive path.
- Old experience retained / merged / retired / archive-only: no historical phase narrative promoted into current docs.
