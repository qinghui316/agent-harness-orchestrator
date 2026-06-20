# Spec: controlled-scheduler-loop-tick-runtime-boundary

## Goal

Extract and harden the existing `planning.scheduler.controlled-advance.run` lifecycle as a reusable SchedulerRun-scoped controlled loop tick contract.

The tick must describe the real product behavior already in the controlled advance path:

```text
observe current Goal Loop / gate evidence
-> choose/check one legal scheduler transition
-> dispatch the approved bounded concrete gate
-> reconcile post-step Goal Loop evidence
-> route and stop at the next human gate / wait / quality / integration / terminal handoff
```

This advances the controlled Scheduler / Goal Loop runtime boundary without promoting Goal Loop evidence, Workbench projection, or scheduler summaries into workflow truth.

## Users

- A developer using the Workbench who needs to understand exactly what one confirmed controlled Scheduler step did and why AHO stopped.
- Future AHO main-agent / Scheduler code that needs a reusable owner-owned tick contract instead of inferring loop phase state from Workbench handler branches.
- Future reviewers who need evidence that controlled Scheduler work remains bounded by one human-confirmed transition per tick.

## Acceptance Criteria

- AC-001: `planning.scheduler.controlled-advance.run` remains the existing user-confirmed entry for advancing one controlled Scheduler step; this change does not add a new user button, confirmation item, action id, route, CLI command, automatic loop, or hidden continuation.
- AC-002: One controlled advance executes at most one concrete `planning.scheduler.*` gate through the existing `planning.scheduler.controlled-step.run`, high-impact audit, scoped target validation, and stale revalidation path.
- AC-003: Scheduler runtime records a SchedulerRun-scoped controlled loop tick summary on the existing controlled-step evidence. The summary covers observe, choose/check, dispatch, reconcile, and route/stop phases and references the relevant pre-step and post-step Goal Loop evidence ids.
- AC-004: New tick phase, stop, and authority summary construction belongs to owned scheduler runtime / workflow-scheduler modules. Workbench handler code only wires the action, calls owner helpers, and returns/project read-only summaries.
- AC-005: Workpad/UI displays the tick summary as read-only runtime evidence, including executed action, result, stop reason/posture, and next-gate posture when present, without creating an extra execution affordance.
- AC-006: Stale, cross-Change, target-scope mismatch, forged Goal Loop evidence, missing required scheduler scope, or preflight/controller/packet mismatch fails closed before dispatching the concrete scheduler handler.
- AC-007: New evidence and UI/projection prove no extra authority is granted: `loopAuthorized=false`, `fullParallelExecutorAuthorized=false`, `wholeWaveDispatchAuthorized=false`, `slotAllocatorAuthorized=false`, `sourceMutationAuthorized=false`, and apply/close/merge/remote/evolution authorization flags remain false.
- AC-008: Verification includes targeted controlled advance, scheduler controlled-step evidence/schema/render/projection, real App DOM user-surface honesty, `typecheck`, `lint`, `test:fast`, `build`, and Harness checks.

## Non-Goals

- Implementing a scheduler loop runtime that repeats without a user confirmation.
- Starting whole waves, allocating slots, creating worker pools, or implementing the full parallel executor.
- Changing ToolPolicyGate, human confirmation requirements, validation/audit, IntegrationCheck, apply/close, remote, or Harness evolution authority.
- Replacing Change/ECL, accepted artifacts, Run, Validation, Audit, IntegrationCheck, Apply/Close decisions, or Harness evolution records as workflow truth.
- Copying reference-project runtime behavior into AHO.

## Constraints

- Current workflow truth stays with Change/ECL, accepted artifacts, Run, Validation, Audit, IntegrationCheck, Apply/Close human gates, and Harness evolution.
- The tick summary must reuse existing controlled-step evidence rather than introducing a new artifact family unless existing evidence proves insufficient.
- Tick state must reuse existing Goal Loop posture vocabulary, post-step handoff, controlled-step result summary, and route summary patterns instead of creating a competing local state machine.
- Workbench, frontend, bridge, and manager facade code must not own new cross-cutting tick rules.
- `README.md` remains unrelated and untracked unless explicitly requested.

## Risks

- The change could regress into another evidence-only layer if the owner boundary is not extracted from Workbench handler logic.
- UI copy could mislead users into thinking AHO can continue automatically; tests must prove the surface remains read-only and human-gated.
- New tick fields could duplicate existing route summary state; implementation must make the tick contract a reusable summary of the existing lifecycle rather than a parallel protocol.
- Broad scheduler tests can be slow; verification should start targeted and escalate only for shared runtime or UI regressions.
