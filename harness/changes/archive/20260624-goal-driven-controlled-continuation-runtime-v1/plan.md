# Plan: Goal-Driven Controlled Continuation Runtime V1

## Approach

Add a narrow runtime around the existing controlled Scheduler one-step wrapper.
The top-level Workbench action records one human-confirmed bounded
authorization and holds the normal in-flight lock. The runtime then executes
child iterations through an internal controlled-step executor that reuses
required-target checks, current action revalidation, ToolPolicy audit, and the
existing `planning.scheduler.controlled-advance.run` handler, without
recursing through the top-level Workbench action service.

## Steps

1. Extend workflow action types, request/DTO payloads, target id/scope helpers,
   and action forwarding for `planning.goal-loop.controlled-continue.run`.
2. Add server-side current-target revalidation for the new action using the
   current Workbench snapshot, current visible gate, Goal Loop ids, and concrete
   Scheduler scope.
3. Add `src/goal-loop-runtime/` with authorization/run/iteration records,
   max-step handling, stop reasons, and child iteration orchestration.
4. Add a Workbench action handler that delegates to the runtime owner and returns
   a user-safe summary/artifact.
5. Add projection/UI support that shows one bounded continuation primary gate
   only when the current controlled Scheduler gate is supported and matching.
6. Add targeted tests for runtime happy path, stale targets, in-flight behavior,
   child audit scope, terminal stop gates, projection visibility, DOM payloads,
   and forbidden future-capability copy.
7. Run required verification, update review evidence, update handoff docs if the
   change closes, reindex, and close/archive if verification passes.

## Decisions

- The new action name is `planning.goal-loop.controlled-continue.run`.
- Default `maxSteps` is `5`; server hard cap is `10`.
- V1 allows only `planning.scheduler.controlled-advance.run` child steps.
- The runtime records bounded authorization rather than changing global
  ToolPolicy status vocabulary.
- Child audit scopes include `coveredByGoalLoopRuntimeAuthorizationId` and
  `goalLoopRuntimeRunId`.
- The top-level continuation action remains high-impact and human-confirmed.

## Module Boundary Plan

- Owner module: `src/goal-loop-runtime/`.
- New responsibilities: bounded authorization records, runtime run records,
  iteration records, stop-reason classification, and child continuation loop.
- Facade touch points: Workbench action handler registration, workflow action
  registry, server request forwarding, frontend payload typing, and read-model
  projection are thin wiring only.
- Forbidden write-back locations: do not place loop orchestration in
  `src/workbench/chat.ts`, server route shells, broad projection aggregators, or
  frontend app shell.
- Compatibility surface: existing scheduler, Goal Loop, Workbench snapshot, and
  action JSON shapes remain compatible except for additive optional fields.
- Boundary tests: runtime owner unit tests plus Workbench action/revalidation
  and projection/DOM tests.
- Follow-up split candidates: none for V1 unless runtime grows beyond controlled
  Scheduler continuation.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: workflow action registry, required
  target validation, Workbench current-action revalidation, ToolPolicy audit,
  Goal Loop freshness/parity evidence, controlled Scheduler advance wrapper,
  thread in-flight guard, Workbench confirmation queue.
- Why a new mechanism is needed: existing Goal Loop evidence is intentionally
  non-executing, and existing controlled Scheduler advance executes only one
  user-confirmed step. A small runtime owner is needed to bind a scoped
  authorization to repeated evidence refresh and child step records.
- Domain-specific logic location: bounded continuation policy and stop reasons
  live in `src/goal-loop-runtime/`.
- Shared cross-cutting logic location: target validation, ToolPolicy, action
  scope comparison, and current-gate derivation remain in existing shared
  owners.
- Local framework avoided: no new generic workflow engine, scheduler loop,
  parallel executor, projection framework, or ToolPolicy vocabulary.
- Future-cost reduction: later automation can reuse the same scoped
  authorization/run/iteration boundary rather than inventing another hidden
  loop path.

## Planning-Discovered Gaps

- The top-level Workbench action service in-flight guard would block recursive
  child action submissions. Implementation must use an internal child executor
  below the top-level service boundary.
- Current request and frontend DTO types do not carry `maxSteps`; the field must
  be added end to end.
- Current ToolPolicy decision statuses do not model scoped automation. V1 must
  record scoped authorization refs in runtime/audit scope instead of changing
  global ToolPolicy semantics.
