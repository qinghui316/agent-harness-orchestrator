# Spec: Phase 8O Scoped Worktree Metadata Boundary Split

## Goal

Worktree metadata must be scoped to the current project and the requested Worktree id before it is trusted by status, projection, apply, remove, or mark-applied paths. `src/worktree/manager.ts` should become a compatibility facade over owned modules.

## Users

- Developers using AHO to run code, validation, audit, apply, landing, and integration workflows.
- Future agents modifying Worktree behavior who need clear module boundaries.

## Acceptance Criteria

- AC-001: Docs accurately record Phase 8N closed, Phase 8O active, and no stale Phase 8N active claim.
- AC-002: Worktree metadata read/status/update/delete paths verify filename `worktreeId`, JSON `worktreeId`, `projectId`, and checkout root scope.
- AC-003: Forged, misplaced, or cross-project Worktree metadata cannot enter status projection, apply, remove, or mark-applied paths.
- AC-004: `src/worktree/manager.ts` is a compatibility facade, not the main Worktree implementation file.
- AC-005: Worktree schema/type, path, id, repository, guard, status, creation, lifecycle, and index responsibilities have clear modules.
- AC-006: Existing public imports from `src/worktree/manager.ts` remain compatible.
- AC-007: Worktree metadata paths, JSON shape, status values, create/remove/apply semantics remain unchanged.
- AC-008: Code, Validation, Audit, Apply, Landing, Integration Check, and Spec-Test Worktree helper usage does not regress.
- AC-009: New `src/worktree/*` modules do not depend on the manager facade, Workbench, server, web UI, or CLI command modules.
- AC-010: No new runtime/action/route/CLI command/scheduler/parallel/multi-Change/ODWF runtime/cache replay is introduced.
- AC-011: Product and Harness verification pass, or any pre-existing failure is recorded.

## Non-Goals

- Full Validation or Audit manager split.
- Migrating all external imports away from the Worktree facade.
- Changing Worktree metadata schema, artifact locations, or CLI output.
- Automatically repairing invalid historical metadata.

## Constraints

- Use UTF-8 for source and docs.
- Keep `README.md` excluded.
- List/projection paths should be projection-safe by skipping invalid metadata.
- Direct read/update/delete paths should be strict and fail closed.

## Risks

- Some tests may have hand-written Worktree metadata outside the current global checkout root and need fixture updates to match current creation semantics.
- A too-strict root check could break external-local memory if it does not use the same AHO checkout root calculation.
