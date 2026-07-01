# Spec: main-agent-workflowgraph-replay-summary-builder-v1

## Goal

Create a read-only replay summary builder for the main-agent WorkflowGraph
architecture. It should aggregate current WorkflowGraph, TaskQueue, TaskRun,
AgentTask, and role-loop evidence into one in-memory summary for future
decision policy work.

The builder must make current canonical manager state win over historical jsonl
evidence. It must never infer executable actions from stale or incomplete
history.

## Users

- Future main-agent decision policy code that needs a stable observation input.
- Developers reviewing or testing orchestration migration behavior.

## Acceptance Criteria

- AC-001: `buildMainAgentWorkflowGraphReplaySummary(...)` returns an in-memory
  replay summary with `currentState`, `latestHistoricalEvidence`,
  `evidenceHealth/gaps`, `artifactRefs`, and `nextObservation`.
- AC-002: Canonical managers are the source of current state. Historical
  `workflowgraph-decisions.jsonl`, `queue-decisions.jsonl`, and role-loop jsonl
  evidence cannot override current WorkflowRun / TaskQueue / TaskRun /
  AgentTask status.
- AC-003: Missing, malformed, old-schema, stale, and scope-mismatched evidence
  is surfaced as health/gap data and never silently treated as a runnable state.
- AC-004: `WorkflowRun.status === "created"` with no matching TaskQueue binding
  remains wait/unbound/recovery-gap, never `queue-running`.
- AC-005: The new owner is read-only: no artifact writes, SQLite writes,
  runner calls, workflow actions, Scheduler/WorkerLease/IntegrationCheck,
  terminal, apply/close, remote, PR, merge, or Harness evolution.
- AC-006: `docs/STATUS.md` no longer claims that `runTaskQueueSequence` remains
  as a compatibility wrapper.

## Non-Goals

- No Workbench UI, right rail, transcript, confirmation card, or graph display.
- No Decision-To-Action Bridge behavior changes.
- No free LLM main-agent decision policy.
- No Scheduler/parallel worker/runtime-continuity implementation.
- No removal of `rolePipeline`, `MainAgentLoopProjection`, or
  `role.pipeline.*` compatibility surfaces.

## Constraints

- Replay summary is a projection, not workflow truth.
- `nextObservation` may describe what to inspect next or why evidence is
  unsafe; it must not include executable action ids or confirmation payloads.
- Role-loop discovery must not cross Change scope.
- Old evidence schemas must remain safely readable or be reported as gaps.

## Risks

- If historical jsonl is treated as current state, replay could misrepresent a
  completed or paused queue as running.
- If `nextObservation` becomes an action recommendation, it could blur the
  boundary with confirmation/action authority.
- If malformed jsonl is swallowed as empty, recovery diagnostics become
  misleading.
