# Plan: Phase 8O Scoped Worktree Metadata Boundary Split

## Approach

Implement the guard first, then split the manager into small modules while preserving the current facade exports. Keep behavior changes limited to fail-closed handling for invalid Worktree metadata.

## Steps

1. Update documentation drift for Phase 8O.
2. Add Worktree domain modules for schemas/types, paths, ids, repository, guards, status, creation, lifecycle, and index.
3. Route all Worktree metadata reads through a guard that checks id, project id, and checkout root scope.
4. Preserve projection-safe listing by skipping invalid metadata, and preserve strict direct read/update/delete behavior by throwing on invalid metadata.
5. Keep `src/worktree/manager.ts` as the public compatibility facade.
6. Add tests for forged metadata, cross-project metadata, checkout root escape, facade compatibility, and module boundaries.
7. Run focused and full product/Harness verification.

## Decisions

- Invalid metadata in list/projection paths is skipped rather than crashing first-screen projection.
- Invalid metadata in direct `getWorktreeStatus()`, `removeWorktree()`, and `markWorktreeApplied()` paths rejects the operation.
- The expected checkout root remains `getAhoHome()/worktrees/{projectId}/checkouts`.
- Existing external imports may continue to use `src/worktree/manager.ts`.

## Planning-Discovered Gaps

None.
