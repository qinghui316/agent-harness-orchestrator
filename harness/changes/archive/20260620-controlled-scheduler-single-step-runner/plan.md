# Plan: controlled-scheduler-single-step-runner

## Approach

Implement a generic wrapper over existing scheduler gates, not a new scheduler state machine. The wrapper action carries the same flat scope fields as the concrete scheduler action plus Goal Loop packet/controller/preflight ids. An owned controlled-step module reconstructs the concrete scheduler request, proves it matches fresh Goal Loop-assisted gate evidence, and rejects unsafe targets. The Workbench action handler then dispatches exactly one existing scheduler handler after the wrapper itself has passed normal server confirmation, stale-target revalidation, and ToolPolicyGate.

## Steps

1. Add workflow action registry/type support for `planning.scheduler.controlled-step.run`.
2. Add controlled-step guard/conversion logic that reuses existing Goal Loop assisted concrete gate validation and returns a concrete scheduler request.
3. Add a thin scheduler handler for the wrapper that validates the reconstructed concrete request, runs ToolPolicy/stale revalidation for the nested concrete action, delegates once to the existing scheduler handler map, and returns a bounded result envelope.
4. Update Workbench confirmation projection/copy so the controlled-step affordance appears only for one fresh Goal Loop-assisted scheduler gate and replaces duplicate executable primary scheduler action.
5. Add targeted unit tests and one slow scheduler flow proving one confirmed controlled-step executes one scheduler transition and stops.
6. Update ECL review/handoff and run targeted plus aggregate verification appropriate for Workbench action dispatch.

## Decisions

- The wrapper requires Goal Loop evidence. It does not run as a generic "current scheduler action" shortcut.
- The nested concrete action is represented with existing flat scope fields and `goalLoopCurrentGateActionType`; no nested action object or new local action protocol is introduced.
- Execution-mode booleans remain false. Controlled-step availability is product affordance, not loop authority.
- No new durable artifact family is created for this phase.

## Module Boundary Plan

- Owner module: `src/workflow-scheduler/controlled-step.ts` owns controlled-step request conversion and scheduler target allowlist.
- New / moved responsibilities: controlled-step scope reconstruction and recursive/non-scheduler rejection move into the owner module; Goal Loop freshness/lineage remains in existing Goal Loop validation.
- Facade touch points: `src/workbench/actions/handlers/scheduler.ts` wires a thin handler; Workbench projection displays scoped action only.
- Forbidden write-back locations: Workbench server/frontend/projection aggregators, manager facades, and Goal Loop evidence writers must not own the execution logic.
- Compatibility surface: existing scheduler actions remain unchanged and available when no fresh controlled-step evidence exists.
- Boundary tests: workflow action registry/scope tests, Workbench module/projection tests, and slow scheduler flow coverage.
- Follow-up split candidates: none.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: workflow action registry/scope validation, server `confirm: true`, action revalidation, ToolPolicyGate, `assertGoalLoopAssistedConcreteGateConfirmation`, scheduler handler ownership, and Workbench confirmation projection.
- Why existing mechanisms are insufficient if a new mechanism is proposed: a small controlled-step owner is needed to bridge wrapper scope to one existing concrete scheduler request without adding nested-action protocol or duplicating Goal Loop validation.
- Domain-specific logic location: scheduler action allowlist and concrete request reconstruction live in `src/workflow-scheduler/controlled-step.ts`.
- Shared cross-cutting logic location: Goal Loop gate proof remains in `src/workbench/actions/goal-loop-gate-confirmation.ts`; ToolPolicy/revalidation remain in existing Workbench action boundaries.
- Local framework / state machine / projection / validation / gate avoided: no new scheduler loop state machine, artifact family, ToolPolicy path, or private freshness validator.
- Future-cost reduction for similar features: establishes a reusable pattern for controlled one-step progression that can later be extended to a real controlled loop without bypassing existing gates.

## Planning-Discovered Gaps

- Pre-ECL subagent review required the wrapper to require Goal Loop evidence, avoid duplicate primary execution buttons, and reuse the existing Goal Loop-assisted concrete gate proof path.
