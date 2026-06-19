# Plan: maintenance-store-backed-artifact-lookup-helper-reuse

## Approach

Add a small `findMaintenanceArtifactBy` helper to the existing maintenance artifact-store owner. The helper will call `listMaintenanceArtifacts(memory, store)` and return the first artifact matching a caller-supplied predicate or `null`. Then replace only the six equivalent canonical chain list-then-find wrappers with thin calls to the helper.

## Steps

1. Add `findMaintenanceArtifactBy` in `src/agent-task/maintenance-artifact-store.ts`.
2. Import and reuse it in:
   - `readMaintenanceCanonicalUpdateDecisionForProposal`
   - `readMaintenanceCanonicalPatchProposalForDecision`
   - `readMaintenanceCanonicalPatchApplicationGateForPatchProposal`
   - `readMaintenanceCanonicalPatchApplicationManifestForGate`
   - `readMaintenanceCanonicalPatchApplicationResultForManifest`
   - `readMaintenanceCanonicalPatchApplicationReportForResult`
3. Add direct helper coverage in `tests/unit/agent-task-boundaries.test.ts`.
4. Run targeted and broad verification, then independent close-ready review.

## Decisions

- Helper name: `findMaintenanceArtifactBy`, not `readMaintenanceArtifactBy`, because this is predicate-based lookup over listed artifacts rather than direct id read.
- Preserve existing exported canonical wrapper names and behavior for compatibility.
- Do not introduce indexes, caches, alternate ordering, new store metadata, or manager facade changes.

## Module Boundary Plan

- Owner module: `src/agent-task/maintenance-artifact-store.ts`.
- New / moved responsibilities: store-backed first-match artifact lookup by predicate moves from six canonical feature wrappers into the artifact-store owner.
- Facade touch points: none; `src/agent-task/manager.ts` remains untouched as a compatibility re-export surface.
- Forbidden write-back locations: Workbench, bridge/runtime adapters, frontend, scheduler modules, Goal Loop modules, manager facades, source apply paths, and reference-project source.
- Compatibility surface: canonical `read...For...` exported wrappers, artifact JSON/Markdown, ledger entries, ordering, and null behavior remain unchanged.
- Boundary tests: direct helper test plus existing canonical chain tests and forbidden-import review.
- Follow-up split candidates: none.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: maintenance artifact-store access owner and existing `listMaintenanceArtifacts` semantics.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new framework is proposed; this adds a missing small helper to the existing owner.
- Domain-specific logic location: canonical modules keep domain-specific wrapper names and predicates.
- Shared cross-cutting logic location: first-match store-backed artifact lookup belongs in `src/agent-task/maintenance-artifact-store.ts`.
- Local framework / state machine / projection / validation / gate avoided: avoids preserving six local list-then-find lookup copies and avoids creating a feature-local artifact lookup protocol.
- Future-cost reduction for similar features: future maintenance artifact families can reuse one owner helper while keeping domain wrappers explicit.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

- Subagent plan review passed and required the helper to delegate to `listMaintenanceArtifacts`, preserve first-match ordering, avoid `readMaintenanceArtifactBy` naming, and stay limited to the six equivalent canonical chain wrappers.

