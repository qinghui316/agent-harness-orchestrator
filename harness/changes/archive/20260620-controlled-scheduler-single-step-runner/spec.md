# Spec: controlled-scheduler-single-step-runner

## Goal

Add a controlled Scheduler single-step runner that lets the user confirm one Goal Loop-matched scheduler step and execute exactly that existing concrete scheduler gate. This is the first product implementation toward the controlled Scheduler loop direction, but it is not a full loop, executor, start-all control, slot allocator, source apply path, close path, remote landing path, child Change creator, or Harness evolution automation.

The feature must reduce Workbench friction without weakening AHO workflow truth: the wrapper action requires fresh Goal Loop packet/controller/preflight evidence, strict concrete scheduler target ids, ToolPolicyGate, stale-target revalidation, and human confirmation before delegating to the existing scheduler gate handler.

## Users

- A main Agent or user working inside Workbench on a demand conversation with Goal Loop guidance for the current scheduler gate.
- Reviewers checking that controlled scheduler progress still obeys Change/ECL, accepted artifacts, SchedulerRun evidence, Validation/Audit/IntegrationCheck, ToolPolicyGate, and human gates.

## Acceptance Criteria

- AC-001: A new live workflow action `planning.scheduler.controlled-step.run` is registered as high-impact and revalidated, and requires `changeId`, `goalLoopNextStepPacketId`, `goalLoopControllerPolicyId`, `goalLoopGateReadinessPreflightId`, `goalLoopCurrentGateActionType`, plus the target ids required by the selected concrete scheduler gate.
- AC-002: The controlled-step guard accepts only one current `planning.scheduler.*` gate backed by fresh matching Goal Loop packet/controller/preflight evidence, rejects recursive Goal Loop actions, rejects the wrapper itself, rejects non-scheduler actions, and rejects stale or mismatched target scope.
- AC-003: A confirmed controlled-step action revalidates and ToolPolicy-audits the wrapper, then revalidates and ToolPolicy-audits the reconstructed concrete scheduler action, delegates to exactly one existing scheduler handler, and returns a wrapper result containing the nested action type/result.
- AC-004: The wrapper never runs more than one scheduler transition per confirmation and never starts a loop, whole-wave dispatch, slot allocator, source apply/discard, close/archive, remote landing, child Change, or Harness evolution.
- AC-005: Workbench confirmation projection shows the controlled-step affordance only when exactly one matching Goal Loop-assisted scheduler gate is current. When shown, it replaces the duplicate executable primary scheduler action instead of adding a second primary execution button.
- AC-006: Scheduler execution-mode authority stays conservative: loop/full-executor/whole-wave/slot authorization booleans remain false, and any controlled-step wording is non-authorizing.
- AC-007: Targeted unit and slow Workbench scheduler coverage proves registry/scope behavior, stale/mismatch rejection, projection availability without duplicate execution affordance, and one confirmed controlled-step executing one existing scheduler transition while leaving the next gate pending.

## Non-Goals

- No full controlled scheduler loop runtime.
- No automatic multi-step continuation after the nested scheduler action returns.
- No whole-wave dispatch, slot allocation, start-all control, child Change creation, source apply/discard, close/archive, remote landing, merge, or Harness evolution automation.
- No new persistent workflow-truth artifact family. Existing scheduler artifacts, ToolPolicy audit entries, Workbench decisions, and action results remain the evidence surface.
- No broad documentation rewrite or maintenance/self-evolution behavior change.

## Constraints

- Workflow truth remains Change/ECL, accepted Spec/Plan/Tasks/AC, SchedulerRun/runtime evidence, Run, Validation, Audit, IntegrationCheck, ToolPolicyGate, and human gates.
- Reference projects are design evidence only; no runtime copying.
- Reuse the existing Goal Loop gate proof path (`goal-loop-gate-confirmation`) instead of inventing a parallel lineage/freshness validator.
- Keep main logic in owned modules. Workbench server/frontend/projection code may only route, display, or dispatch scoped actions.
- Preserve existing public action behavior for individual scheduler gates when controlled-step evidence is unavailable.

## Risks

- Risk: The wrapper could accidentally become a hidden loop. Mitigation: hard-code one nested scheduler dispatch per confirmed action and reject wrapper/Goal Loop recursive targets.
- Risk: Scope validation could diverge from existing Goal Loop assisted gate validation. Mitigation: reuse/extend the existing assisted concrete gate assertion path.
- Risk: Workbench could show duplicate primary execution affordances. Mitigation: projection tests must prove controlled-step replaces the executable primary scheduler action when available.
- Risk: Action registry/scope churn could break existing scheduler gates. Mitigation: targeted registry tests plus slow scheduler flow coverage.
