# main-agent-controlled-scheduler-worker-runtime-backflow-v1b

## Purpose

Continue the main-agent architecture migration with a read-only worker/runtime
backflow slice. V1b extends the V1a controlled Scheduler state backflow with
bounded WorkerLease and SchedulerRuntime worker posture so replay/policy can
observe worker start/result/validation/audit/rework evidence without executing
Scheduler or changing Harness authority.

This is still observation-only architecture work. Existing controlled Scheduler
owners remain the only legal execution path; IntegrationCheck terminal
backflow is explicitly deferred to V1c.

## Scope

In scope:

- Add a read-only controlled Scheduler worker backflow owner under
  `src/main-agent-orchestration/`.
- Summarize same-Change / same-SchedulerRun WorkerLease and worker
  start/result/validation/audit/rework posture.
- Attach the bounded worker summary as
  `controlledSchedulerStateBackflow.workerBackflow`.
- Add worker backflow, replay/policy, and module-boundary tests.

Out of scope:

- Scheduler execution, raw Scheduler dispatch, worker start/result/validation/
  audit/rework execution, new Scheduler gates, action bridge integration, UI,
  confirmation queue changes, automation allowlist changes, apply/close/
  remote/merge/PR/Harness evolution authority.
- IntegrationCheck handoff/outcome/completion backflow; this is V1c.
- Old seam retirement.

## Current Status

Ready to close.

## Verification

Passed:

- `npx vitest run tests/unit/main-agent-controlled-scheduler-worker-backflow.test.ts tests/unit/main-agent-workflowgraph-replay.test.ts tests/unit/main-agent-workflowgraph-decision-policy.test.ts tests/unit/workbench-module-boundaries.test.ts`
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

- Documentation entropy check: active handoff was updated to point at this
  structured change during implementation; close will move the pointer to the
  archive.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: not applicable.
- Old experience retained / merged / retired / archive-only: not applicable.

