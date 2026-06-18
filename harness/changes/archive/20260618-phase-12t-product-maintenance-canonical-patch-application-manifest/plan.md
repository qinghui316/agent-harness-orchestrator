# Plan: Phase 12T Product Maintenance Canonical Patch Application Manifest

## Approach

Implement a read-only canonical patch application manifest layer. The manifest will consume the already human-gated patch application record, validate it against the originating patch proposal, emit deterministic JSON/Markdown evidence, and report whether every operation has concrete target descriptors required by a future writer. Because current patch proposals lack those descriptors, the generated status should be blocked with explicit reasons.

The implementation intentionally stops before write behavior. Workbench will surface the manifest as maintenance status only; it will not add a confirmation queue item or action handler.

## Steps

1. Define manifest and target-descriptor types plus schemas.
2. Add manifest paths and a new owner module for generate/read/list/artifact-ref/markdown/ledger behavior.
3. Export the new owner module through the manager facade without moving business logic into the facade.
4. Filter manifest ledger entries out of maintenance candidate generation.
5. Add read-only Workbench maintenance projection fields for manifest count/latest readiness.
6. Add unit tests for lineage validation, blocked readiness, idempotency, no-mutation flags, ledger filtering, Workbench projection, and module boundaries.
7. Update current handoff documents for the active phase and run verification.

## Decisions

- Direct patch application is deferred. Existing operations do not contain deterministic target descriptors, so a writer would need to infer paths/content from summaries.
- No Workbench action is added in this phase. A future action would require separate stale revalidation, ToolPolicy audit, scoped payload, and duplicate-action coverage.
- The manifest event is maintenance evidence and must not become a new maintenance candidate source.

## Module Boundary Plan

- Owner module: `src/agent-task/canonical-patch-application.ts`.
- New / moved responsibilities: canonical patch application manifest generation, lineage validation, readiness classification, artifact refs, JSON/Markdown persistence, and ledger entry creation.
- Facade touch points: `src/agent-task/manager.ts` re-exports only.
- Forbidden write-back locations: stable memory, canonical docs, ECL/Harness templates, source root, apply/close state, remote handoff, and Harness evolution.
- Compatibility surface: existing canonical update proposal/decision/patch/gate APIs remain unchanged; new manifest helpers are additive.
- Boundary tests: agent-task boundary tests for facade export, manager no self-import, manifest idempotency/no mutation, and read-only Workbench projection.
- Follow-up split candidates: none.

## Planning-Discovered Gaps

- Current patch operations lack target path, expected content hash, replacement text, or hunks. This phase records the gap as blocked readiness instead of inventing a writer contract.
- Future ready-for-application manifests require a concrete target descriptor shape with target kind, target path, expected content hash, patch kind, and exactly one deterministic patch payload.
- Subagent plan review passed with amendments: keep this phase non-executing, fail closed on lineage/descriptor gaps, avoid Workbench action scope, and keep new logic out of the existing canonical update module.
