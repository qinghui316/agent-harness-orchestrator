# Plan: workbench-readonly-runtime-activity-log-v1

## Approach

Create a small read-only projection owner for runtime activity. It will gather
bounded evidence from existing Workbench/read-model/runtime owners and expose it
through a GET route. The frontend will add a center `运行日志` view and let the
right diagnostics rail navigate to it.

## Steps

1. Inspect run metadata/event readers, validation/audit summaries, topic
   message attachment/Skill metadata, runtime diagnostics, provider runtime
   summary, and current Workbench tabs.
2. Add runtime activity DTO/types and projection helper with bounded,
   sanitized timeline items.
3. Add project/topic-scoped GET route and frontend fetch state.
4. Add center `运行日志` view with filters, refresh, copy summary, and folded
   details.
5. Add right diagnostics navigation to the runtime log.
6. Add backend/read-model/frontend tests for bounded projection, sanitization,
   no fake controls, and no side-effect calls.
7. Run targeted verification, aggregate checks as needed, and Harness checks.

## Decisions

- V1 is a projection over existing evidence only.
- Runtime activity is not terminal output capture.
- The right diagnostics rail remains a summary; detailed browsing lives in the
  center workspace.
- Missing/unreadable evidence becomes warning activity instead of breaking the
  whole endpoint.

## Minimality Gate Plan

- Can this be a no-op: no; current diagnostics is a status summary, not an
  activity timeline.
- Reuse: existing provider runtime summary, runtime diagnostics, run artifacts,
  validation/audit summaries, topic metadata, terminal readiness.
- Shared root fix: one projection owner instead of per-feature log snippets.
- Avoided: command console, action buttons, runtime-log DB, provider selector,
  normal Agent mode, Browser/Git write/file editing.
- Smallest coherent change: bounded GET projection plus center read-only view.

## Module Boundary Plan

- Owner module: Workbench read-model projection for runtime activity.
- New / moved responsibilities: sanitize and order timeline items; map existing
  evidence to user-readable status.
- Facade touch points: Workbench API router and frontend panel shell.
- Forbidden write-back locations: source root, SQLite workflow truth, Harness
  artifacts, terminal sessions, action handlers, scheduler, apply/close.
- Compatibility surface: existing diagnostics route remains unchanged.
- Boundary tests: no `/workbench/actions` calls, no terminal open/write, no
  Run/Stop/fake provider controls.
- Follow-up split candidates: Browser activity, Git write/history activity,
  file editing activity.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: provider-runtime V2, runtime
  diagnostics, read-model artifact previews, validation/audit evidence, topic
  message metadata, terminal readiness.
- Why existing mechanisms are insufficient if a new mechanism is proposed:
  existing evidence exists but has no user-facing timeline projection.
- Domain-specific logic location: evidence readers stay in their owners.
- Shared cross-cutting logic location: runtime activity projection maps evidence
  to display items only.
- Local framework / state machine / projection / validation / gate avoided: no
  new workflow engine, permission system, persistent log, or gate.
- Future-cost reduction for similar features: later Browser/Git/file editing can
  add activity item producers without adding new UI patterns.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

None.
