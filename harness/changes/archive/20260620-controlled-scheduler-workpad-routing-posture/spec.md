# Spec: controlled-scheduler-workpad-routing-posture

## Goal

When Workpad shows Goal Loop / controlled Scheduler guidance, it should include the same sanitized user-facing routing posture already derived for the right confirmation card. The main Workpad surface should explain why the current posture is low-conflict, sequential, blocked, or otherwise constrained, while making clear that the only executable transition remains one separate human-confirmed right-side gate.

## Users

- A developer reading the Workpad to understand the current controlled Scheduler posture before using the right confirmation card.
- A main agent or reviewer checking whether the visible UI honestly describes a single-gate controlled loop boundary.

## Acceptance Criteria

- AC-001: Workpad Goal Loop primary/default surface shows concise sanitized routing posture when `goalLoop.controlledSchedulerNextCandidate.routingPosture` exists.
- AC-002: Workpad Goal Loop details show the full sanitized posture label/body/boundary/reasons without raw internal scheduler ids or future-only runtime terms.
- AC-003: The right confirmation card keeps equivalent posture rendering and exactly one controlled advance action.
- AC-004: The implementation reuses a shared frontend renderer/helper rather than duplicating posture rendering logic across panels.
- AC-005: Real React/App DOM coverage verifies Workpad-visible posture, no fake action/button, and no leakage of raw terms such as `planning.scheduler`, `SchedulerRun`, `worker`, `slot`, `whole-wave`, or `start-all`.

## Non-Goals

- No read-model derivation changes.
- No scheduler runtime, Goal Loop policy generation, action attachment rules, action payload target ids, stale revalidation, ToolPolicyGate, or human gate behavior changes.
- No automatic scheduler loop, whole-wave dispatch, slot allocation, full parallel executor, source mutation, apply, close, remote landing, or Harness evolution behavior.

## Constraints

- Workflow truth remains Change/ECL, accepted artifacts, Run, Validation, Audit, IntegrationCheck, Apply/Close decisions, and Harness evolution records.
- Current controlled Scheduler remains single-gate staged and human-confirmed.
- Workbench frontend renders already-derived user-facing copy only; it must not compute scheduler policy.
- Architecture Growth Control applies: reuse existing derived read-model copy and a shared frontend renderer instead of adding local UI policy branches.

## Risks

- Risk: Workpad copy could imply automatic continuation. Mitigation: concise posture must state single-step/human-confirmed boundary, and tests reject fake future terms/buttons.
- Risk: sharing rendering could accidentally alter the right card. Mitigation: preserve right-card DOM assertions and single action count.
- Risk: frontend becomes a policy layer. Mitigation: renderer accepts strings/lists only and does not inspect scheduler ids or compute policy.
