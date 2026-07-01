# Spec: main-agent-controlled-scheduler-state-backflow-v1a

## Goal

Main-agent replay/policy should safely observe the latest same-Change
controlled Scheduler state without executing Scheduler or changing Harness
authority. If controlled Scheduler step evidence is scoped to the wrong
SchedulerRun, replay must fail closed with an unsafe gap.

## Users

Internal AHO architecture owners and future agents continuing the
main-agent/controlled-Scheduler migration.

## Acceptance Criteria

- AC-001: When an expected `schedulerRunId` is known, scoped controlled-step
  evidence is missing, and unscoped/wrong-run controlled-step evidence exists,
  replay produces a stale/scope unsafe gap and policy returns
  `inspect-evidence-gap`.
- AC-002: Main-agent replay exposes a bounded read-only controlled Scheduler
  state backflow summary for the latest same-Change SchedulerRun/runtime state
  and latest controlled-step refs.
- AC-003: The new summary never writes artifacts/SQLite and never creates or
  executes SchedulerRun, WorkerLease, TaskRun, IntegrationCheck, action
  requests, gates, confirmation items, or UI.
- AC-004: Canonical WorkflowRun / TaskQueue / TaskRun / AgentTask state remains
  authoritative; historical Scheduler evidence cannot override it.
- AC-005: Boundary tests prove the new main-agent reader does not import
  Workbench action handlers, Scheduler executors, IntegrationCheck run/apply/
  discard, automation allowlist, terminal, apply/close, or server UI paths.

## Non-Goals

- Full parallel worker graph reconciliation.
- WorkerLease / worker result / validation / audit / rework deep backflow.
- IntegrationCheck handoff/outcome/completion deep backflow.
- New Scheduler gates, raw scheduler dispatch, action bridge integration, UI
  changes, or permission expansion.

## Constraints

- Existing controlled Scheduler path remains the only legal execution path.
- Harness authority remains Change/ECL, ToolPolicyGate, validation/audit,
  confirmationQueue, apply/close, and Harness evolution records.
- New output is read-only observation input with `executionStarted: false`.

## Risks

- If mismatch gaps are classified as `missing`, future policy may trust stale
  Scheduler evidence.
- If the reader imports executor/write owners, main-agent replay could become a
  second Scheduler authority.
- If the slice grows into worker/IntegrationCheck graph reconciliation, it
  becomes too large and should split into V1b/V1c.

