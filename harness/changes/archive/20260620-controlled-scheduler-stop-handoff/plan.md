# Plan: Controlled Scheduler Stop Handoff

## Approach

Implement one larger product slice: controlled advance remains one confirmed scheduler transition, but its result now carries a derived stop/next-step handoff that the Workbench user surface can summarize. The handoff will not create new actions, write a new artifact, authorize ToolPolicy, or change scheduler truth. It will classify only from existing result fields:

- the pre-step controlled advance/controlled step payload;
- post-step Goal Loop evaluation;
- optional post-step controller/readiness evidence;
- warning fields when evaluation/readiness cannot be prepared.

Plan self-review result: PASS from subagent `019ee463-d09b-7041-bd2d-cfc5922923ec`, with required tightening recorded below: `postStepHandoff` is a derived DTO only, readiness must not imply authorization, readiness failures must not roll back a successful concrete transition, and tests must prove no auto-execution or human-gate bypass.

## Steps

1. Add a small owned helper near the controlled scheduler action boundary that derives `postStepHandoff` from the existing controlled-advance result pieces without introducing persisted state.
2. Attach `postStepHandoff` to `planning.scheduler.controlled-advance.run` results after the existing post-step evaluation/readiness logic.
3. Update controlled-loop result copy to use the handoff for plain-language summaries.
4. Add focused unit tests for ready, readiness-warning, evaluation-refresh-failed, and no-bypass behavior.
5. Run targeted verification first, then ECL/typecheck/lint as required by touched boundaries.
6. Perform real UI validation if rendered Workbench/browser behavior is changed; otherwise record backend projection/result validation as the applicable scope.

## Decisions

- Stop reason values are derived presentation categories, not scheduler runtime states.
- The handoff must use "next confirmation candidate" / "readiness evidence" semantics rather than "ready to execute" semantics.
- No new Workbench confirmation item is added in this change.
- No broad test-architecture or Workbench component refactor is included.

## Module Boundary Plan

- Owner module: Workbench controlled scheduler action/result surface.
- New / moved responsibilities: a derived post-step handoff helper owned by the Workbench action/user-surface boundary; no scheduler-runtime ownership transfer.
- Facade touch points: `src/workbench/actions/handlers/scheduler.ts` may attach the DTO; `src/workbench/user-surface/controlled-loop-results.ts` may summarize it.
- Forbidden write-back locations: `src/workbench/chat.ts`, broad Workbench/server/frontend facades, scheduler runtime repositories, Goal Loop repositories, and canonical docs outside this active change unless required for handoff/status.
- Compatibility surface: existing action ids, result fields, ToolPolicy/stale revalidation, concrete handlers, and confirmation queue payloads remain compatible.
- Boundary tests: controlled scheduler post-step unit tests and Workbench action result summary tests.
- Follow-up split candidates: none.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: controlled scheduler wrappers, post-step Goal Loop evaluation, controller policy, gate-readiness preflight, Workbench result copy, scoped action revalidation, and existing user-facing scheduler copy.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new cross-cutting mechanism is proposed; this is a derived DTO over existing mechanisms.
- Domain-specific logic location: controlled scheduler action handler/helper and controlled-loop result copy.
- Shared cross-cutting logic location: no new shared cross-cutting owner; reuse current Goal Loop and Workbench action/result owners.
- Local framework / state machine / projection / validation / gate avoided: no new scheduler state machine, no new gate, no new projection source of truth, no persisted readiness store.
- Future-cost reduction for similar features: future controlled actions can summarize stop/next-step posture from one reusable handoff shape instead of ad hoc warning strings.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

- Need inspect whether `postStepHandoff` belongs in a new helper file or in `controlled-loop-results.ts`; prefer a small helper if it avoids adding more logic to `scheduler.ts`.
- Need decide whether current result summaries are enough UI coverage or whether a real Workbench/browser pass is needed after code changes.
