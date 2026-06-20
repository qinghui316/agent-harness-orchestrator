# Spec: workbench-maintenance-confirmation-unhandled-latest-helper-reuse

## Goal

Reduce repeated Workbench maintenance confirmation projection selection logic by moving the cross-cutting "latest eligible unhandled created-at record" selection into the existing projection summary helper owner.

The previous `20260619-workbench-maintenance-confirmation-projection-summary-reuse` archive established shared timestamp projection helpers. This change is the next smaller step: reuse a common projection-selection helper for handled-id filtering and eligibility checks while leaving maintenance-specific IO and confirmation semantics in the maintenance confirmation module.

## Users

- Developers extending Workbench read-model and maintenance confirmation projections.
- Future agents applying Architecture Growth Control / Core Mechanism Reuse to projection code.

## Acceptance Criteria

- AC-001: The three maintenance confirmation paths still emit at most one maintenance confirmation item each and select the newest eligible unhandled candidate.
- AC-002: Handled canonical update proposals, canonical patch proposals, and canonical patch application manifests do not re-enter the maintenance confirmation queue.
- AC-003: Canonical patch apply confirmation still excludes manifests whose `applicationStatus` is not `ready-for-application`.
- AC-004: Existing fallback order remains unchanged: update decision target first, otherwise patch gate target, otherwise patch apply target.
- AC-005: Action ids, action types, payload target ids, `requiresConfirmation`, and human-gate copy remain compatible.
- AC-006: The new helper is a pure read-model projection helper: no file IO, manager calls, Workbench action dispatch, ToolPolicy, Validation, Audit, IntegrationCheck, Scheduler, Goal Loop, or source mutation dependencies.
- AC-007: The helper does not mutate its input arrays.

## Non-Goals

- Do not create a maintenance confirmation framework or queue state machine.
- Do not move maintenance artifact reads, handled record reads, fallback order, confirmation item construction, or domain-specific eligibility into the shared helper.
- Do not change Workbench UI behavior, source apply behavior, scheduler behavior, Goal Loop behavior, or Harness evolution behavior.

## Constraints

- Reuse `src/workbench/projections/read-model/projection-summary.ts` as the owner for generic projection selection.
- Keep domain-specific maintenance confirmation logic in `src/workbench/projections/read-model/confirmation/maintenance.ts`.
- Preserve public projection and action payload shapes.

## Risks

- Over-abstracting the helper could blur the boundary between pure projection selection and maintenance confirmation behavior.
- Under-testing the behavior could miss a fallback or handled-target regression.
