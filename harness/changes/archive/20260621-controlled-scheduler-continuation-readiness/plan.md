# Plan: controlled-scheduler-continuation-readiness

## Approach

Implement one medium product-functional slice: an embedded
`controlledLoopContinuationReadiness` summary on existing
`SchedulerControlledStepEvidence`, built by `src/scheduler-runtime/` from the
already-recorded tick/route/handoff data. Workbench will project that summary as
read-only evidence and, where current Workpad gate data is available, fail it
closed when it does not align with the visible gate. The frontend will only
render the projected summary inside the existing Workpad Scheduler evidence
surface.

Plan review was performed by subagent `019ee682-6253-75f0-8a62-660afd034e58`.
Result: PASS with required tightening. The implementation must not create a
separate artifact family, must embed the summary in existing controlled step
evidence, must split runtime/read-model/frontend responsibility, and must prove
no new execution authority.

## Steps

1. Add scheduler-runtime continuation readiness types, schema, builder, and
   rendering on top of existing controlled step evidence/tick/route data.
2. Include the embedded readiness summary when recording controlled step
   evidence.
3. Extend Workbench projection/read-model types to expose the summary, and align
   it with the current visible human gate using existing scope/reconfirmation
   helpers where appropriate.
4. Render the readiness summary in the existing Workpad Scheduler evidence card
   using user-facing copy.
5. Add targeted runtime, schema/projection, and real React/App DOM tests.
6. Run product and Harness verification, then update review/handoff and close if
   evidence is complete.

## Decisions

- The readiness summary is embedded in `SchedulerControlledStepEvidence`, not a
  new artifact family.
- Readiness reuses controlled-loop posture states rather than introducing a new
  state machine.
- Existing `planning.scheduler.controlled-advance.run` remains the only
  controlled Scheduler wrapper execution path.
- UI exposure is read-only; the right confirmation queue remains the only
  executable continuation gate.

## Module Boundary Plan

- Owner module: `src/scheduler-runtime/` owns continuation readiness
  classification from controlled step evidence.
- New / moved responsibilities: add a focused scheduler-runtime builder/type for
  continuation readiness; no moved responsibilities.
- Facade touch points: `src/workbench/workflow-projection.ts` may expose the
  summary through existing projection DTOs; frontend card renders only.
- Forbidden write-back locations: no main policy in Workbench action handlers,
  server routes, frontend components, manager facades, Goal Loop controller, or
  ToolPolicy modules.
- Compatibility surface: existing controlled step evidence fields remain
  compatible; new optional summary is additive.
- Boundary tests: runtime builder/schema tests, projection tests, and UI DOM
  tests.
- Follow-up split candidates: none.
- If not applicable, reason: not applicable; product code changes require module
  boundary coverage.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: existing controlled step evidence,
  controlled loop tick/route summaries, Goal Loop posture vocabulary, Workbench
  projection DTOs, current-gate scope matching, and controlled Scheduler
  reconfirmation patterns.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no
  standalone mechanism is proposed; the additive summary bridges existing tick
  evidence into a reusable readiness projection.
- Domain-specific logic location: controlled Scheduler continuation
  classification belongs in `src/scheduler-runtime/`.
- Shared cross-cutting logic location: scope/gate alignment remains in Workbench
  read-model/action-scope helpers; no feature-local ToolPolicy or stale
  revalidation system.
- Local framework / state machine / projection / validation / gate avoided:
  avoid a new artifact family, new action protocol, new loop controller, or
  frontend policy inference.
- Future-cost reduction for similar features: later controlled Scheduler loop
  slices can consume the same embedded readiness summary instead of re-deriving
  tick/route/handoff status in every UI or prompt surface.
- If not applicable, reason: not applicable; this change adds a product feature
  path and projection.

## Planning-Discovered Gaps

- The exact read-model fail-closed shape will be finalized after inspecting the
  existing Workpad `nextAction`, `goalLoop`, and reconfirmation helpers during
  implementation. It must not create a new execution gate.

