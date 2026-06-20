# Plan: workbench-maintenance-confirmation-unhandled-latest-helper-reuse

## Approach

Add one small pure helper to `projection-summary.ts` that selects the latest created-at candidate whose id is not present in handled records and whose optional eligibility predicate passes. Replace the repeated Set/filter/latest code in `confirmation/maintenance.ts` with the helper.

The helper will not know about maintenance, confirmation queue items, action payloads, human gates, files, or managers. Maintenance confirmation code remains responsible for listing artifacts and handled records, ordering fallback paths, applying maintenance-specific eligibility, and building confirmation items.

## Steps

1. Add and export a pure `latestUnhandledByCreatedAt` style helper in `projection-summary.ts`.
2. Update `confirmation/maintenance.ts` imports and replace the three repeated handled-id selection blocks.
3. Update focused boundary tests for the helper owner and import direction.
4. Reuse the existing slow maintenance flow test for behavioral projection coverage, adding assertions only if current coverage is insufficient.
5. Run targeted verification and record why full `npm run test` is not required.

## Decisions

- Owner module is `src/workbench/projections/read-model/projection-summary.ts`, because it already owns timestamp sorting and field projection helpers.
- `confirmation/shared.ts` is not the owner for this helper; it owns confirmation queue item/action shaping.
- This change is not a duplicate of the earlier projection-summary reuse archive. It handles the repeated handled-id and eligibility selection pattern layered on top of `latestByCreatedAt`.

## Module Boundary Plan

- Owner module: `src/workbench/projections/read-model/projection-summary.ts`.
- New / moved responsibilities: pure latest unhandled candidate projection selection.
- Facade touch points: none.
- Forbidden write-back locations: `src/workbench/projections/read-model/confirmation/shared.ts` for this pure selection helper, Workbench action handlers, server routes, manager facades, scheduler/Goal Loop modules, and maintenance artifact managers.
- Compatibility surface: maintenance confirmation queue item shape and workflow action payloads remain unchanged.
- Boundary tests: helper export/import assertions and source-boundary assertions in focused Workbench boundary coverage.
- Follow-up split candidates: none.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: Workbench read-model projection summary helpers.
- Why existing mechanisms are insufficient if a new mechanism is proposed: existing helpers sort/latest by timestamp but do not capture the repeated handled-id plus optional eligibility candidate selection.
- Domain-specific logic location: `confirmation/maintenance.ts` keeps artifact reads, handled record reads, fallback order, status eligibility, copy, and payloads.
- Shared cross-cutting logic location: `projection-summary.ts` owns pure candidate selection.
- Local framework / state machine / projection / validation / gate avoided: avoids three feature-local mini selection blocks and avoids a maintenance confirmation framework.
- Future-cost reduction for similar features: future read-model projections can reuse a single pure helper for latest unhandled candidate selection instead of re-creating Set/filter/latest logic.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

- Existing slow maintenance flow coverage already includes `selects newest eligible maintenance confirmation records with projection summary helper semantics`; use it as behavior coverage rather than adding a broad new scenario unless the implementation reveals a gap.
- Implementation-preflight subagent reviewed the plan and required narrowing the helper to pure projection selection, using `projection-summary.ts` as owner, and keeping IO/gate semantics in maintenance confirmation.
