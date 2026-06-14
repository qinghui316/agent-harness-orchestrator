# Plan: Phase 10Q Main Agent Goal Loop Controller Policy Contract

## Approach

Implement a minimal controller policy layer inside `src/goal-loop`. It will consume the latest Goal Loop packet plus an explicit current gate snapshot supplied by the read model or caller, classify the safe posture, and persist a non-executing artifact. Workbench projection can read the latest verdict for display only.

## Steps

1. Fix Phase 10P -> 10Q handoff drift in docs.
2. Add Goal Loop controller policy schema/types/paths/repository/rendering/compiler.
3. Export the new owned module through `src/goal-loop/manager.ts`.
4. Add Workbench read-model summary fields for latest controller verdict without adding a new primary action.
5. Add unit/module-boundary tests.
6. Run focused and full verification, then close and commit.

## Decisions

- Controller policy evidence is a derived planning artifact, not workflow truth.
- This phase does not add a new Workbench action; it can be compiled by tests/future surfaces and displayed when present.
- Stale or mismatched packet/gate does not create a fallback executable action; it records suppress/wait evidence.

## Module Boundary Plan

- Owner module: `src/goal-loop`.
- New / moved responsibilities: controller policy type/schema/path/repository/render/compiler.
- Facade touch points: `src/goal-loop/manager.ts` re-exports only; Workbench read-model reads latest summary only.
- Forbidden write-back locations: `src/workbench/chat.ts`, Workbench action handler maps, server route facades, web shell, CLI command modules, scheduler-runtime modules.
- Compatibility surface: old `src/goal-loop/manager.ts` imports continue to work.
- Boundary tests: Goal Loop unit tests for verdict behavior; module boundary test for owned module imports.
- Follow-up split candidates: none.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

None yet.

