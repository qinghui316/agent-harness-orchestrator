# Plan: workbench-read-model-evidence-action-helper-reuse

## Approach

Create a small read-model owner helper for evidence actions and migrate existing duplicated projection call sites to it. Keep the change mechanical and behavior-preserving: no runtime action execution, gate, source, remote, Goal Loop, Scheduler, or reference behavior changes.

## Steps

1. Add `src/workbench/projections/read-model/evidence-actions.ts` with `evidenceActions(artifact?: string, options?: { label?: string })`.
2. Update `decision-inspector.ts` to import the helper and remove its local duplicate function.
3. Update confirmation modules that currently repeat optional evidence action ternaries or label maps to import from `../evidence-actions.js`.
4. Add or update focused unit/boundary assertions for helper behavior, owner location, and behavior-preserving imports.
5. Run targeted projection/boundary verification, typecheck/lint/build, and Harness checks before close.

## Decisions

- Plan pre-review: subagent `019ee30f-b3d8-7571-84c4-6bbae6629013` returned `revise`, approving the direction after requiring the owner to be read-model top-level and the scope to stay evidence-action-helper-only.
- Owner decision: use `src/workbench/projections/read-model/evidence-actions.ts`; do not make `decision-inspector.ts` depend on `confirmation/shared.ts`, and do not put action construction in `projection-summary.ts`.
- Verification decision: use targeted-first verification because this change is a projection helper reuse and does not affect runtime action execution or source/remote gates.

## Module Boundary Plan

- Owner module: `src/workbench/projections/read-model/evidence-actions.ts`.
- New / moved responsibilities: evidence action construction for read-model projection affordances moves out of feature-local projection files.
- Facade touch points: none expected; public read-model facade remains a thin export of implementation.
- Forbidden write-back locations: `decision-inspector.ts` local helper definitions and `confirmation/shared.ts` as the cross-cutting evidence action owner.
- Compatibility surface: `WorkbenchDecisionAction` evidence action shape and Workbench projection behavior remain unchanged.
- Boundary tests: update `tests/unit/workbench-module-boundaries.test.ts`; run `tests/unit/workbench-read-model.test.ts`.
- Follow-up split candidates: none.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: Workbench read-model projection helper ownership.
- Why existing mechanisms are insufficient if a new mechanism is proposed: existing evidence action helper is scoped under confirmation, while decision inspector needs the same projection affordance without depending on confirmation queue internals.
- Domain-specific logic location: confirmation and decision inspector files retain their domain-specific queue/context construction.
- Shared cross-cutting logic location: read-model top-level evidence action helper.
- Local framework / state machine / projection / validation / gate avoided: avoids another local evidence action helper and repeated optional-artifact/label projection snippets.
- Future-cost reduction for similar features: future read-model surfaces can use the same helper instead of rebuilding action shape and labels.

## Planning-Discovered Gaps

None blocking after subagent pre-implementation review. Scope was narrowed per review to avoid runtime/gate refactors.
