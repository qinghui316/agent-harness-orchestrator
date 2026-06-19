# Plan: maintenance-canonical-patch-target-kinds-helper-reuse

## Approach

Add one pure helper to the canonical patch lineage owner and reuse it at the two existing canonical patch target-kind merge sites. Keep semantics identical by delegating to the existing `uniqueSorted` implementation and centralizing the type cast in the helper.

## Steps

1. Update `src/agent-task/canonical-patch-lineage.ts` to import `MaintenanceCanonicalUpdateTargetKind` and `uniqueSorted`, then export a typed target-kind merge helper.
2. Update `src/agent-task/canonical-updates.ts` `buildCanonicalPatchProposal` to use the helper.
3. Update `src/agent-task/canonical-patch-application.ts` `buildCanonicalPatchApplicationManifest` to use the helper.
4. Add targeted tests in `tests/unit/agent-task-boundaries.test.ts` for mixed duplicate/out-of-order proposal and manifest target-kind inputs.
5. Run targeted and broader product/Harness checks.

## Decisions

- Keep the helper in `canonical-patch-lineage.ts` because target-kind propagation is part of canonical patch lineage metadata.
- Do not move target-kind taxonomy, markdown rendering, authority flags, ledger summaries, store definitions, or schema logic in this change.
- Treat reference projects as design evidence only. AgentScope Java supports shared maintenance objects and human-gated curated memory, but this change does not copy reference runtime code.

## Module Boundary Plan

- Owner module: `src/agent-task/canonical-patch-lineage.ts` owns canonical patch lineage helpers, including target-kind aggregation.
- New / moved responsibilities: target-kind merge/cast moves from proposal and manifest builders to the lineage helper owner.
- Facade touch points: none. `src/agent-task/manager.ts` remains untouched.
- Forbidden write-back locations: Workbench server/actions/frontend, bridge/runtime adapter modules, manager facades, scheduler modules, Goal Loop modules, reference-project source.
- Compatibility surface: generated canonical patch proposal and manifest `targetKinds` arrays, artifact JSON/Markdown shapes, schemas, ledger entries, and Workbench projections must remain compatible.
- Boundary tests: targeted unit assertions for target-kind stability; import scan for forbidden boundary dependencies.
- Follow-up split candidates: none.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: canonical patch lineage helper owner in `src/agent-task/canonical-patch-lineage.ts`, plus existing `uniqueSorted` behavior.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new cross-cutting mechanism is proposed; the existing owner is strengthened with one small helper.
- Domain-specific logic location: proposal construction remains in `src/agent-task/canonical-updates.ts`; manifest construction remains in `src/agent-task/canonical-patch-application.ts`.
- Shared cross-cutting logic location: canonical patch target-kind aggregation lives in `src/agent-task/canonical-patch-lineage.ts`.
- Local framework / state machine / projection / validation / gate avoided: avoids repeated local target-kind merge/cast logic in proposal and manifest builders.
- Future-cost reduction for similar features: future canonical patch stages can reuse one helper for lineage target-kind propagation rather than retyping sorted/deduped merges.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

- Subagent plan review required mixed duplicate/out-of-order target-kind tests rather than relying on existing single-kind fixtures.
