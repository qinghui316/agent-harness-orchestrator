# Plan: Phase 8I DemandWorker Domain Boundary Split

## Approach

First align handoff docs with the post-8H state. Then split `src/demand-worker/manager.ts` by stable domain responsibilities while preserving the existing facade exports. Finally add module-boundary and behavior tests around queueing, claiming, completing, releasing, and reconciling workers.

## Steps

1. Update `AGENTS.md`, `docs/STATUS.md`, `docs/ARCHITECTURE.md`, `docs/RUNTIME.md`, and `docs/BOUNDARIES.md` for Phase 8I active scope.
2. Extract DemandWorker schemas/types and path helpers.
3. Move worker/attempt repository reads and writes into a repository module.
4. Move main-orchestrator decision logging into a decisions module.
5. Move queue projection writing into its own module.
6. Move concurrency slot calculation and claim ordering into slot-policy / claim-service modules.
7. Move mark-running, complete, release, and status conversion helpers into lifecycle.
8. Move reconcile into a non-executing reconcile module.
9. Replace `manager.ts` with a compatibility facade that re-exports the owned modules.
10. Extend boundary and Workbench tests for facade compatibility, forbidden imports, FIFO claim, scoped claim, duplicate active attempt guard, completion/release decisions, and reconcile behavior.

## Decisions

- Workbench orchestration may continue importing from `src/demand-worker/manager.ts` in this phase. This keeps the refactor local to the DemandWorker domain.
- Queue projection writing remains a repository side effect of worker writes so Workbench behavior stays unchanged.
- Reconcile remains read/rebuild-only and must not call role agents or the Workbench orchestration pump.

## Planning-Discovered Gaps

- None blocking. Follow-up candidates remain `task-run/manager.ts`, `change/manager.ts`, and `workflow-artifacts/manager.ts`.
