# Spec: main-agent-scheduler-candidate-assessment-v1

## Goal

Create a non-executing assessment that lets the main-agent architecture observe
Scheduler candidate signals without starting Scheduler runtime or creating new
workflow truth.

## Users

- Future AHO agents implementing main-agent parallel integration.
- Maintainers reviewing Scheduler / WorkflowGraph migration boundaries.

## Acceptance Criteria

- AC-001: A new `MainAgentSchedulerCandidateAssessment` owner returns
  `authority: "non-executing-main-agent-scheduler-candidate-assessment"` and
  `executionStarted: false`.
- AC-002: Candidate signal detection only uses fresh, same-Change
  readiness / scheduler evidence; queue completion or idle state alone cannot
  produce a candidate signal.
- AC-003: The observation/replay helper returns the assessment after graph
  observation, replay, and recovery derivation without changing existing
  behavior.
- AC-004: Assessment output never contains action payloads, confirmation
  payloads, scheduler transition payloads, apply/close/merge/PR suggestions, or
  Workbench UI fields.
- AC-005: Module-boundary tests prove the new owner does not import or call
  Scheduler runtime/execution, Workbench actions, confirmation queue,
  automation allowlist, terminal, apply/close, or workflow runtime.
- AC-006: Roadmap/handoff docs no longer contradict the read-only consumption
  of recovery summary by the candidate assessment.

## Non-Goals

- No SchedulerRun, WorkerLease, IntegrationCheck, or worker start.
- No action bridge or confirmation queue integration.
- No Workbench UI, right rail, transcript, or Agent graph changes.
- No Scheduler compile, dry-run, prepare, dispatch, controlled advance, or
  IntegrationCheck handoff.
- No apply, close, remote, merge, PR, or Harness evolution authority.

## Constraints

- The assessment is a derived read-only signal, not workflow truth.
- `candidate-signal-observed` is not a readiness verdict and must not be
  consumed as a gate.
- Stale, malformed, scope-mismatched, or incomplete evidence must degrade to
  gaps rather than silently becoming a positive signal.
- Existing replay and recovery kind semantics must not change.

## Risks

- Future agents may misread candidate output as scheduler permission unless the
  type names, docs, and tests clearly forbid executable payloads.
- Pulling in Scheduler runtime modules would blur ownership and recreate a
  broad orchestration facade.
