# Plan: workbench-worker-rework-validate-optional-target-helper-reuse

## Approach

Keep the change as a narrow Architecture Growth Control slice. Replace only the equivalent optional string target comparisons in the Workbench `rework-validate-first` action with the existing helper. Leave checks that compare required artifacts, runtime latest state, code-gate readiness, validation-run freshness, or optional already-created validation artifacts in their current direct form.

## Steps

1. Update the active ECL artifacts and handoff pointers for this structured change.
2. Replace equivalent optional request-target checks in `src/workbench/actions/boundary.ts` with `assertWorkbenchActionOptionalStringTarget`.
3. Extend `tests/unit/workbench-module-boundaries.test.ts` to assert helper adoption for all rework validation optional targets and to guard that `existingValidation?.id` / `existingValidation?.validationRunId` stay direct.
4. Run targeted Workbench module-boundary test, product type/lint/build checks, and Harness checks.
5. Run independent close-ready review and close/archive only if handoff and active change are aligned.

## Decisions

- Scope is limited to `planning.scheduler.worker.rework-validate-first`; adjacent `rework-audit-first` remains a separate follow-up candidate.
- `request.schedulerWorkerAuditId` will compare to `reworkResult.schedulerWorkerAuditId ?? ""` to preserve current optional-target semantics.
- `request.runId` will compare to `reworkResult.reworkRunId ?? ""` to preserve current optional-target semantics.
- `request.schedulerWorkerReworkValidationId` remains a direct check against `existingValidation?.id`, and `request.reworkValidationRunId` remains a direct check against `existingValidation?.validationRunId`, because they target optional already-created validation artifacts rather than stable required latest target strings.
- Full `npm run test` is not planned for this helper-only slice unless implementation touches runtime semantics or shared payload/projection behavior beyond the targeted Workbench action boundary.

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
- Domain-specific logic location: `planning.scheduler.worker.rework-validate-first` still decides which scheduler worker rework validation targets are relevant.
- Shared cross-cutting logic location: optional stale-target comparison and error construction stays in `src/workbench/actions/active-target.ts`.
- Local framework / state machine / projection / validation / gate avoided: avoids another feature-local stale target validator.
- Future-cost reduction for similar features: later scheduler worker rework actions can follow the same helper pattern instead of adding local `if (request.id && request.id !== latest.id)` blocks.
- If not applicable, reason: not applicable; core mechanism reuse is the point of this change.

## Planning-Discovered Gaps

- Subagent plan review approved the slice with one adjustment: explicitly name the retained direct `existingValidation?.id` and `existingValidation?.validationRunId` checks in ECL/tests. The review also recommended keeping `rework-audit-first` separate and confirmed full `npm run test` is not needed unless scope expands.

