# Plan: workbench-external-local-restore-v1

## Approach

Reuse the existing marker, registry, memory resolver, project status, and
Workbench read-model paths. Add one direct-project restore helper for server
startup/routing, then make the app/project status projection show memory state
honestly. Do not introduce a second Workbench execution path.

## Steps

1. Add a session-scoped direct project resolver that reads the source marker,
   checks registry id/path conflicts, and builds a `ManagedProject` without
   saving `registry.json`.
2. Thread the restored direct project through `startWorkbenchServer`,
   `/api/app/status`, `/api/projects`, and `/api/projects/:id/workbench/*`.
3. Extend project status DTOs with minimal memory diagnostics from
   `getMemoryStatus`.
4. Update frontend project details/sidebar/unmanaged diagnostics so missing
   external-local memory is distinct from uninitialized Harness.
5. Add unit/server/DOM tests for restored, missing-memory, and conflict cases.
6. Run an E-drive real UI restore acceptance and record the result.

## Decisions

- Direct serve restoration is session-scoped and does not write the registry.
- Project-scoped API remains the authoritative route for Workbench actions after
  restore; no direct-only execution surface is added.
- Missing memory is a blocker diagnostic, not an init shortcut.

## Module Boundary Plan

- Owner module: server project routing / project status / Workbench read-model
  and frontend project panels.
- New / moved responsibilities: session-scoped direct marker restore belongs in
  server/project routing, not Workbench action handlers.
- Facade touch points: `startWorkbenchServer` may compose restored input; route
  handlers delegate to the helper.
- Forbidden write-back locations: no new logic in workflow handlers,
  automation runtime, scheduler runtime, or broad Workbench action facades.
- Compatibility surface: existing HTTP JSON and project-scoped Workbench routes
  remain compatible; DTOs only gain additive memory diagnostics.
- Boundary tests: registry/server tests plus DOM project-surface checks.
- Follow-up split candidates: none.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: project marker, registry store,
  memory resolver, memory status, project status, and Workbench snapshot.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no
  new workflow mechanism is proposed; only direct serve routing needs a marker
  restore adapter.
- Domain-specific logic location: server route/project admin for restore,
  frontend project panels for diagnostics.
- Shared cross-cutting logic location: memory diagnostics remain in
  `getMemoryStatus` / `getProjectStatus`.
- Local framework / state machine / projection / validation / gate avoided: no
  new memory registry, permission system, or Workbench execution path.
- Future-cost reduction for similar features: future direct/project restore
  paths can reuse the same session-scoped route instead of bypassing registry
  and memory resolver behavior.

## Planning-Discovered Gaps

- The current frontend app bootstraps project mode from `/api/projects`; a
  direct path with no registered project is not visible unless the server
  injects a restored direct project into that list.
