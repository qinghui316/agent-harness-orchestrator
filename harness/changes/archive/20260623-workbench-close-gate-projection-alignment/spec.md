# Spec: workbench-close-gate-projection-alignment

## Goal

When the current selected Workbench demand is close-ready, the right-side
Decision Inspector and the authoritative confirmation queue must agree on the
primary user decision: `change.close`.

## Users

- Developers using Workbench to finish a manual-gated demand after result apply
  and landing readiness.
- Future agents relying on Workbench snapshots as product evidence.

## Acceptance Criteria

- AC-001: A selected demand with a valid current `change.close` approval shows
  `change.close` as `confirmationQueue.primary`.
- AC-002: The same snapshot shows `decisionInspector.primary` as close gate,
  not as stale failed result, failed validation, or blocked audit context.
- AC-003: Stale result/failure contexts remain available only as related or
  history evidence and cannot be the selected-demand primary decision while a
  current close gate exists.
- AC-004: The visible right-pane primary card shows the close/complete demand
  wording and carries the scoped `change.close` action payload.
- AC-005: The change does not create close authority in UI code; close readiness
  still comes from existing approval / close-gate evidence.
- AC-006: The UI does not expose future-only full-auto, scheduler loop, parallel
  executor, merge queue, slot allocator, or child Change controls.

## Non-Goals

- No source apply or close lifecycle behavior change.
- No real Codex rerun.
- No scheduler, Goal Loop runtime, or full-auto implementation.
- No new evidence family or runtime artifact.

## Constraints

- The confirmation queue remains the authoritative executable surface.
- Decision Inspector is a projection and must be rebuilt from canonical
  approval/result/evidence state.
- High-impact close/archive still requires existing scoped `change.close`
  action and human confirmation.
- Existing dirty/staged worktree changes are preserved.

## Risks

- Hiding still-actionable validation/audit failures too broadly. The alignment
  must apply only when a current close gate exists for the selected demand.
- Creating two primary close cards. Queue de-duplication and primary count must
  remain stable.
- Fixing only the React component while API snapshots remain contradictory.
