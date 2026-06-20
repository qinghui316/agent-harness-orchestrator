# Plan: controlled-scheduler-loop-tick-runtime-boundary

## Approach

Implement one coherent product slice: make the existing controlled Scheduler advance produce an owner-owned controlled loop tick contract summary.

The implementation will not add a new artifact family. It will extend `SchedulerControlledStepEvidence` because that artifact already represents the real completed human-confirmed scheduler step and already carries pre/post Goal Loop evidence, result summary, route summary, and forbidden authority. The new tick summary will make the lifecycle explicit:

- observe: fresh Goal Loop decision/iteration/brief/packet and submitted gate scope;
- choose/check: fresh controller policy and gate-readiness preflight ids;
- dispatch: the one concrete scheduler action that was executed through `controlled-step.run`;
- reconcile: post-step Goal Loop evaluation/readiness or warnings;
- route/stop: post-step handoff, route posture, stop reason, and next human gate requirement.

Owner extraction is part of the product work. New phase/authority summary construction belongs in `src/scheduler-runtime/`; request/scope contract helpers stay in `src/workflow-scheduler/`; Workbench action handler changes should be limited to calling these helpers and returning the recorded summary.

## Steps

1. Extend scheduler runtime types/schemas/rendering for a `controlledLoopTick` summary on `SchedulerControlledStepEvidence`.
2. Add scheduler-runtime helper(s) that build the tick summary from existing pre-step evidence, post-step evidence, post-step handoff, result summary, route summary, target scope, and forbidden authority.
3. Strengthen workflow-scheduler controlled advance helpers if needed so the Workbench handler can reuse scope/contract helpers rather than duplicating local matching logic.
4. Update controlled advance recording to call owner helpers and include the tick summary in the returned evidence summary.
5. Update Workbench projection/web types/Workpad card to display the tick summary as read-only evidence and keep forbidden future-capability copy visible.
6. Add or update targeted tests for controlled advance, scheduler controlled-step evidence/schema/render/projection, and real App DOM no-fake-loop surface.
7. Run selected product and Harness verification, then update review/handoff and close only if close-ready.

## Decisions

- Extend existing `SchedulerControlledStepEvidence` instead of creating `SchedulerControlledLoopTick` artifacts. This avoids another artifact family and keeps the tick bound to the real stopped scheduler step.
- Keep `planning.scheduler.controlled-advance.run` as the existing user-facing confirmation entry. No new Workbench action or user surface is needed.
- Record phase names as a contract summary, not as an executable state machine. The route posture continues to reuse existing Goal Loop / Scheduler loop posture vocabulary.
- Treat result and route summaries as derived, not authority. The actual authority remains with the underlying scheduler concrete action and existing human/ToolPolicy gates.

## Module Boundary Plan

- Owner module: `src/scheduler-runtime/` owns controlled loop tick summary construction, forbidden authority, schema/rendering, runtime event payload, and artifact projection data. `src/workflow-scheduler/` owns controlled-step / controlled-advance request contracts and legal concrete scheduler action checks.
- New / moved responsibilities: controlled loop tick phase summary and no-authority contract move into scheduler-runtime helpers; Workbench handler keeps dispatch glue.
- Facade touch points: `src/workbench/actions/handlers/scheduler.ts` will call existing/new owner helpers and return evidence refs; `src/workbench/workflow-projection.ts` and frontend types/cards will only project/read.
- Forbidden write-back locations: do not add new main logic to `src/workbench/chat.ts`, `src/workbench/manager.ts`, `src/server/workbench-server.ts`, `src/web/src/App.tsx`, broad manager facades, or frontend shell files.
- Compatibility surface: existing action ids, payloads, route shapes, confirmation queue behavior, and controlled-step evidence read paths remain compatible except for additive optional summary fields.
- Boundary tests: controlled advance handler tests must show one concrete handler call and owner evidence input; scheduler-runtime tests must prove summary/schema/render/event behavior; App DOM tests must prove read-only surface and no fake loop/parallel affordance.
- Follow-up split candidates: none.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: `GoalLoopDecision`, `GoalLoopNextStepPacket`, controller policy, gate-readiness preflight, `planning.scheduler.controlled-step.run`, scheduler-runtime repository/events, controlled-step result summary, controlled-loop route summary, Workbench projection/read-only card.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new artifact mechanism is proposed. Existing controlled-step evidence lacks a single explicit tick contract summary, so it will be additively strengthened.
- Domain-specific logic location: Scheduler controlled loop tick phase labels and stop posture stay in scheduler-runtime domain code.
- Shared cross-cutting logic location: legal action/scope checks stay in workflow action / workflow-scheduler helpers; no-authority flags stay in scheduler-runtime controlled-step evidence owner.
- Local framework / state machine / projection / validation / gate avoided: no feature-local scheduler loop state machine, local safety gate, parallel executor, Workbench-local projection system, or duplicate ToolPolicy bypass.
- Future-cost reduction for similar features: later controlled loop runtime work can consume one tick summary and owner helper instead of parsing Workbench handler return shapes or re-deriving phase semantics from several artifacts.

## Planning-Discovered Gaps

- Subagent plan review returned `REVISE`, not `PASS`, until the plan clarified owner extraction and avoided an evidence-only layer. This plan incorporates that revision.
- Implementation must decide the final field name. Preferred: `controlledLoopTick`, because it describes a contract summary, not execution authority.
- If code inspection shows the existing controlled-step evidence cannot hold the tick summary cleanly, stop and revise the plan before creating a separate artifact family.
