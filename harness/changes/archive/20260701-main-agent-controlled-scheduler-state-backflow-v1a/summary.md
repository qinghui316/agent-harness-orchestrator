# main-agent-controlled-scheduler-state-backflow-v1a

## Purpose

Continue the main-agent architecture migration with the smallest safe parallel
integration slice. This change first fixes a controlled Scheduler replay gap:
when an expected SchedulerRun is known but evidence is only found outside that
scope, replay must surface an unsafe stale/scope gap instead of a harmless
missing gap.

Then add a read-only, in-memory main-agent summary for the latest same-Change
SchedulerRun and SchedulerRuntimeState. The summary is observation input only;
it does not execute Scheduler, create gates, alter UI, or change Harness
authority.

## Scope

In scope:

- Fix expected `schedulerRunId` mismatch gap handling in controlled Scheduler
  step replay.
- Add a bounded read-only controlled Scheduler state backflow summary for the
  latest same-Change SchedulerRun/runtime state and latest controlled step
  refs.
- Attach the summary to main-agent replay/helper output for future observation.
- Add policy and boundary tests proving the summary stays non-executing.

Out of scope:

- Full WorkerLease / worker result / validation / audit / rework graph
  reconciliation.
- IntegrationCheck deep backflow or result freshness rejudgment.
- Scheduler execution, raw scheduler dispatch, new Scheduler gates, Workbench
  UI, action bridge, confirmation queue changes, automation allowlist changes,
  apply/close/remote/merge/PR/Harness evolution authority.

## Current Status

Ready to close.

## Verification

Passed:

- `npx vitest run tests/unit/main-agent-workflowgraph-replay.test.ts tests/unit/main-agent-workflowgraph-decision-policy.test.ts tests/unit/main-agent-scheduler-candidate-assessment.test.ts tests/unit/workbench-module-boundaries.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm run test:fast`
- `npm run build`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: active handoff updated for this active change.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: active pointer only until
  close.
- Old experience retained / merged / retired / archive-only: not applicable.

