# Plan: Workbench Worker First Pass Optional Target Helper Reuse

## Approach

Adopt the existing `assertWorkbenchActionOptionalStringTarget` helper in the two contiguous first-pass scheduler worker boundary paths. Replace only direct `request.field && request.field !== latest.field` checks where the latest value is a worker result or worker validation scalar. Keep checks that compare against optional existing downstream records local.

## Steps

1. Replace equivalent optional scalar target checks in `planning.scheduler.worker.validate-first`.
2. Replace equivalent optional scalar target checks in `planning.scheduler.worker.audit-first`.
3. Keep `existingValidation` and `existingAudit` checks unchanged.
4. Extend `tests/unit/workbench-module-boundaries.test.ts` helper-adoption assertions.
5. Run targeted verification plus build and Harness checks.

## Decisions

- Plan review subagent `019ee25e-cc53-7ad0-9ee7-2ac802d9dbc0` returned PASS with constraints.
- Use the existing helper rather than adding a new one.
- Include `npm run build` in verification to satisfy product gate confidence for this TypeScript source change.

## Module Boundary Plan

- Owner module: existing Workbench action target helper owner `src/workbench/actions/active-target.ts`.
- New / moved responsibilities: no new owner; repeated boundary comparisons become helper calls.
- Facade touch points: none.
- Forbidden write-back locations: Workbench UI, server bridge, scheduler runtime managers, reference projects, and `README.md`.
- Compatibility surface: action ids, payload fields, helper export, and fail-closed comparison behavior; mismatch wording standardizes to the existing helper.
- Boundary tests: `tests/unit/workbench-module-boundaries.test.ts`.
- Follow-up split candidates: none.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: `assertWorkbenchActionOptionalStringTarget`.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new mechanism is proposed.
- Domain-specific logic location: `src/workbench/actions/boundary.ts` keeps action labels and field mapping.
- Shared cross-cutting logic location: `src/workbench/actions/active-target.ts`.
- Local framework / state machine / projection / validation / gate avoided: avoids more hand-written optional scalar scope guards in Workbench action boundary code.
- Future-cost reduction for similar features: provides a reviewed pattern for later rework-path helper adoption without broad scheduler refactor.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

- Optional-latest downstream checks (`existingValidation`, `existingAudit`) remain local because the target may not exist yet.

