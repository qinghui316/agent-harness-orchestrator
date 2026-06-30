# Spec: main-agent-taskqueue-workflowgraph-lifecycle-ownership-v1

## Goal

Move sequential TaskQueue / WorkflowGraph lifecycle control into
`src/main-agent-orchestration` so main-agent orchestration owns the queue-level
loop:

```text
observe queue/workflow evidence
-> decide next queue item or terminal state
-> run one bounded TaskRun
-> collect result/rework evidence
-> sync TaskQueue/WorkflowRun
-> observe again
```

The migration must retire the old production control loop in
`workflow-runtime/kernel/task-queue-runner.ts` without changing user-visible
behavior or expanding Harness authority.

## Users

- AHO maintainers evolving the main-agent continuous orchestration architecture.
- Future agents implementing Workflow/TaskGraph, scheduler, and recovery
  migration slices.

## Acceptance Criteria

- AC-001: `src/main-agent-orchestration` owns the sequential TaskQueue lifecycle
  loop through a dedicated entrypoint.
- AC-002: `runTaskQueueSequence` remains available as a compatibility entrypoint
  but no longer owns the queue loop.
- AC-003: Stage resume keeps current semantics: completed directly finishes,
  continue-validation does not rerun coder, continue-audit does not rerun
  coder/validation, and blocked fails closed.
- AC-004: TaskQueue execution requires fresh taskQueueProposalId and
  workflowGraphPlanId scope; missing or mismatched scope fails closed.
- AC-005: Stage-resume candidates are constrained to the current change and
  queue/workflow scope so stale history is not reused.
- AC-006: TaskRun validation/audit failure still allows at most one bounded
  rework through main-agent TaskRun lifecycle.
- AC-007: TaskQueue, TaskRun, WorkflowRun, validation, and audit managers remain
  the state/evidence owners; main-agent orchestration only coordinates.
- AC-008: No SchedulerRun, WorkerLease wave, IntegrationCheck, UI,
  confirmationQueue, action registry, revalidation, automation allowlist,
  apply/close, remote, PR, merge, or Harness evolution behavior changes.

## Non-Goals

- Free-form LLM main-agent decision logic.
- Parallel scheduler or multi-worktree integration.
- New user-facing surfaces or transcript changes.
- New workflow action types or authority model changes.
- Promotion of WorkflowRun journals, Goal Loop packets, Codex Goal, or
  main-agent evidence into workflow truth.

## Constraints

- Preserve existing action handler behavior and exports where possible.
- Keep broad facades thin; new main logic belongs in an owner module.
- Fail closed on stale or incomplete TaskQueue / WorkflowGraph scope.
- Do not rewrite domain managers or duplicate their persistence logic.

## Risks

- Resume may accidentally pick an old TaskRun if queue/workflow scope is not
  checked.
- Missing TaskQueue gate ids may silently downgrade execution to a non-queue code
  gate unless blocked.
- Blocked verdicts currently route through item failure APIs; implementation must
  preserve user-visible blocked semantics even if low-level compatibility uses a
  failed item status.
- Moving the loop could accidentally widen scheduler or automation authority if
  imports and action paths are not tested.
