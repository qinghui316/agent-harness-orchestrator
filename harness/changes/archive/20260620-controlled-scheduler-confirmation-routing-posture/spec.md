# Spec: controlled-scheduler-confirmation-routing-posture

## Goal

When a controlled Scheduler single-step confirmation is ready, the right confirmation card should explain the current routing posture in user-facing language: whether the current evidence is low conflict, why the step is still only one confirmed transition, and why any sequential, integration, blocked, or close-gate posture must not be treated as automatic parallel execution.

This should make the Goal-driven Adaptive Loop easier to understand without implementing a loop runtime.

## Users

- A developer deciding whether to confirm the next controlled Scheduler step.
- A main agent or reviewer reading the Workbench surface to understand why the next step is safe, sequential, blocked, or waiting for integration evidence.

## Acceptance Criteria

- AC-001: Controlled Scheduler next-candidate detail includes optional user-facing routing posture copy derived from existing `WorkbenchGoalLoopSummary` conflict/routing and scheduler execution-mode evidence.
- AC-002: The right confirmation card renders only the derived user-facing copy. It does not compute scheduler policy, render raw action ids/artifact ids/enum values, or expose future-only internal terms.
- AC-003: The routing posture detail appears only when the existing controlled Scheduler next-candidate is `ready-for-confirmation` and fresh for the current gate; stale, mismatched, or needs-review candidates remain absent from the executable right-card detail.
- AC-004: The confirmation card still exposes exactly one controlled Scheduler advance action and does not alter action payload target ids, stale revalidation, ToolPolicyGate, or human confirmation behavior.
- AC-005: Real App DOM coverage verifies the visible right-card posture, no duplicate action, and no leakage of raw scheduler ids or fake future capabilities.

## Non-Goals

- No scheduler runtime changes.
- No automatic loop, whole-wave dispatch, slot allocator, full parallel executor, source mutation, apply, close, remote landing, or Harness evolution behavior.
- No Goal Loop recommendation promotion to workflow truth.
- No frontend-side scheduler policy derivation.

## Constraints

- Workflow truth remains Change/ECL, accepted artifacts, Run, Validation, Audit, IntegrationCheck, Apply/Close decisions, and Harness evolution.
- Controlled Scheduler remains one human-confirmed legal transition per action.
- New copy must be produced by the read-model/projection owner and rendered passively by the frontend.
- Architecture Growth Control applies: reuse existing Goal Loop conflict routing, Scheduler execution-mode assessment, and controlled Scheduler candidate projection rather than adding local frameworks or gates.

## Risks

- Risk: raw internal posture values or scheduler ids leak into the primary decision surface. Mitigation: map to user-facing copy in the read-model owner and assert visible DOM text excludes raw ids/terms.
- Risk: the extra copy could imply automatic parallel execution. Mitigation: copy explicitly states single-step/human-gated posture and tests reject fake future-capability terms.
- Risk: frontend rendering becomes policy logic. Mitigation: frontend receives optional strings/lists and only renders them.

