# Phase 9C SchedulerRun Journal Shell Human Gated Launch Record

## Purpose

Add a non-executing SchedulerRun journal shell after SchedulerLaunchPreflight. The record captures the human-confirmed launch intent and recovery/journal anchor for a future parallel scheduler, without starting workers or creating runtime execution state.

This phase keeps AHO's workflow truth unchanged: Change/ECL, accepted artifacts, Run/Validation/Audit evidence, ToolPolicyGate, and human gates remain authoritative. SchedulerRun is scheduler coordination evidence only.

## Scope

In scope:

- Add SchedulerRun typed artifact, latest/versioned storage, markdown rendering, and journal append/read helpers under `src/workflow-scheduler/`.
- Add Workbench action `planning.scheduler.run.prepare` that requires `changeId + schedulerLaunchPreflightId`, uses existing confirmation/high-impact/revalidation paths, and only writes SchedulerRun evidence.
- Add Workbench summary/lazy projection/frontend display for SchedulerRun while keeping all parallel execution controls hidden.
- Update docs and tests for the non-executing SchedulerRun boundary.

Out of scope:

- No parallel executor, scheduler loop, slot allocator, WorkerLease allocation, WorkerSession creation, RuntimeWorkspace/EventSource creation, TaskRun/TaskQueueRun/WorkflowRun creation, worktree/run creation, child Change creation, ODWF runtime, cache/replay, CLI command, HTTP route, or new runtime capability.
- No pre-authorization of future executor ToolPolicyGate. Future executor must re-run ToolPolicyGate and human gate.

## Current Status

Ready to close.

## Verification

- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run test` passed.
- `npm run build` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` passed.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.
