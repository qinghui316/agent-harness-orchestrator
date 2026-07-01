# Spec: main-agent-controlled-scheduler-integration-v1

## Goal

Make the main-agent Scheduler candidate signal safe for controlled Scheduler
integration by checking the existing readiness action fields, and provide a
read-only route helper that points to the existing controlled Scheduler path
without executing it.

## Users

- Future main-agent orchestration code that needs to know whether current
  WorkflowGraph evidence can proceed toward the controlled Scheduler path.
- Maintainers reviewing that Scheduler integration still uses existing
  Workbench action boundary, controlled Scheduler guard, ToolPolicyGate,
  validation/audit, and human gates.

## Acceptance Criteria

- AC-001: WorkflowGraph observation includes readiness `nextAllowedAction` and
  `schedulerEligible`, with old evidence handled fail-closed.
- AC-002: Scheduler candidate assessment emits `candidate-signal-observed`
  only when status, next allowed action, eligibility, freshness, and scope all
  agree.
- AC-003: A main-agent controlled Scheduler route helper exists and is
  non-executing; it never emits raw Scheduler action payloads.
- AC-004: The helper does not import or call Scheduler runtime executors,
  Workbench action handlers, confirmation queue, automation allowlist,
  terminal, apply/close, or action bridge.
- AC-005: Tests cover good candidate, wrong action, ineligible, old-schema,
  sequential, stale, malformed, and forbidden-payload cases.
- AC-006: Roadmap and handoff docs reflect the latest closeout and next
  architecture direction.

## Non-Goals

- Do not execute Scheduler, start workers, create SchedulerRun / WorkerLease /
  IntegrationCheck, or run IntegrationCheck handoff.
- Do not add a new parallel gate assessment artifact.
- Do not connect Scheduler to `assessMainAgentActionBridge`.
- Do not change Workbench UI, confirmation queue, automation allowlist, action
  registry, revalidation, apply/close, remote, PR, merge, or Harness evolution.
- Do not retire `rolePipeline`, `MainAgentLoopProjection`, or
  `role.pipeline.*` in this change.

## Constraints

- Candidate output remains evidence, not authority.
- `schedulerEligible` is an agreement check only; the stronger condition is
  readiness status plus `nextAllowedAction === "scheduler.contract"`.
- Existing `workflow-scheduler`, `scheduler-runtime`, Workbench action
  boundary, and controlled Scheduler owners remain authoritative.

## Risks

- If the helper emits request-shaped payloads, future code may bypass the
  existing controlled Scheduler gate.
- If old observation evidence is accepted as a positive candidate, stale
  historical JSONL could look like current Scheduler readiness.
- If the helper imports Scheduler runtime executors, this slice would blur the
  planned owner boundary before parallel integration is ready.
