# Spec: workbench-scoped-automation-decomposition-gate-coverage-v1

## Goal

Allow Workbench `完全访问权限` scoped automation to consume the existing
`planning.decompose` primary gate after planning confirmation, while preserving
current-gate revalidation, explicit Change scope, and high-impact human gates.

## Users

Developers using Workbench demand conversations who choose `完全访问权限` for the
current demand and expect AHO to continue safe local setup steps until a real
blocker or human gate appears.

## Acceptance Criteria

- AC-001: `planning.decompose` is recognized as the real decomposition proposal
  action id and may be consumed by scoped automation only when it is the current
  enabled `confirmationQueue.primary` workflow action for the selected Change.
- AC-002: Scoped automation revalidates `planning.decompose` current-gate scope
  and fails closed for missing, stale, forged, disabled, or cross-Change
  targets.
- AC-003: One `完全访问权限` authorization can advance through
  `planning.confirm-execution` and `planning.decompose`, then continue only
  through already allowed local gates or stop at a blocker, unsupported gate,
  budget limit, source/artifact drift, or high-impact human gate.
- AC-004: Workbench UI remains honest: `请求批准` remains default, the full
  access payload contains the current gate action type and Change scope,
  running automation suppresses duplicate primary confirmations, and no
  full-auto / parallel executor / merge queue copy appears.
- AC-005: Real UI acceptance in an external sandbox proves the ordinary
  Workbench path advances beyond `planning.decompose` without source-root
  apply/close/merge automation.

## Non-Goals

- Do not auto-run `planning.generate`.
- Do not auto-apply source changes, close/archive Changes, merge, push, or run
  Harness evolution.
- Do not implement a scheduler loop, full-auto task mode, parallel executor,
  slot allocator, or child Change creation.
- Do not introduce a parallel permission system, action registry, projection
  system, or new evidence family.

## Constraints

- Reuse `src/automation-runtime/`, the workflow action registry, current action
  revalidation, existing planning handlers, and Workbench confirmation queue
  projection.
- `planning.decompose` must remain proposal generation only; confirmation of the
  generated DecompositionPlan and readiness assessment remain separate gates.
- `README.md` remains unrelated and untracked.

## Risks

- If `planning.decompose` is added only to the automation allow-list without
  current-gate revalidation, automation could rely on a stale or forged gate.
- If UI copy implies global full-auto, users may infer apply/close/merge
  authority that this change does not grant.
