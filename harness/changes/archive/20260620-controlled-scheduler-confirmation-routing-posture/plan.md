# Plan: controlled-scheduler-confirmation-routing-posture

## Approach

Extend the existing controlled Scheduler next-candidate projection with optional, already-sanitized routing posture copy. The projection owner will translate existing `WorkbenchGoalLoopSummary` conflict/routing and scheduler execution-mode fields into user-facing strings. The right confirmation card will render those strings without inspecting scheduler policy or raw evidence.

## Steps

1. Add optional routing posture fields to `WorkbenchControlledSchedulerNextCandidate` and the web DTO type.
2. Extend `buildControlledSchedulerNextCandidate()` so it derives user-facing posture copy from `conflictLevel`, `parallelEligible`, `routingLabel`, `routingPosture`, `conflictReasons`, and `schedulerExecutionMode`.
3. Keep `attachControlledSchedulerAdvanceActions()` gating unchanged so the right card only receives the detail when current ready evidence matches the current gate.
4. Render the optional posture copy in `DecisionPanels.tsx` as passive explanation only.
5. Add read-model/goal-loop tests for the derived copy and stale/needs-review absence.
6. Add real App DOM coverage for the right confirmation card: posture visible, one controlled advance action, no raw ids or fake future-capability text.
7. Run targeted product verification, broad fast checks, build, Harness lint/status/evolve checks, independent close-ready review, then close/git if clean.

## Decisions

- The read-model owner, not the frontend, owns user-facing scheduler posture derivation.
- The new fields are optional user-facing copy. Raw posture/action/evidence ids remain available only as evidence refs or internal DTO fields that are not directly displayed as this detail.
- The change does not touch action handlers, workflow action registry, stale revalidation, ToolPolicyGate, or scheduler runtime owners unless implementation discovers a concrete compile/test issue.

## Module Boundary Plan

- Owner module: `src/workbench/projections/read-model/goal-loop-next-candidate.ts` owns controlled Scheduler next-candidate projection copy.
- New / moved responsibilities: add sanitized routing posture copy to the existing candidate projection.
- Facade touch points: frontend DTO types and `DecisionPanels.tsx` render the optional copy only.
- Forbidden write-back locations: no scheduler policy in `DecisionPanels.tsx`, `App.tsx`, bridge/server glue, manager facades, or Workbench chat facade.
- Compatibility surface: existing confirmation item actions, payload ids, evidence refs, and Workbench JSON remain backwards-compatible through optional fields.
- Boundary tests: targeted read-model/goal-loop tests plus real App DOM test.
- Follow-up split candidates: none.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: Goal Loop conflict routing, Scheduler execution-mode assessment, WorkbenchGoalLoopSummary, controlled Scheduler next-candidate projection, confirmation queue, and existing React decision card.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new mechanism is proposed.
- Domain-specific logic location: user-facing scheduler posture wording belongs with the existing controlled Scheduler next-candidate projection.
- Shared cross-cutting logic location: no new cross-cutting logic; reuse existing projection and action-gate evidence.
- Local framework / state machine / projection / validation / gate avoided: avoids a new frontend scheduler posture calculator, local gate, local state machine, or new action source.
- Future-cost reduction for similar features: future right-card explanations can extend the same read-model-derived detail pattern instead of embedding policy in UI components.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

- Plan self-review subagent `019ee536-d4f4-7701-8925-6907866b53e3` passed with corrections: only render sanitized user-facing copy, keep existing ready/fresh gate, assert visible text leakage rather than evidence ref paths, and record Goal Loop / Workbench honesty / scoped payload / projection / module / core reuse coverage in review.

