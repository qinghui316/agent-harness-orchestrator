# Spec: Controlled Scheduler Continuation Guard

## Goal

Make the existing controlled Scheduler advance path consume the prior controlled-step continuation evidence before starting another Scheduler transition. Once a previous controlled Scheduler step exists, a later `planning.scheduler.controlled-advance.run` must fail closed unless the previous step's continuation readiness and post-step preflight prove that the currently submitted concrete scheduler gate is still the same legal next gate.

## Users

- Primary: the main Agent and Workbench user relying on controlled Scheduler gates to progress a demand one safe step at a time.
- Secondary: future agents continuing the controlled Scheduler / Goal Loop product work without accidentally bypassing stale post-step evidence.

## Acceptance Criteria

- AC-001: Bootstrap is allowed only when no prior `SchedulerControlledStepEvidence` exists for the relevant Change/SchedulerRun lineage; the first controlled advance continues to use existing concrete gate required-target and stale revalidation checks.
- AC-002: If prior controlled-step evidence exists, `planning.scheduler.controlled-advance.run` fails before fresh Goal Loop evaluation, controller refresh, gate-readiness preflight, `controlled-step.run`, or any concrete scheduler handler when the prior evidence is warning-state, lacks `controlledLoopContinuationReadiness`, or has readiness status other than `ready-for-human-gate`.
- AC-003: The guard compares the submitted concrete gate against the prior post-step `GoalLoopGateReadinessPreflight.currentGate.actionType` and `scope`, not against the wrapper action type and not against incomplete readiness summary fields.
- AC-004: Existing `validateWorkflowActionRequiredTargets` and `workflowActionScopesMatchStrict` are reused so missing, forged, cross-Change, cross-SchedulerRun, or mismatched target ids fail closed.
- AC-005: Scope transition is handled: if the previous unscoped controlled step's post-step preflight points to a SchedulerRun-scoped next gate, a matching submitted SchedulerRun-scoped request passes and a mismatched request fails.
- AC-006: No new action type, Workbench button, ToolPolicy path, automatic loop, whole-wave dispatch, slot allocator, source mutation, apply/close/merge, remote landing, child Change, or Harness evolution behavior is introduced.
- AC-007: Tests cover the guard's pass/fail paths and prove handler failure happens before any new Goal Loop evidence or scheduler transition is started.

## Non-Goals

- Implementing an unattended Scheduler loop or multi-step continuation.
- Changing the existing `planning.scheduler.controlled-advance.run` request shape to require readiness ids.
- Moving business rules into Workbench, frontend, server route, or manager facade glue.
- Broad refactors of scheduler-runtime, Goal Loop, Workbench, or workflow-actions.
- Making Workbench projections authoritative.

## Constraints

- Workflow truth remains Change/ECL, accepted artifacts, Run, Validation, Audit, IntegrationCheck, Apply/Close gates, and Harness evolution.
- Human confirmation and ToolPolicyGate remain required for every high-impact concrete Scheduler transition.
- Reference projects may inform design only; no reference runtime is copied.
- Architecture Growth Control applies: reuse existing target validation, strict scope matching, Goal Loop preflight, and scheduler evidence repositories instead of adding a feature-local safety framework.

## Risks

- A too-permissive guard would let stale or damaged continuation evidence be bypassed by a fresh current gate.
- A too-strict guard could block the first controlled advance or legitimate SchedulerRun scope transitions.
- Importing workflow-action registry logic directly into scheduler-runtime would blur owner boundaries.
- Tests must distinguish wrapper action shape from concrete scheduler gate scope; `controlled-advance` requests intentionally do not carry post-step readiness ids.
