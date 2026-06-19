# Plan: maintenance-artifact-store-write-validation-reuse

## Approach

Strengthen the existing `MaintenanceArtifactStore` owner rather than adding another feature-local helper. The store already owns schema metadata for each JSON/Markdown maintenance artifact family; its writer should own the write-time schema validation before persistence. Canonical maintenance feature modules will continue building domain-specific artifacts and Markdown, while shared validation-at-write belongs to the store.

## Steps

1. Update `writeMaintenanceJsonMarkdownArtifact()` to call `store.schema.parse(value)` before `writeJsonFile(...)` or Markdown `writeFile(...)`. Do not assign or persist the parsed clone.
2. Remove only the seven immediate pre-write parses in `canonical-updates.ts`, `canonical-patch-application.ts`, and `canonical-patch-application-report.ts`.
3. Add a focused unit test in `tests/unit/agent-task-boundaries.test.ts` that passes an invalid object to the store writer, expects rejection, and verifies neither JSON nor Markdown was created.
4. Run targeted agent-task tests plus normal TypeScript/product/Harness gates.
5. Complete independent close-ready review, update handoff docs, close/archive, and commit.

## Decisions

- Validation belongs at the shared maintenance artifact persistence boundary because all current `writeMaintenanceJsonMarkdownArtifact()` callers already provide a typed store with a schema.
- The writer validates the original object but persists the original object to preserve the existing caller behavior where schemas were used as checks rather than serializers.
- The change intentionally does not convert non-store maintenance writers; that would broaden the slice beyond current Architecture Growth Control scope.

## Module Boundary Plan

- Owner module: `src/agent-task/maintenance-artifact-store.ts`.
- New / moved responsibilities: write-time schema validation for JSON/Markdown maintenance artifacts that use `MaintenanceArtifactStore`.
- Facade touch points: none; `src/agent-task/manager.ts` remains a thin compatibility facade and is not changed.
- Forbidden write-back locations: do not add validation branches to Workbench, bridge/frontend code, manager facades, or individual canonical feature writers when the shared store can own them.
- Compatibility surface: function name/signature, store descriptors, artifact refs, read/list behavior, JSON paths, Markdown paths, and caller-visible return values remain unchanged.
- Boundary tests: direct writer rejection/no-partial-write test plus existing canonical maintenance tests.
- Follow-up split candidates: none.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: `MaintenanceArtifactStore` store descriptors and writer.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new mechanism is proposed; the existing writer was missing validation despite owning schema metadata.
- Domain-specific logic location: artifact builders, Markdown renderers, lineage, target descriptors, authority flags, and ledger summaries stay in their existing canonical maintenance modules.
- Shared cross-cutting logic location: schema validation before JSON/Markdown persistence lives in `maintenance-artifact-store.ts`.
- Local framework / state machine / projection / validation / gate avoided: avoids every artifact family repeating local pre-write schema validation.
- Future-cost reduction for similar features: future maintenance artifact families using the store get write-time validation by default with less duplicated call-site ceremony.

## Planning-Discovered Gaps

- Subagent pre-implementation review returned PASS. Required tightenings recorded here: validate before any file write; treat parse as validation only; keep scope to seven immediate pre-write parses; record unchanged gates/authority/Workbench/scheduler/Goal Loop behavior in review.

