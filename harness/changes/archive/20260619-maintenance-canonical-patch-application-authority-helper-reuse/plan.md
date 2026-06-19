# Plan: maintenance-canonical-patch-application-authority-helper-reuse

## Approach

Add one focused canonical patch application authority helper and reuse it at the three repeated non-executing application authority sites. Keep semantics identical by returning the same four literal false fields and leaving all other authority fields in their existing builders.

## Steps

1. Add `src/agent-task/canonical-patch-application-authority.ts` with a typed helper for the four false application-authority fields.
2. Update `src/agent-task/canonical-updates.ts` `buildCanonicalPatchApplicationGateRecord` to spread the helper.
3. Update `src/agent-task/canonical-patch-application.ts` `buildCanonicalPatchApplicationManifest` to spread the helper.
4. Update `src/agent-task/canonical-patch-application-report.ts` `buildCanonicalPatchApplicationReport` to spread the helper while preserving `applicationAuthorized: true`.
5. Add direct helper-output coverage in `tests/unit/agent-task-boundaries.test.ts` and keep existing artifact authority assertions.
6. Run targeted and broader product/Harness checks.

## Decisions

- Use a new focused owner, `src/agent-task/canonical-patch-application-authority.ts`, rather than broad `canonical-patch-authority.ts`.
- Do not place the helper in `canonical-patch-lineage.ts`; lineage owns ids, lineage copies, lineage validation, and target-kind merging, not authority.
- Do not place the helper in `canonical-patch-application.ts`; `canonical-updates.ts` already builds the application gate and should not import from the manifest/application writer module.
- Do not include `applicationAuthorized` because observation reports retain `applicationAuthorized: true` while still remaining read-only and non-executing.
- Treat reference projects as design evidence only. AgentScope Java validates shared maintenance objects and human-gated curated memory, but this change does not copy reference runtime code.

## Module Boundary Plan

- Owner module: `src/agent-task/canonical-patch-application-authority.ts` owns canonical patch application authority helper literals.
- New / moved responsibilities: four repeated non-executing application authority flags move from gate, manifest, and observation report builders into the authority helper.
- Facade touch points: none. `src/agent-task/manager.ts` remains untouched.
- Forbidden write-back locations: Workbench server/actions/frontend, bridge/runtime adapter modules, manager facades, scheduler modules, Goal Loop modules, reference-project source.
- Compatibility surface: generated canonical patch gate, manifest, and report JSON/Markdown shapes, schemas, ledger entries, and Workbench projections must remain compatible.
- Boundary tests: direct helper-output assertion, existing artifact authority assertions, and import scan for forbidden boundary dependencies.
- Follow-up split candidates: none.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: existing maintenance canonical patch owner modules and literal authority flag safety boundary.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no broad new mechanism is proposed; a focused owner is added because no existing owner matches application authority without creating a dependency tangle.
- Domain-specific logic location: gate construction remains in `src/agent-task/canonical-updates.ts`; manifest construction remains in `src/agent-task/canonical-patch-application.ts`; report construction remains in `src/agent-task/canonical-patch-application-report.ts`.
- Shared cross-cutting logic location: non-executing application authority flags live in `src/agent-task/canonical-patch-application-authority.ts`.
- Local framework / state machine / projection / validation / gate avoided: avoids repeated local authority flag groups in three application artifact builders.
- Future-cost reduction for similar features: future canonical patch application evidence can reuse one helper for the shared non-executing authority boundary rather than retyping four safety flags.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

- Subagent plan review required a focused owner name and direct helper-output coverage.
