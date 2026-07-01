# Spec: main-agent-controlled-scheduler-worker-runtime-backflow-v1b

## Goal

Main-agent replay/policy should safely observe controlled Scheduler worker
posture without executing Scheduler or changing Harness authority. The new
summary must expose bounded WorkerLease and SchedulerRuntime worker evidence
for the current same-Change / same-SchedulerRun context, and unsafe evidence
must fail closed as gaps.

## Users

Internal AHO architecture owners and future agents continuing the
main-agent/controlled-Scheduler migration.

## Acceptance Criteria

- AC-001: A read-only worker backflow summary aggregates same-Change /
  same-SchedulerRun WorkerLease, worker start/result/validation/audit, and
  rework start/result/validation/audit posture with `executionStarted: false`.
- AC-002: The worker summary is exposed only as
  `controlledSchedulerStateBackflow.workerBackflow`; it does not become a new
  policy, action, gate, or UI owner.
- AC-003: Missing worker evidence is represented as bounded incomplete posture;
  malformed, old-schema, stale, cross-change, wrong-SchedulerRun, WorkerLease,
  or TaskRun scope mismatch evidence becomes an unsafe gap.
- AC-004: Policy can only convert unsafe worker gaps to
  `inspect-evidence-gap`; it cannot output action payloads or action-like
  recommendations.
- AC-005: Boundary tests prove the new owner does not import or call Workbench
  UI/action handlers, server action paths, Scheduler executors,
  IntegrationCheck run/apply/discard, automation allowlist, terminal,
  apply/close, or source mutation paths.

## Non-Goals

- IntegrationCheck handoff/outcome/completion backflow.
- Scheduler execution, worker execution, new gates, action bridge integration,
  UI, confirmation queue changes, automation allowlist changes, apply/close,
  remote, merge, PR, or Harness evolution authority.
- Old seam retirement.

## Constraints

- Existing controlled Scheduler path remains the only legal execution path.
- Harness authority remains Change/ECL, ToolPolicyGate, validation/audit,
  confirmationQueue, apply/close, and Harness evolution records.
- New output is read-only observation input with `executionStarted: false`.
- IntegrationCheck terminal backflow must remain a separate V1c change.

## Risks

- If worker evidence scope gaps are treated as normal missing evidence, future
  policy could trust stale worker posture.
- If the owner imports executor modules, replay could become a second
  Scheduler authority.
- If IntegrationCheck is included in V1b, the slice becomes too large and risks
  crossing source-apply safety boundaries.

