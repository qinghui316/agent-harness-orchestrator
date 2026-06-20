# Spec: workbench-confirmation-evidence-refs-helper-reuse

## Goal

Reduce duplicated plain string evidence reference array construction in Workbench confirmation read-model projections.

## Users

- Workbench users who depend on stable confirmation queue evidence links.
- Future AHO developers and agents adding confirmation surfaces without repeating optional evidence ref filtering logic.

## Acceptance Criteria

- AC-001: A read-model evidence refs helper accepts `string | undefined | null` refs, returns `string[]`, filters missing or empty values, preserves order, and does not dedupe.
- AC-002: `confirmation/typed-workflow.ts` and `confirmation/decision-context.ts` use the helper for confirmation item `evidenceRefs` instead of repeated `artifact ? [artifact] : []` or typed Boolean filter patterns.
- AC-003: Sampled planning, decomposition, scheduler, and decision-context confirmation outputs keep compatible `evidenceRefs`.
- AC-004: The change does not modify workflow action runtime, human gates, ToolPolicyGate, source/remote behavior, Goal Loop, Scheduler authority, or structured evidence ref object shapes.
- AC-005: Review records Read Model Projection, Workbench User-Surface Honesty, Module Boundary, and Core Mechanism Reuse coverage, including targeted verification and skipped aggregate/full-suite rationale.

## Non-Goals

- No new user-facing feature, confirmation action type, action handler, server endpoint, source mutation, remote mutation, Goal Loop behavior, Scheduler runtime behavior, or reference project adoption.
- No changes to structured run graph evidence refs, thread stream evidence blocks, confirmation ordering, or scheduler gate semantics.

## Constraints

- The owner module must be read-model top-level `src/workbench/projections/read-model/evidence-refs.ts`.
- The helper owns plain string evidence refs only; evidence action construction remains in `evidence-actions.ts`.
- Confirmation projections remain derived views. `evidenceRefs` do not become workflow truth or execution authority.

## Risks

- Accidentally deduping or reordering evidence refs could change UI evidence link order.
- Over-broad migration could touch structured evidence ref objects with different shape and semantics.
