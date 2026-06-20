# Plan: controlled-scheduler-confirmation-evidence-surface

## Approach

Reuse existing confirmation queue `evidenceRefs` instead of adding a new protocol. In the Goal Loop confirmation projection, when controlled Scheduler reconfirmation is already proven refreshed and the Workpad next-candidate DTO says `ready-for-confirmation`, merge the DTO evidence refs into the confirmation item. In the frontend decision panel, extend `DecisionContext` with read-only `evidenceRefs` and render them with existing artifact filename formatting.

## Steps

1. Extend Workbench/web `DecisionContext` DTOs with optional `evidenceRefs`.
2. Update `attachControlledSchedulerAdvanceActions` to merge ready next-candidate refs into refreshed controlled Scheduler confirmation items.
3. Render `DecisionContext.evidenceRefs` in `DecisionPanels.tsx` as read-only evidence links.
4. Add projection tests for ready refs, needs-review suppression, and non-refreshed suppression.
5. Add real App DOM coverage for right confirmation card evidence links and unchanged single action.
6. Run targeted verification, product checks, Harness checks, implementation-after review, handoff, close, and git.

## Decisions

- Use `workpad.goalLoop.controlledSchedulerNextCandidate.evidenceRefs` as the source. It is already derived from fresh Goal Loop/controller/preflight evidence.
- Do not read or parse `postStepHandoff`.
- Use existing `ConfirmationQueueItem.evidenceRefs` and `artifactName`; no new evidence UI protocol.
- Plan review subagent passed with two constraints: require `ready-for-confirmation`, and keep React as read-only renderer.

## Module Boundary Plan

- Owner module: `src/workbench/projections/read-model/confirmation/goal-loop.ts` for confirmation queue evidence merging.
- Frontend owner: `src/web/src/panels/workbench/DecisionPanels.tsx` for generic evidence ref rendering.
- New / moved responsibilities: none; this fills existing `evidenceRefs` projection/rendering.
- Facade touch points: `src/workbench/read-model-types.ts` and `src/web/src/types.ts` DTO additions only.
- Forbidden write-back locations: no action handlers, scheduler runtime, ToolPolicy, server routes, source apply/close/merge/evolution paths, or frontend readiness decisions.
- Compatibility surface: optional field on `DecisionContext`; existing confirmation item shape remains compatible.
- Boundary tests: projection unit test and real App DOM test.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: Workpad Goal Loop next-candidate DTO, confirmation queue `evidenceRefs`, scheduler gate refreshed-evidence matching, `artifactName` display, and DecisionContext rendering.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new mechanism is proposed.
- Domain-specific logic location: Goal Loop confirmation projection only.
- Shared cross-cutting logic location: existing confirmation queue evidence refs and frontend artifact display.
- Local framework / state machine / projection / validation / gate avoided: no new readiness state, no frontend Scheduler gate logic, no duplicate evidence protocol.
- Future-cost reduction for similar features: confirmation cards can now display existing evidence refs consistently.

## Planning-Discovered Gaps

- `DecisionContext` currently carries only one `artifact`; it needs a read-only evidence refs array to render existing confirmation queue evidence without losing compatibility.
