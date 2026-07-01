# main-agent-controlled-scheduler-result-policy-consumption-v1

## Purpose

Consume existing controlled Scheduler step evidence from the main-agent
WorkflowGraph replay/policy layer as read-only observation input. This is the
first implementation slice inside Parallel Integration Through Existing
Controlled Scheduler, not a new macro phase.

The change teaches main-agent replay to summarize what the controlled Scheduler
already did and lets policy derive bounded observation posture from that
summary. It does not execute Scheduler, add gates, alter UI, or change
permissions.

## Scope

In scope:

- Add bounded `controlledScheduler` summary data to
  `MainAgentWorkflowGraphReplaySummary`.
- Add a strict health reader for `SchedulerControlledStepEvidence` that
  distinguishes missing, malformed, old-schema, scope-mismatch, and stale
  states.
- Let main-agent policy consume only the replay summary, without importing
  scheduler executors or Workbench action handlers.
- Add unit and boundary coverage for matching rules, degradation, and no-action
  guarantees.

Out of scope:

- Scheduler execution, raw scheduler dispatch, new Scheduler gates, action
  bridge changes, UI changes, confirmation queue changes, automation allowlist
  changes, apply/close/remote/merge/PR/Harness evolution authority.
- Replacing canonical WorkflowRun / TaskQueue / TaskRun / AgentTask state with
  historical Scheduler evidence.

## Current Status

Completed.

Implemented a read-only controlled Scheduler step replay reader, added bounded
`controlledScheduler` replay summary data, and taught main-agent policy to
derive only observation posture from that summary. The implementation preserves
canonical WorkflowRun / TaskQueue / TaskRun / AgentTask state as authoritative
and does not execute Scheduler or expose new UI/actions.

## Verification

Passed:

- `npx vitest run tests/unit/main-agent-workflowgraph-replay.test.ts tests/unit/main-agent-workflowgraph-decision-policy.test.ts tests/unit/workbench-module-boundaries.test.ts`
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

- Documentation entropy check: archive handoff recorded in `AGENTS.md`,
  `docs/STATUS.md`, and `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: remaining migration now points
  to parallel integration through the existing controlled Scheduler path and
  old seam retirement.
- Old experience retained / merged / retired / archive-only: not applicable.
