# Spec: main-agent-workflowgraph-observation-evidence-queue-wrapper-drain-v1

## Goal

Add a non-executing WorkflowGraph-level observation and decision evidence layer
above the existing main-agent role step loop and queue step loop.

The layer must explain the current WorkflowGraph / TaskQueue stage for a Change
without becoming workflow truth, queue item authority, or an action executor.
Production Workbench code should stop depending on the old
`runTaskQueueSequence` name, while the old export remains a thin compatibility
wrapper.

## Users

- AHO maintainers migrating toward main-agent continuous orchestration.
- Future main-agent loop, recovery, and graph projection code that needs a
  stable graph-level evidence seam.

## Acceptance Criteria

- AC-001: A new main-agent WorkflowGraph observation owner records
  `workflowgraph-decisions.jsonl` with
  `authority: "non-executing-main-agent-workflowgraph-decision-evidence"` and
  `executionStarted: false`.
- AC-002: Graph-level decision kinds cover missing decomposition/readiness/queue
  proposal/workflow graph, awaiting queue start gate, queue running/paused/
  blocked/completed, stale, and wait states.
- AC-003: Graph evidence records only stage-level summaries and refs. It does
  not record queue item decision details such as `run-next-item`,
  `selectedItemId`, or `taskId`.
- AC-004: Planning graph artifact handlers and TaskQueue lifecycle record graph
  observation evidence without changing existing execution behavior.
- AC-005: Production Workbench action handlers call
  `runMainAgentTaskQueueLifecycle` directly; `runTaskQueueSequence` remains a
  compatibility-only wrapper and carries no lifecycle logic.
- AC-006: The change does not add UI, confirmation queue data, action types,
  action bridge behavior, scheduler/worker/integration execution, or source
  mutation authority.

## Non-Goals

- No Workbench UI changes or browser acceptance.
- No free LLM decision policy.
- No parallel scheduler or IntegrationCheck integration.
- No apply, close, remote, PR, merge, or Harness evolution behavior.
- No deletion of canonical TaskQueue, WorkflowRun, WorkflowGraphPlan, recovery
  key, validation, or audit owners.
- No final removal of the compatibility wrapper export.

## Constraints

- Reuse existing artifact hash, recovery key, WorkflowGraphPlan, TaskQueue, and
  WorkflowRun owners.
- Keep graph evidence non-authoritative and fail closed on malformed, stale, or
  cross-change data.
- Keep queue item decisions solely in `queue-step-evidence.ts`.
- Do not import Workbench UI, action handlers, scheduler runtime, terminal,
  apply/close, or automation allowlist from the new owner.

## Risks

- Risk: duplicating `queue-decisions.jsonl` or WorkflowRun events.
  Mitigation: graph evidence stores only stage-level decisions and refs.
- Risk: deleting the wrapper too early and breaking external imports.
  Mitigation: migrate production callers now, keep wrapper as thin facade.
- Risk: evidence begins to look like executable authority.
  Mitigation: explicit authority string, `executionStarted: false`, tests, and
  no action/confirmation imports.
