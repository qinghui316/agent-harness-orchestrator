# Spec: Phase 10D Goal Loop Confirmation Surface

## Goal

Expose the main Agent's non-executing Goal Loop evaluation as a simple Workbench confirmation fallback. Users should see a plain `评估目标循环` stage gate when there is no more specific current confirmation to act on. The action records `GoalLoopDecision` evidence and conversation context only.

## Users

- Primary: a developer using AHO Workbench to drive a long-running Change/Goal without understanding internal scheduler evidence details.
- Secondary: future agents that need durable evidence explaining why the main Agent recommended waiting, planning, scheduler preparation, worker start, IntegrationCheck handoff, or a human gate.

## Acceptance Criteria

- AC-001: Workbench confirmation queue can show `planning.goal-loop.evaluate` for the selected active Change when there is no more specific current confirmation item.
- AC-002: Goal Loop evaluation is a fallback; it does not override planning confirmation, scheduler worker/current-stage confirmations, IntegrationCheck/apply confirmations, landing/PR/remote confirmations, or decision-inspector actions.
- AC-003: The confirmation item carries selected `changeId`, uses the existing `planning.goal-loop.evaluate` action, and preserves required target validation / stale-target revalidation / decision-audit scope.
- AC-004: Executing the action only writes GoalLoopDecision/thread/Workbench decision evidence; it does not execute `recommendedAction` or create runtime/source mutation artifacts.
- AC-005: Goal Loop confirmation surface logic lives in owned read-model confirmation modules, not in Workbench chat, server route, frontend shell, or scheduler runtime facades.
- AC-006: `src/goal-loop/*` remains non-executing and independent from Workbench/server/web/CLI/broad facades.
- AC-007: Docs record Phase 10C closed, Phase 10D active, and the boundary that GoalLoopDecision is explanation evidence, not a scheduler loop.
- AC-008: Focused and full verification pass, or any pre-existing failure is explicitly recorded.

## Non-Goals

- Do not add a Goal Loop controller or background continuation loop.
- Do not automatically run the recommended action.
- Do not combine multiple high-impact transitions behind one confirmation.
- Do not hide existing human gates for scheduler, IntegrationCheck, apply, close, landing, PR, or merge.
- Do not add a new CLI command, route, lazy projection, frontend page, or artifact shape change.

## Constraints

- Compatibility: `planning.goal-loop.evaluate` remains the only new action from Phase 10C; Phase 10D only surfaces it.
- User surface: the right-side confirmation queue is a Harness stage gate, not a generic permission prompt.
- Authority: Change/ECL, accepted artifacts, Run/Validation/Audit, IntegrationCheck, apply/close records, ToolPolicyGate, and human gates remain workflow truth.
- Module boundary: future product logic must extend owned modules first; no broad-facade write-back.

## Risks

- Risk: Showing Goal Loop evaluation too aggressively could duplicate or obscure concrete next-step confirmations.
  - Mitigation: Add it only when no current confirmation item exists for the selected active Change.
- Risk: Users might interpret a recommended action as already authorized.
  - Mitigation: Copy states that evaluation records evidence only; recommended action remains separate.
- Risk: Workbench read-model logic could grow another broad helper.
  - Mitigation: Put item construction in `confirmation/goal-loop.ts` and keep queue assembly thin.
