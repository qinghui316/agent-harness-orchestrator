# Spec: Phase 8I DemandWorker Domain Boundary Split

## Goal

Make DemandWorker execution coordination easier to maintain by moving the implementation out of one mixed manager file into owned domain modules while preserving all runtime behavior and public imports.

## Users

- Maintainers adding future bounded demand orchestration, scheduler, or multi-demand features.
- Workbench users relying on current queued/live/background demand worker behavior.
- Future agents that need clear DemandWorker repository, claim, lifecycle, and decision-log boundaries.

## Acceptance Criteria

- AC-001: Docs accurately record Phase 8H closed and Phase 8I active, with no stale Phase 8H active claim.
- AC-002: `src/demand-worker/manager.ts` is a compatibility facade, not the main implementation.
- AC-003: DemandWorker schemas/types, paths/artifacts, repository, decisions, queue projection, slot policy, claim service, lifecycle, and reconcile have clear modules.
- AC-004: Old public imports from `src/demand-worker/manager.ts` remain compatible.
- AC-005: New `src/demand-worker/*` modules do not import the manager facade, Workbench, server, web UI, or CLI command modules.
- AC-006: Enqueue resumes an existing non-terminal worker instead of creating a duplicate.
- AC-007: Claim respects max concurrent demand slots and keeps FIFO ordering.
- AC-008: Scoped claim only claims the requested `changeId`.
- AC-009: Active attempt guard still rejects duplicate active attempts for the same worker.
- AC-010: Complete/release write terminal worker state and main-orchestrator decision records.
- AC-011: Reconcile remains evidence/status reconstruction only and does not call agents.
- AC-012: Workbench pump preserves liveChangeId priority, background `setTimeout` scheduling, queued behavior, and projection semantics.
- AC-013: DemandWorker artifact paths, JSON shape, queue projection shape, decision log shape, Workbench projection/action behavior, SSE, and thread storage remain compatible.
- AC-014: No runtime/action/route/CLI command/scheduler/parallel/multi-Change/ODWF JS runtime/cache replay is introduced.
- AC-015: Product and Harness verification pass, or any pre-existing failure is explicitly recorded.

## Non-Goals

- Do not change `DEFAULT_MAX_CONCURRENT_DEMANDS`, `MIN_MAX_CONCURRENT_DEMANDS`, ids, status values, paths, JSON schemas, or Workbench action behavior.
- Do not split Workbench demand-worker orchestration in this phase; it may continue to import from the manager facade.
- Do not refactor unrelated domain managers.

## Constraints

- Phase 8I is a pure refactor. Behavior changes outside module ownership are regressions.
- `README.md` is unrelated and must remain excluded.
- The compatibility facade must keep existing tests and imports working.

## Risks

- Accidentally changing claim order or slot accounting could change demand execution behavior.
- Moving decision logging or queue projection could drop Workbench evidence.
- Splitting too aggressively could introduce circular imports or reverse dependencies on facades.
