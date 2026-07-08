# scheduler-worker-path-read-model-compression-v0

## Purpose

Compress Scheduler worker-path read models into one scheduler-runtime owner.
This is a relationship cleanup, not a product capability change: the same
Scheduler evidence should not be reassembled independently by workflow-runtime,
Workbench boundaries, GoalLoop, closeout, and projection code.

## Scope

In scope:

- Add a canonical Scheduler worker path read model under scheduler-runtime.
- Rewire runtime, Workbench boundary/projection, GoalLoop, and closeout callers
  to consume that read model instead of private worker-path assembly.
- Add unit and boundary tests that prevent duplicate Scheduler worker-path
  policy from drifting back.
- Update current handoff docs only where the next-step language still points
  past this compression step.

Out of scope:

- Scheduler product behavior changes, whole-wave dispatch, hidden Scheduler
  loops, slot allocation, WorkflowGraphPlan schema work, Plan UI, Codex
  subagent work, remote/apply/merge automation.

## Current Status

Ready to close.

## Verification

Passed:

- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run test:fast`
- `npm run test:workbench`
- `npx vitest run tests/unit/scheduler-worker-path-read-model.test.ts tests/unit/scheduler-current-transition.test.ts tests/unit/workbench-module-boundaries.test.ts`
- `npx vitest run tests/unit/scheduler-run-closeout.test.ts`
- `npx vitest run tests/slow/workbench-scheduler-two-worker-integration-flow.test.ts`

Notes:

- Initial slow two-worker run used a 184s tool timeout and ended before Vitest
  reported. The same command passed with a longer timeout in 175.64s, with the
  test body taking 161.57s.
- Source grep found no remaining private worker-path assembly helpers in `src`:
  `readSchedulerWorkerPathLikes`, `inspectWorkerPaths`, `inspectWorkerPath`,
  `readWorkerPaths(`, `workerPathLike(`, `isTerminalWorkerPath(`.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: slow two-worker acceptance needed a longer
  tool timeout; the test passed on rerun.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: not applicable.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: handoff docs will be updated
  after archive so next-step language reflects this compression.
- Old experience retained / merged / retired / archive-only: not applicable.

