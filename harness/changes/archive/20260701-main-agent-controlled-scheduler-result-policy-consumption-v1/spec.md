# Spec: main-agent-controlled-scheduler-result-policy-consumption-v1

## Goal

Let main-agent WorkflowGraph replay/policy understand the latest existing
controlled Scheduler step evidence as bounded read-only observation context.
This helps future parallel integration reason about controlled Scheduler
handoffs without adding execution authority.

## Users

- AHO maintainers migrating main-agent orchestration toward the final
  observe/decide/delegate/result-return loop.
- Future main-agent policy and recovery code that needs one stable read model
  for controlled Scheduler step evidence.

## Acceptance Criteria

- AC-001: Replay summary exposes a bounded `controlledScheduler` section when
  latest controlled Scheduler step evidence is valid and same-Change scoped.
- AC-002: Controlled Scheduler step health distinguishes `missing`,
  `malformed`, `old-schema`, `scope-mismatch`, and `stale`; unsafe health
  appears as replay gaps instead of being swallowed as absent evidence.
- AC-003: Matching is fail-closed: step `changeId`, `targetScope.changeId`, and
  known canonical `schedulerRunId` must match; `recorded-with-warning` is
  degraded and not normal ready.
- AC-004: Policy consumes only replay's `controlledScheduler` summary and can
  emit only existing read-only observation kinds such as `wait-for-human-gate`,
  `completed-await-result-gate`, `blocked`, or `inspect-evidence-gap`.
- AC-005: No UI, action payload, scheduler execution, confirmation queue,
  action registry, revalidation, automation allowlist, apply/close, remote,
  merge, PR, or Harness evolution behavior changes.

## Non-Goals

- Do not execute Scheduler or add a Scheduler gate.
- Do not add a `continue-controlled-scheduler` or other action-like policy kind.
- Do not import scheduler runtime executors into replay or policy.
- Do not let controlled Scheduler history override canonical manager state.
- Do not expose this evidence in Workbench UI, right rail, transcript, Agent
  graph, or confirmation cards.

## Constraints

- Reuse existing scheduler repository/schema artifacts where safe.
- Keep the reader read-only and fail-closed for malformed/stale/scope-mismatch
  evidence.
- Preserve existing replay behavior when no controlled Scheduler evidence is
  present.
- Historical evidence may explain state but cannot become workflow truth.

## Risks

- Treating projection-reader null as `missing` could hide malformed evidence;
  mitigate with strict health classification.
- Accidentally importing scheduler executors into replay/policy would blur
  read-only and execution owners; mitigate with boundary tests.
- Overriding canonical queue/workflow state with Scheduler history would create
  a second truth; mitigate with canonical-wins tests.
