# Spec: main-agent-workflowgraph-observation-cleanup-queue-wrapper-removal-v1

## Goal

Tighten the main-agent WorkflowGraph observation seam before adding any
recovery/replay layer. A `created` WorkflowRun must not be reported as a running
queue unless it is actually bound to a fresh TaskQueue, and the remaining legacy
`runTaskQueueSequence` wrapper must be removed so production code has a single
TaskQueue lifecycle entrypoint.

## Users

- AHO maintainers migrating the architecture toward main-agent continuous
  orchestration.
- Future recovery/replay code that needs reliable WorkflowGraph state semantics.

## Acceptance Criteria

- AC-001: A created, unbound WorkflowRun is reported as a non-running wait state,
  not `queue-running` or `awaiting-queue-start-gate`.
- AC-002: `queue-running` is returned only when TaskQueue and WorkflowRun scope
  are mutually bound and fresh.
- AC-003: `runTaskQueueSequence` is no longer exported or used by production
  source, and tests no longer legitimize the legacy wrapper.
- AC-004: `runMainAgentTaskQueueLifecycle` remains the single TaskQueue
  main-agent lifecycle production entrypoint.

## Non-Goals

- No recovery/replay summary owner.
- No UI, Workbench rail, transcript, or confirmation card changes.
- No Scheduler, WorkerLease, IntegrationCheck, remote, PR, merge, apply, close,
  or Harness evolution behavior changes.
- No removal of `rolePipeline`, `MainAgentLoopProjection`, or `role.pipeline.*`
  action names.

## Constraints

- Reuse the existing WorkflowGraph observation owner and TaskQueue lifecycle
  owner.
- Do not add workflow truth, action types, automation allowlist entries, or
  confirmation queue behavior.
- Fail closed on stale or mismatched WorkflowRun / TaskQueue scope.

## Risks

- Treating `created` as running would let future replay code resume from a false
  state.
- Removing the wrapper without updating module-boundary tests would leave the
  old API as a sanctioned compatibility surface.
