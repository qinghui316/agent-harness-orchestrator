# Spec: main-agent-workflowgraph-recovery-evidence-summary-v1

## Goal

Provide a read-only evidence-completeness summary for main-agent
WorkflowGraph recovery/resume planning.

The summary must help later main-agent phases understand whether current
WorkflowGraph / TaskQueue / TaskRun / stage evidence is complete and fresh
without executing recovery, creating actions, changing UI, or duplicating the
existing replay/policy state machine.

## Users

- Future AHO main-agent orchestration code that needs a stable observation
  input before scheduler candidate policy or resume execution exists.
- Future maintainers reviewing whether a Change has safe evidence for resume.

## Acceptance Criteria

- AC-001: A new read-only recovery evidence summary owner exists and returns
  `authority: "read-only-main-agent-workflowgraph-recovery-summary"` with
  `executionStarted: false`.
- AC-002: The summary reports recovery-key freshness and per-current-queue
  TaskRun stage verdict / Run / Validation / Audit evidence completeness
  without writing artifacts or state.
- AC-003: The summary references replay current/next-observation kinds so its
  own `kind` cannot be confused with a new authoritative policy.
- AC-004: The observation/replay helper returns `recoverySummary` while keeping
  existing behavior and side effects unchanged.
- AC-005: Tests prove no UI/action/scheduler/apply/close execution payloads or
  forbidden mutating imports/calls are added.
- AC-006: `docs/CURRENT-DEVELOPMENT-PLAN.md` no longer claims stale latest
  implementation or pending evolution state.

## Non-Goals

- True resume execution.
- Scheduler candidate policy or parallel integration.
- New Workbench UI or prompt context.
- New workflow action types, confirmation queue entries, or automation
  permissions.
- A second replay/policy state machine.

## Constraints

- `WorkflowRun`, `TaskQueue`, `TaskRun`, Run, Validation, and Audit managers
  remain canonical evidence/state owners.
- `workflowgraph-recovery.ts` may compose those owners only through read paths.
- Do not call `assertWorkflowResumeAllowed`, because it writes blocked state on
  recovery-key drift.
- If recovery-key recomputation fails, degrade into a recovery gap rather than
  throwing from the summary builder.

## Risks

- A broad "recovery" owner could imply execution authority. Mitigation: keep
  naming and tests explicit that this is an evidence summary only.
- A duplicate state classifier could conflict with replay/policy. Mitigation:
  keep summary `kind` as a completeness label and carry replay kind refs.
