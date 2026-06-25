# Spec: workbench-goal-loop-decision-surface-audit-v1

## Goal

Prove that Workbench presents existing Goal Loop decision evidence honestly on
the user surface, or minimally fix any projection/copy/action-scope gap found by
the audit. Goal Loop evidence may explain or assist a current concrete gate, but
it must not create execution authority or replace `confirmationQueue.primary`.

## Users

- A developer using Workbench to continue a demand without learning internal
  SchedulerRun, WorkerLease, GoalLoopNextStepPacket, or ControllerPolicy terms.
- Future agents reading current handoff docs before choosing the next product
  slice.

## Acceptance Criteria

- AC-001: Handoff docs no longer name completed scope-honesty work as the next
  product blocker.
- AC-002: Matching fresh Goal Loop scheduler guidance can appear only when it
  attaches to the current real gate and remains subordinate to
  `confirmationQueue.primary`.
- AC-003: Stale, target-mismatched, missing-target, cross-change, or source-drift
  Goal Loop guidance is hidden or downgraded to blocked/waiting evidence.
- AC-004: Ordinary sequential/planning/decomposition/code paths are not forced
  through Goal Loop and do not show scheduler, parallel, or full-auto wording.
- AC-005: Single-worker validation/audit failure surfaces bounded rework or
  refresh wording, not IntegrationFix; aggregate IntegrationCheck failure is the
  only IntegrationFix-like path.
- AC-006: Scoped automation remains bounded: `完全访问权限` does not directly
  consume raw scheduler, apply, close, merge, remote, or Harness evolution gates.
- AC-007: If no product gap is found, the change closes with no-code audit
  evidence rather than adding a new layer for momentum.

## Non-Goals

- New Goal Loop decision engine or main-agent runtime.
- New Workbench permission system, action registry, projection framework, or
  evidence family.
- Full-auto, full parallel executor, slot allocator, child Change creation, or
  automatic apply/close/merge/remote/Harness evolution.

## Constraints

- Reuse existing `src/goal-loop/*`, Workbench read-model, confirmation queue,
  current-gate revalidation, and scoped automation allowlist owners.
- `GoalLoopDecision`, packets, controller policy, and preflight remain
  non-executing evidence.
- `confirmationQueue.primary` remains the only executable primary surface.
- Current docs stay compact; detailed audit history remains in this change.

## Risks

- False product progress by adding another read-only layer instead of auditing
  the existing chain.
- UI confusion if Goal Loop guidance competes with real gates.
- Over-widening scoped automation by treating full Codex runtime access as AHO
  workflow authority.
