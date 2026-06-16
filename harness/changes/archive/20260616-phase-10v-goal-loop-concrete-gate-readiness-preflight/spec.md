# Spec: Phase 10V Goal Loop Concrete Gate Readiness Preflight

## Goal

Add a Goal Loop owned readiness/preflight artifact that proves the main-Agent Goal Loop recommendation is still aligned with the current visible concrete Harness gate before any later phase attempts a controlled gate invocation.

The preflight is evidence only. It prepares an auditable handoff from Goal Loop context to the existing concrete Workbench confirmation surface, but the concrete action still requires its own stale revalidation, ToolPolicyGate, and human confirmation.

## Users

- AHO users reviewing the main Agent's recommended next safe gate.
- The main Agent, which needs durable evidence that its Goal Loop recommendation still matches the right-side concrete Harness gate.
- Future scheduler/Goal Loop phases that need an auditable, scoped readiness bridge without inheriting execution authority.

## Acceptance Criteria

- AC-001: Docs accurately record Phase 10U archived and Phase 10V active, with no stale Phase 10U active/current claim.
- AC-002: `src/goal-loop/` owns a new non-executing concrete gate readiness/preflight artifact with schema, repository, renderer, and compiler.
- AC-003: Workbench action `planning.goal-loop.gate-readiness.prepare` exists and is live, high-impact, stale-revalidated, and scoped.
- AC-004: The action requires `changeId`, `goalLoopNextStepPacketId`, `goalLoopControllerPolicyId`, `goalLoopCurrentGateActionType`, and the concrete gate target ids.
- AC-005: The compiler re-reads selected Change, latest packet, latest controller policy, packet freshness, and current gate evidence; stale, forged, cross-change, superseded, mismatched, recursive Goal Loop, missing-target, or non-visible gate inputs fail closed.
- AC-006: The artifact records `executionStarted: false`, `concreteGateInvoked: false`, and that the concrete gate still needs independent stale revalidation, ToolPolicyGate, and human confirmation.
- AC-007: The action does not call the concrete gate handler, does not run ToolPolicyGate for the concrete gate, does not mutate source, and does not create worker/run/worktree/TaskRun/IntegrationCheck artifacts.
- AC-008: The preflight action appears only as a secondary affordance attached to the matching concrete confirmation gate; it does not replace the primary action, does not create a fallback primary, and does not change `workpad.nextAction`.
- AC-009: Action payload, decision/audit scope, target id extraction, and strict scope matching preserve packet, policy, current gate action type, concrete gate scope, and generated preflight id.
- AC-010: New Goal Loop modules do not import Workbench, server, web UI, CLI command modules, or broad facades; Workbench/server/frontend changes remain thin glue.
- AC-011: Full product and Harness verification pass, or any pre-existing failure is explicitly recorded.

## Non-Goals

- No concrete gate invocation or execution.
- No scheduler loop, whole-wave dispatch, slot allocator, child Change, automatic apply/merge, close/archive, or parallel executor.
- No CLI API, independent HTTP route, new primary user action, or public artifact shape change outside the new Goal Loop preflight artifact.
- No replacement for Change/ECL, Run, Validation, Audit, IntegrationCheck, Apply/Close gates, ToolPolicyGate, or human gate.

## Constraints

- The preflight must be evidence, not authority.
- The concrete gate's own required-target rules must be dynamically validated; packet scope alone is not enough.
- The prepare action may be high-impact for audit purposes, but that audit is for the prepare action itself, not authorization for the concrete gate.
- `README.md` remains unrelated and untracked.

## Risks

- Naming risk: "invocation" can imply execution. The implementation and docs use readiness/preflight naming instead.
- Scope drift risk: packet, controller policy, and current gate can diverge. The action must re-read and strict-match all three.
- Recursive action risk: a Goal Loop preflight must never prepare a `planning.goal-loop.*` action as its target.
- Facade creep risk: handler/server/projection code must remain glue, with main logic in `src/goal-loop/`.
