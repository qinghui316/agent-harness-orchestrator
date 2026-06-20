# Plan: workbench-worker-rework-reconcile-optional-target-helper-reuse

## Approach

Keep the change as a narrow Architecture Growth Control slice. Replace only the equivalent optional string target comparisons in the Workbench `rework-reconcile-result` action with the existing helper. Leave all checks that compare required artifacts, runtime latest state, code-gate readiness, or optional existing result artifacts in their current direct form.

## Steps

1. Update the active ECL artifacts and handoff pointers for this structured change.
2. Replace equivalent optional request-target checks in `src/workbench/actions/boundary.ts` with `assertWorkbenchActionOptionalStringTarget`.
3. Extend `tests/unit/workbench-module-boundaries.test.ts` to assert helper adoption for all rework reconcile optional targets and to guard that `existingResult?.id` stays direct.
4. Run targeted Workbench module-boundary test, product type/lint/build checks, and Harness checks.
5. Run independent close-ready review and close/archive only if handoff and active change are aligned.

## Decisions

- Scope is limited to `planning.scheduler.worker.rework-reconcile-result`; adjacent validate/audit paths remain follow-up candidates.
- `request.runId` will compare to `reworkStart.reworkRunId ?? ""` to preserve current optional-target semantics through the helper.
- `request.schedulerWorkerReworkResultId` remains a direct check because it targets an optional already-created result artifact, not a stable required latest target string.
- Full `npm run test` is not planned for this helper-only slice unless implementation touches runtime semantics or shared payload behavior beyond the targeted Workbench action boundary.

## Module Boundary Plan

- Owner module: `src/workbench/actions/active-target.ts` owns reusable Workbench action target helper logic; `src/workbench/actions/boundary.ts` wires it into the action path.
- New / moved responsibilities: no new responsibility; repeated local optional target comparisons move to the existing helper call site.
- Facade touch points: none.
- Forbidden write-back locations: scheduler runtime, Workbench UI, bridge/frontend glue, and artifact stores.
- Compatibility surface: Workbench action request and result payload shapes remain unchanged.
- Boundary tests: `tests/unit/workbench-module-boundaries.test.ts`.
- Follow-up split candidates: none.
- If not applicable, reason: not applicable; module boundary coverage is required for this change.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: `assertWorkbenchActionOptionalStringTarget`.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new mechanism is proposed.
- Domain-specific logic location: `planning.scheduler.worker.rework-reconcile-result` still decides which scheduler worker rework targets are relevant.
- Shared cross-cutting logic location: optional stale-target comparison and error construction stays in `src/workbench/actions/active-target.ts`.
- Local framework / state machine / projection / validation / gate avoided: avoids another feature-local stale target validator.
- Future-cost reduction for similar features: later scheduler worker rework actions can follow the same helper pattern instead of adding local `if (request.id && request.id !== latest.id)` blocks.
- If not applicable, reason: not applicable; core mechanism reuse is the point of this change.

## Planning-Discovered Gaps

- Subagent plan review approved the slice with adjustments: keep scope to `rework-reconcile-result`, preserve `existingResult?.id` as a direct check, use a rework-specific run label, assert all adopted helper calls, and include `harness-change.ps1 status` in close verification.

