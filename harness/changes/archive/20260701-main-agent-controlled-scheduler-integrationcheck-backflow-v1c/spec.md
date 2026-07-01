# Spec: main-agent-controlled-scheduler-integrationcheck-backflow-v1c

## Goal

Give main-agent replay/policy a safe, read-only view of existing controlled
Scheduler IntegrationCheck terminal evidence so future orchestration can observe
the full parallel path before old seam retirement.

## Users

- Main-agent orchestration developers who need one bounded observation surface
  for Scheduler terminal evidence.
- Future agents continuing the architecture migration from controlled Scheduler
  backflow to old seam retirement.

## Acceptance Criteria

- AC-001: A new read-only owner summarizes same-Change / same-SchedulerRun
  integration candidate, handoff, exact IntegrationCheck, outcome, completion,
  and blocked closeout evidence with `executionStarted: false`.
- AC-002: The summary is attached to `controlledSchedulerStateBackflow` and its
  health is included in WorkflowGraph replay `evidenceHealth/gaps`.
- AC-003: Unsafe integration lineage issues, including missing exact
  IntegrationCheck after handoff, scope mismatch, stale target sets, and blocked
  closeout conflicting with handoff/outcome/completion, produce unsafe gaps and
  policy `inspect-evidence-gap`.
- AC-004: IntegrationCheck `passed` is reported only as waiting for the existing
  external apply/discard gate; `applied` and `discarded` are reported only as
  already-observed terminal posture.
- AC-005: No new action payload, gate, UI surface, Scheduler execution, worker
  execution, IntegrationCheck run/apply/discard, apply/close, remote, merge, PR,
  or Harness evolution authority is introduced.

## Non-Goals

- Do not run IntegrationCheck or invoke IntegrationCheck apply/discard.
- Do not create SchedulerRun, WorkerLease, IntegrationCheck, WorkflowRun,
  TaskQueue, TaskRun, or AgentTask records.
- Do not alter Workbench UI, confirmation queue, action registry, revalidation,
  automation allowlist, ToolPolicyGate, or action bridge behavior.
- Do not remove `rolePipeline`, `MainAgentLoopProjection`, or `role.pipeline.*`.

## Constraints

- Use existing Scheduler strict readers and exact `readIntegrationCheck`; avoid
  projection readers that silently swallow malformed or scope-mismatched
  evidence when unsafe gap reporting is needed.
- Treat Change id, SchedulerRun id, candidate id, handoff id, outcome id,
  completion id, IntegrationCheck id, worktree target sets, diff hashes, source
  heads, and status lineage as fail-closed.
- Preserve Harness workflow truth: Change/ECL, ToolPolicyGate, validation/audit,
  confirmationQueue, apply/close, and Harness evolution remain authoritative.

## Risks

- A loose reader could hide malformed or cross-scope evidence as ordinary
  missing evidence; tests must cover unsafe gaps.
- A broad IntegrationCheck import could accidentally pull execution/apply
  authority into main-agent replay; module-boundary tests must prevent this.
- A new summary that is not wired into replay health would be another dead
  projection layer; replay/policy tests must prove consumption.

