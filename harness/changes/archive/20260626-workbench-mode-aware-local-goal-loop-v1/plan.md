# Plan: workbench-mode-aware-local-goal-loop-v1

## Approach

Add a small mode-aware local loop coordinator under the existing
`goal-loop-runtime` owner. The coordinator classifies the current primary gate
from a fresh Workbench snapshot and returns one of: wait for human confirmation,
run scoped automation, run controlled scheduler continuation, completed, or
blocked. It delegates execution to existing mechanisms and never directly
executes raw actions.

## Steps

1. Add local loop types/repository support only if the existing runtime
   artifacts cannot express the coordinator result.
2. Implement the coordinator as a thin policy layer over current Workbench
   snapshot and existing automation services.
3. Wire post-plan full-access startup through the coordinator instead of
   treating scoped automation as the entire loop.
4. Keep request-approval mode projection-only: it verifies the next gate and
   leaves it visible for the user.
5. Update DecisionPanels copy/selector behavior so both modes are post-plan
   execution choices and plan confirmation remains manual.
6. Add targeted tests for both modes, fail-closed boundaries, and UI wording.
7. Run required verification and E-drive real UI acceptance if feasible.

## Decisions

- The loop is a control strategy, not an authority source.
- Permission mode affects only the act phase.
- Existing confirmation queue remains the executable primary surface.
- Existing scoped automation remains the executor for allowed full-access local
  gates.

## Minimality Gate Plan

- Can this be a no-op: no; current implementation has scoped automation, but no
  shared loop semantics for request-approval and full-access modes.
- Reuse: `automation-runtime`, `goal-loop-runtime`, Workbench
  `confirmationQueue.primary`, current-gate revalidation, and controlled
  scheduler continuation.
- Shared root fix: align the loop at coordinator/decision level instead of
  patching individual UI cards.
- Avoided: second permission system, workflow engine, scheduler executor,
  projection framework, and evidence-only layer.
- Smallest coherent change: thin coordinator plus UI/test updates.

## Module Boundary Plan

- Owner module: `src/goal-loop-runtime/` for loop coordination.
- New / moved responsibilities: classify current gate by mode and delegate to
  existing execution owners.
- Facade touch points: Workbench action handler may call the coordinator, but
  should stay thin.
- Forbidden write-back locations: do not add main loop logic to broad
  Workbench manager/read-model facades or frontend components.
- Compatibility surface: existing action payloads and confirmation queue shape
  remain compatible.
- Boundary tests: goal-loop runtime, automation runtime, action revalidation,
  read-model, and DOM coverage.
- Follow-up split candidates: none.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: scoped automation, controlled
  scheduler continuation, current-gate revalidation, source/accepted-artifact
  safety checks, and Workbench confirmation projection.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no
  new cross-cutting mechanism is proposed; only a coordinator is needed.
- Domain-specific logic location: mode-aware loop decision stays in
  `goal-loop-runtime`.
- Shared cross-cutting logic location: action/gate validation stays in existing
  current-gate revalidation and workflow action registry owners.
- Local framework / state machine / projection / validation / gate avoided:
  second workflow engine, second projection system, second permission system.
- Future-cost reduction for similar features: future loop expansion can add
  strategies to the coordinator while preserving existing gate ownership.

## Planning-Discovered Gaps

No unresolved gap. Real UI acceptance may reveal a product blocker; if so, fix
the smallest existing owner path instead of widening the coordinator.
