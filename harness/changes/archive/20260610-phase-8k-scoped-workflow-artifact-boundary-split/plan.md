# Plan: Phase 8K Scoped Workflow Artifact Boundary Split
## Approach

Keep the change narrow: first repair handoff/docs drift, then add artifact-layer
scope guards, then split `workflow-artifacts/manager.ts` behind a facade without
forcing callers to migrate. The implementation should move code in cohesive
chunks and leave behavior unchanged except for fail-closed handling of
cross-change or misplaced workflow artifacts.

## Steps

1. Repair docs drift in `AGENTS.md`, `docs/STATUS.md`,
   `docs/ARCHITECTURE.md`, `docs/RUNTIME.md`, and `docs/BOUNDARIES.md`.
2. Add `src/workflow-artifacts/guards.ts` to resolve canonical Change id from
   `changePath/change.json` and assert artifact `changeId` matches it.
3. Split `src/workflow-artifacts/manager.ts` into:
   - schemas/types;
   - paths and artifact ref resolving;
   - hashing;
   - rendering;
   - DecompositionPlan read/write;
   - DecompositionReadinessManifest read/write;
   - TaskQueueProposal read/write/build/supersede;
   - WorkflowGraphPlan read/write/compile.
4. Keep `src/workflow-artifacts/manager.ts` as a re-export facade.
5. Apply guards to all read/write/build/compile entrypoints and preserve
   existing output paths, hashes, and Markdown.
6. Extend unit and module-boundary tests for facade compatibility, forbidden
   imports, cross-change rejection, and unchanged graph/hash behavior.
7. Run focused product tests, full product verification, Harness lint, encoding
   lint, reindex, and evolve check.

## Decisions

- Use `changePath/change.json` as the canonical source for artifact directory
  scope.
- Scope mismatch is a hard error at artifact read/write/build/compile entrypoints.
- Projection callers may continue catching read failures and returning null, but
  they must not show a mismatched artifact.
- External callers keep importing from `src/workflow-artifacts/manager.ts` in
  this phase.

## Planning-Discovered Gaps

- Original planning only called out `compileWorkflowGraphPlan()` and
  `buildTaskQueueProposalFromReadiness()`. Inspection showed all workflow
  artifact reads/writes should share the same Change-scope guard.
