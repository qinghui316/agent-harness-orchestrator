# Plan: Phase 9D Scheduler Runtime Reconcile Shell

## Approach

Use the existing SchedulerRun as the single scheduler run identity and add a
separate `src/scheduler-runtime/` owner module for runtime shell sidecars.
Workbench actions will be thin dispatchers that revalidate selected Change and
SchedulerRun lineage, then call the runtime module to initialize state or create
reconcile snapshots.

## Steps

1. Repair handoff docs so Phase 9C is archived and Phase 9D is active.
2. Add scheduler-runtime schemas/types, paths, repository, guards, initialize,
   reconcile, and rendering helpers.
3. Wire Workbench action registry, stale-target revalidation, confirmation queue,
   server/live allow-list, payload types, and action event labels.
4. Add Workbench read-model summaries and lazy projections for runtime state and
   reconcile snapshots.
5. Add frontend cards for runtime shell and reconcile summary without exposing
   parallel execution controls.
6. Add focused tests for scope guards, duplicate initialize, no-execution
   behavior, action consistency, module boundaries, and Workbench projections.
7. Run focused tests, full product verification, and Harness verification.

## Decisions

- `SchedulerRun` remains the only scheduler run identity.
- Runtime shell data is stored in sidecar artifacts; existing SchedulerRun JSON
  is not expanded.
- Duplicate initialize fails closed rather than returning success.
- Reconcile writes snapshots and blocked/warning state only; it does not claim
  workers or allocate slots.
- ToolPolicyGate and human gate are recorded as future requirements, not
  executed or authorized in 9D.

## Module Boundary Plan

- Owner module: `src/scheduler-runtime/`.
- New / moved responsibilities: runtime state sidecars, runtime event journal,
  SchedulerRun lineage/scope guards, reconcile snapshot compilation, and
  Markdown rendering.
- Facade touch points: Workbench action handlers, read-model summaries, lazy
  projections, frontend cards, and workflow action payload helpers call the
  owner module but do not own runtime logic.
- Forbidden write-back locations: `src/workflow-scheduler/` for runtime logic,
  `src/workbench/chat.ts`, Workbench projection facades, server facades,
  frontend shell files, and CLI command modules.
- Compatibility surface: existing SchedulerRun public JSON and existing
  Workbench scheduler actions remain compatible; only new internal sidecars and
  new Workbench actions are added.
- Boundary tests: module-boundary tests assert scheduler-runtime does not import
  Workbench/server/web/CLI/facades; behavior tests assert no execution artifacts
  are created.
- Follow-up split candidates: future scheduler executor module after runtime
  shell and reconcile behavior are validated.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

None.
