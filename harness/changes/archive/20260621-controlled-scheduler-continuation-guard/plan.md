# Plan: Controlled Scheduler Continuation Guard

## Approach

Add a small pre-execution guard to the existing controlled Scheduler advance path. The handler will resolve the submitted concrete scheduler gate, read the latest relevant controlled-step evidence, and call a pure controlled-step guard before any fresh Goal Loop evaluation or concrete scheduler transition occurs.

The guard will use two owner layers:

- `src/scheduler-runtime/` remains the owner for reading/writing controlled-step evidence.
- `src/workflow-scheduler/controlled-step.ts` remains the owner for wrapper/concrete scheduler request validation and workflow-action scope matching.

The implementation should not introduce a new artifact family. It should consume existing `SchedulerControlledStepEvidence`, `controlledLoopContinuationReadiness`, and post-step preflight ids. If prior evidence exists, expected next-gate scope comes from the recorded post-step `GoalLoopGateReadinessPreflight.currentGate`, then existing required-target validation and strict scope matching decide whether the submitted concrete gate is still legal.

## Steps

1. Inspect Goal Loop gate-readiness preflight repository/type exports and choose the smallest existing reader needed to load the prior preflight by id.
2. Add controlled continuation guard logic without making scheduler-runtime depend on workflow-action registry:
   - runtime repository/listing supplies prior controlled-step evidence;
   - controlled-step guard validates the request against prior readiness and preflight currentGate scope.
3. Wire the guard into `planning.scheduler.controlled-advance.run` immediately after `requestedConcreteGate` is built and before `evaluateGoalLoopDecision`.
4. Add targeted tests:
   - guard unit tests for bootstrap, ready match, warning/missing/readiness-status failures, action mismatch, missing target, target mismatch, and scope transition;
   - handler test proving guard failure stops before Goal Loop evaluation and concrete scheduler execution;
   - handler/pass test preserving existing request shape without readiness ids.
5. Run targeted tests, product checks, Harness checks, independent close-ready review, handoff update, close, and git.

## Decisions

- Bootstrap means no prior controlled-step evidence exists in the relevant Change/SchedulerRun lineage. It does not mean prior evidence exists but lacks readiness.
- Prior evidence with `recorded-with-warning`, `postStepEvidence.evaluationWarning`, `postStepEvidence.readinessWarning`, missing readiness, or non-`ready-for-human-gate` readiness fails closed.
- Expected next-gate authority comes from the prior post-step `GoalLoopGateReadinessPreflight.currentGate`, not from the `controlled-advance` wrapper and not from the readiness summary alone.
- The controlled-advance request shape remains unchanged; readiness ids are not required in the request payload.
- Terminal/non-scheduler follow-up gates are outside this guard because this guard only wraps concrete `planning.scheduler.*` transitions.

## Module Boundary Plan

- Owner module: `src/workflow-scheduler/controlled-step.ts` for request/scope guard; `src/scheduler-runtime/repository.ts` or a small runtime helper for evidence lookup only.
- New / moved responsibilities: add a reusable controlled Scheduler continuation guard helper and, if needed, a latest-evidence lookup helper.
- Facade touch points: `src/workbench/actions/handlers/scheduler.ts` only wires the guard into the existing action handler.
- Forbidden write-back locations: no main logic in Workbench read model, frontend panels, server route shells, manager facades, or broad type barrels.
- Compatibility surface: existing action ids, request payloads, Workbench JSON, right confirmation behavior, and scheduler artifacts remain compatible.
- Boundary tests: controlled-step contract tests and handler tests cover the new module boundary.
- Follow-up split candidates: none expected; if preflight reading requires a broader owner split, record it instead of refactoring Goal Loop broadly in this change.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: `SchedulerControlledStepEvidence`, `controlledLoopContinuationReadiness`, Goal Loop `GateReadinessPreflight`, `validateWorkflowActionRequiredTargets`, `workflowActionScopesMatchStrict`, existing scheduler action handlers, ToolPolicy/human gate flow.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new cross-cutting mechanism is proposed; this adds a narrow composition guard over existing mechanisms.
- Domain-specific logic location: controlled Scheduler wrapper/concrete gate semantics stay in `workflow-scheduler/controlled-step.ts`.
- Shared cross-cutting logic location: required target and strict scope matching stay in `workflow-actions/registry.ts`; evidence read/write stays in scheduler-runtime and Goal Loop repositories.
- Local framework / state machine / projection / validation / gate avoided: no feature-local action registry, preflight framework, projection system, or alternate ToolPolicy gate.
- Future-cost reduction for similar features: future controlled-loop steps can reuse the same prior-step continuation guard instead of each handler inventing stale-target checks.

## Plan Review Evidence

- Subagent `019ee69c-f76e-7a03-a67c-c3f81ef00ccf`: FAIL until bootstrap is defined narrowly, bad prior evidence fails closed, expected scope comes from post-step preflight currentGate, and scope transition is handled.
- Subagent `019ee69d-5195-7981-9a5d-0d8f1c7e6c37`: recommended keeping workflow-action scope validation in `src/workflow-scheduler/controlled-step.ts` rather than importing workflow-action registry into scheduler-runtime.
- Subagent `019ee69d-8328-73e1-bd68-186c1fc7ceb0`: warned not to compare readiness against the wrapper action and not to require readiness ids in controlled-advance requests.
- Plan correction: the implementation will require prior evidence only after a prior controlled step exists, compare against concrete gate/preflight scope, keep request shape unchanged, and place scope validation in workflow-scheduler owner.

## Planning-Discovered Gaps

- Need to confirm the smallest existing reader for `GoalLoopGateReadinessPreflight` by id before implementation.
