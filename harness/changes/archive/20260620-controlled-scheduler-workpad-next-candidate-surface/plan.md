# Plan: controlled-scheduler-workpad-next-candidate-surface

## Approach

Add a small optional `controlledSchedulerNextCandidate` DTO to `WorkbenchGoalLoopSummary`. Build it from the already validated latest Goal Loop read-model context: fresh packet, existing summary/action scope, and valid controller/preflight evidence when present. Keep all user-facing status copy in the read-model/user-surface owner and let React render the DTO without computing Scheduler semantics.

## Steps

1. Add the optional DTO type to Workbench and web types.
2. Add a read-model helper that derives the controlled Scheduler next-candidate state from the validated `WorkbenchGoalLoopSummary` fields and existing Scheduler user-facing labels.
3. Render the DTO in `GoalLoopEvidenceCard` as read-only evidence.
4. Extend projection tests for ready and needs-review states, including stale/missing readiness evidence behavior.
5. Extend the real React DOM Workpad test to verify visible copy, no raw action ids/internal terms, and no button in the card.
6. Run targeted product checks, Harness checks, close-ready review, and update handoff/status before close.

## Decisions

- Use the Workbench Goal Loop read model as the owner for persisted Workpad truth.
- Do not use transient `postStepHandoff` for Workpad state.
- Do not add a new action surface; the right confirmation queue remains the execution entry.
- The subagent plan review passed with must-fix constraints: source the DTO from fresh landed evidence, keep React rule-free, add a compact DTO, and perform real UI validation.

## Module Boundary Plan

- Owner module: `src/workbench/projections/read-model/goal-loop.ts` or adjacent read-model helper, reusing Scheduler user-facing labels from `src/workbench/projections/read-model/confirmation/scheduler-user-surface.ts`.
- New / moved responsibilities: add one optional derived Workpad Goal Loop UI DTO.
- Facade touch points: `src/web/src/types.ts` receives the optional payload shape only.
- Forbidden write-back locations: no action handlers, routers, runtime stores, ToolPolicy, scheduler executor, apply/close/evolution paths, or React-side readiness calculation.
- Compatibility surface: optional field on existing Workbench payload.
- Boundary tests: projection and React DOM tests cover the changed surface.
- Follow-up split candidates: none.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: Goal Loop lineage/freshness validation, controller/preflight lineage checks, `filterGoalLoopSummaryForCurrentGate`, and Scheduler user-facing action labels.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new cross-cutting mechanism is proposed; this is a small DTO over existing evidence.
- Domain-specific logic location: controlled Scheduler next-candidate copy/state in read-model/user-surface code.
- Shared cross-cutting logic location: existing Goal Loop and Scheduler label helpers.
- Local framework / state machine / projection / validation / gate avoided: no local React state machine, no new gate system, no transient result truth.
- Future-cost reduction for similar features: future Workpad status surfaces can attach small read-model DTOs instead of adding ad hoc frontend parsing.

## Planning-Discovered Gaps

- Current `GoalLoopCards.tsx` has legacy label fallback logic. This change will not broaden that pattern; a later UI copy-owner convergence can handle it if needed.
