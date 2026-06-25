# Spec: workbench-post-plan-scoped-automation-execution-v1

## Goal

Ensure Workbench `完全访问权限` means "automate the already accepted execution
stage for the current Change", not "approve the plan for the user".

## Users

Developers using Workbench demand conversations with the two-tier approval
selector.

## Acceptance Criteria

- AC-001: When the current primary gate is `planning.confirm-execution`,
  Workbench does not offer `完全访问权限`, and the server rejects scoped
  automation targeting that gate.
- AC-002: After a plan has been manually accepted, scoped automation may
  consume current local execution-stage gates from the existing allowed set.
- AC-003: `planning.decomposition.confirm` remains eligible only as a scoped
  current gate whose target ids match the visible primary action; unaccepted
  scope expansion or stale/missing/cross-change targets fail closed.
- AC-004: Scoped automation still stops before `result.apply`, `change.close`,
  integration apply/discard, remote, merge, Harness evolution, and raw
  `planning.scheduler.*` actions.
- AC-005: Workbench UI continues to show only the two tiers, hides full-access
  for ineligible gates, and does not advertise full-auto, parallel executor, or
  merge queue behavior.

## Non-Goals

- Do not implement full-auto, a new Goal Loop runtime, a scheduler loop,
  parallel executor, slot allocator, child Change creation, or automatic
  source apply/close/merge.
- Do not change Codex runtime permission capability; this is AHO workflow
  authority tightening.

## Constraints

- Reuse `src/automation-runtime`, current action revalidation, Workbench
  confirmation projection, and `DecisionPanels`.
- Do not add a parallel action registry, permission system, projection system,
  or evidence family.
- Keep source mutation impossible before an explicit human apply/merge gate.

## Risks

- Existing tests may assume `planning.confirm-execution` is full-access
  eligible; update them to preserve the plan-human boundary.
- If decomposition confirmation can represent unaccepted scope expansion in a
  future artifact shape, eligibility must fail closed rather than silently
  continue.
