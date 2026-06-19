# Spec: maintenance-store-backed-artifact-lookup-helper-reuse

## Goal

Move repeated store-backed artifact lookup mechanics in the maintenance canonical update / patch chain into the existing maintenance artifact-store owner.

## Users

- AHO maintainers and future agents extending product maintenance artifacts.
- Existing callers of canonical `read...For...` wrappers through `src/agent-task/manager.ts` and direct module imports.

## Acceptance Criteria

- AC-001: `src/agent-task/maintenance-artifact-store.ts` exposes a focused helper for finding the first matching store-backed artifact by predicate while delegating to `listMaintenanceArtifacts`.
- AC-002: The helper preserves existing `listMaintenanceArtifacts` semantics: schema validation behavior, invalid-file skipping, missing-root behavior, and `createdAt` ordering.
- AC-003: The six canonical chain `read...For...` wrappers reuse the helper and keep their exported names, arguments, return type, and null/match behavior unchanged.
- AC-004: No schemas, artifact shapes, Markdown, ledger event policy, authority flags, ToolPolicyGate, human gates, Workbench, Scheduler, Goal Loop, manager facade, source mutation path, or reference source changes are introduced.
- AC-005: Tests cover direct helper match/null behavior and existing canonical chain idempotency/artifact behavior still passes.
- AC-006: Module Boundary and Core Mechanism Reuse review evidence records `maintenance-artifact-store.ts` as the shared owner and canonical modules as thin domain wrappers.

## Non-Goals

- Indexing, caching, path scanning, new store metadata, alternate ordering, broader maintenance-chain rewrite, manager facade changes, or unrelated lookup migration.

## Constraints

- First match means the first artifact in existing `listMaintenanceArtifacts` order.
- Reuse only the six known equivalent canonical chain list-then-find wrappers unless implementation reveals an identical same-owner pattern.
- Reference projects are evidence only; no reference runtime copying.

## Risks

- A generic predicate helper could become too broad if later agents put domain policy in predicates outside owner modules. This change keeps domain wrappers explicit and records the boundary.

