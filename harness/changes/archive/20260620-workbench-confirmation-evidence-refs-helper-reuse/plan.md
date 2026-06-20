# Plan: workbench-confirmation-evidence-refs-helper-reuse

## Approach

Create a read-model top-level helper for plain string confirmation evidence refs and migrate only the repeated optional string-array patterns in confirmation projections. Keep behavior mechanical and preserve all runtime, gate, source, remote, Goal Loop, and Scheduler authority boundaries.

## Steps

1. Add `src/workbench/projections/read-model/evidence-refs.ts` with an order-preserving, no-dedupe helper.
2. Update `confirmation/decision-context.ts` to use the helper.
3. Update `confirmation/typed-workflow.ts` targeted `evidenceRefs` expressions to use the helper.
4. Add focused boundary tests for helper behavior, owner location, and migrated target files.
5. Run targeted Workbench read-model/boundary verification, drift grep, typecheck/lint/build, and Harness checks.

## Decisions

- Plan pre-review: subagent `019ee320-af4e-7101-802d-33e18f320092` returned `revise`, approving the direction after requiring a separate `evidence-refs.ts` owner and a strict plain string-array scope.
- Owner decision: use `src/workbench/projections/read-model/evidence-refs.ts`, not `evidence-actions.ts`, because evidence actions and evidence ref arrays have different shapes and responsibilities.
- Scope decision: migrate `confirmation/typed-workflow.ts` and `confirmation/decision-context.ts` only; do not touch `run-graph.ts`, `thread-stream.ts`, landing/remote/source handlers, Goal Loop, or Scheduler runtime authority.

## Module Boundary Plan

- Owner module: `src/workbench/projections/read-model/evidence-refs.ts`.
- New / moved responsibilities: construction of plain string evidence ref arrays for read-model confirmation projections.
- Facade touch points: none expected; public read-model facade remains a thin export of implementation.
- Forbidden write-back locations: feature-local confirmation files should not keep adding repeated optional evidence ref array/filter snippets when this helper applies.
- Compatibility surface: `WorkbenchConfirmationQueueItem.evidenceRefs` remains `string[]` with the same order and contents.
- Boundary tests: update `tests/unit/workbench-module-boundaries.test.ts`; run `tests/unit/workbench-read-model.test.ts`.
- Follow-up split candidates: none.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: Workbench read-model projection helper ownership.
- Why existing mechanisms are insufficient if a new mechanism is proposed: `evidence-actions.ts` owns `WorkbenchDecisionAction` construction, not plain evidence ref arrays; a separate owner keeps responsibilities clear.
- Domain-specific logic location: confirmation files retain item-specific summaries, risks, actions, and target ids.
- Shared cross-cutting logic location: `src/workbench/projections/read-model/evidence-refs.ts`.
- Local framework / state machine / projection / validation / gate avoided: avoids repeated local optional evidence ref projection snippets.
- Future-cost reduction for similar features: future confirmation surfaces can reuse one helper for plain string refs.

## Planning-Discovered Gaps

None blocking after subagent pre-implementation review. Scope was narrowed per review to avoid structured evidence ref objects and runtime/gate behavior.
