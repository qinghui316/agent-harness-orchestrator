# main-agent-taskqueue-workflowgraph-lifecycle-ownership-v1

## Purpose

Move sequential TaskQueue / WorkflowGraph lifecycle control into
`src/main-agent-orchestration` so the main-agent orchestration owner controls
the queue-level observe / decide / run-one-task / record / observe loop.

The user-visible behavior stays the same. This change does not add UI, free-form
LLM decisions, scheduler fan-out, IntegrationCheck, apply/close authority, or new
Workflow truth. The architectural goal is to retire the old
`workflow-runtime/kernel/task-queue-runner.ts` control loop while preserving the
existing TaskQueue, TaskRun, WorkflowRun, validation, and audit domain owners.

## Scope

In scope:

- Add a main-agent TaskQueue lifecycle entrypoint for sequential queue
  start/resume, next-item selection, TaskRun lifecycle delegation, and
  TaskQueue/WorkflowRun synchronization.
- Move stage-resume orchestration into the main-agent owner while preserving
  completed / continue-validation / continue-audit / blocked semantics.
- Turn `runTaskQueueSequence` into a compatibility wrapper.
- Remove production use of the old TaskQueue runner loop and direct rework
  helper.
- Strengthen TaskQueue execution gate and resume scope fail-closed checks.

Out of scope:

- Workbench UI changes.
- Free-form main-agent LLM decisions.
- Scheduler, parallel worker, WorkerLease fan-out, IntegrationCheck, remote, PR,
  merge, apply, close, or Harness evolution authority changes.
- Confirmation queue, action registry, revalidation, or automation allowlist
  changes.

## Current Status

Ready to close.

## Verification

Passed:

- `npx vitest run tests/unit/workbench-task-runtime.test.ts tests/unit/main-agent-step-loop.test.ts tests/unit/workbench-module-boundaries.test.ts`
- `npx vitest run tests/unit/main-agent-step-loop.test.ts tests/unit/orchestration-engine.test.ts tests/unit/workbench-agent-task-domain.test.ts tests/unit/workbench-module-boundaries.test.ts tests/unit/workflow-actions.test.ts tests/unit/action-revalidation.test.ts tests/unit/workbench-task-runtime.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm run test:fast`
- `npm run build`
- `npm run test:workbench`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\harness-change.ps1 status`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\harness-evolve.ps1 check`

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: subagent Dewey reviewed the plan and
  flagged stage-resume semantics, TaskQueue execution-gate fail-closed behavior,
  resume scope binding, and old runner deletion as required constraints.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: not applicable.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: active structured change only; handoff docs will
  be updated at close if the baseline changes.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: not applicable.
- Old experience retained / merged / retired / archive-only: old
  `task-queue-runner.ts` queue-control ownership is retired; TaskQueue external
  behavior is retained.
