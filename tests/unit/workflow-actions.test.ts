import { describe, expect, it } from "vitest";
import { highImpactActions } from "../../src/agent-task/tool-policy.js";
import {
  HIGH_IMPACT_WORKFLOW_ACTION_TYPES,
  LIVE_WORKFLOW_ACTION_TYPES,
  REVALIDATED_WORKFLOW_ACTION_TYPES,
  WORKBENCH_THREAD_ACTION_TYPES,
  WORKFLOW_ACTION_TYPES,
  validateWorkflowActionRequiredTargets,
  workflowActionScopePayload,
  workflowActionScopesMatch,
  workflowActionScopesMatchCompatible,
  workflowActionScopesMatchStrict,
  workflowActionTargetId,
} from "../../src/workflow-actions/registry.js";

describe("workflow action registry", () => {
  it("keeps live, high-impact, and revalidated action sets inside the canonical action registry", () => {
    const all = new Set<string>(WORKFLOW_ACTION_TYPES);

    for (const actionType of LIVE_WORKFLOW_ACTION_TYPES) expect(all.has(actionType)).toBe(true);
    for (const actionType of HIGH_IMPACT_WORKFLOW_ACTION_TYPES.filter((item) => item.startsWith("planning.") || item.startsWith("task.") || item === "code.run")) {
      expect(all.has(actionType)).toBe(true);
    }
    for (const actionType of REVALIDATED_WORKFLOW_ACTION_TYPES) expect(all.has(actionType)).toBe(true);
    for (const actionType of WORKFLOW_ACTION_TYPES) expect(WORKBENCH_THREAD_ACTION_TYPES).toContain(actionType);

    expect(highImpactActions()).toEqual([...HIGH_IMPACT_WORKFLOW_ACTION_TYPES].sort());
    expect(LIVE_WORKFLOW_ACTION_TYPES).toContain("planning.workflowgraph.compile");
    expect(HIGH_IMPACT_WORKFLOW_ACTION_TYPES).toContain("planning.workflowgraph.compile");
    expect(REVALIDATED_WORKFLOW_ACTION_TYPES).toContain("planning.workflowgraph.compile");
    expect(LIVE_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.contract.compile");
    expect(HIGH_IMPACT_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.contract.compile");
    expect(REVALIDATED_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.contract.compile");
    expect(LIVE_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.dispatch.dry-run");
    expect(HIGH_IMPACT_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.dispatch.dry-run");
    expect(REVALIDATED_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.dispatch.dry-run");
    expect(LIVE_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.worker-plan.compile");
    expect(HIGH_IMPACT_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.worker-plan.compile");
    expect(REVALIDATED_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.worker-plan.compile");
    expect(LIVE_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.claim-reconcile.compile");
    expect(HIGH_IMPACT_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.claim-reconcile.compile");
    expect(REVALIDATED_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.claim-reconcile.compile");
    expect(LIVE_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.launch-preflight.check");
    expect(HIGH_IMPACT_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.launch-preflight.check");
    expect(REVALIDATED_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.launch-preflight.check");
    expect(LIVE_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.run.prepare");
    expect(HIGH_IMPACT_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.run.prepare");
    expect(REVALIDATED_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.run.prepare");
    expect(LIVE_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.runtime.initialize");
    expect(HIGH_IMPACT_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.runtime.initialize");
    expect(REVALIDATED_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.runtime.initialize");
    expect(LIVE_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.runtime.reconcile");
    expect(HIGH_IMPACT_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.runtime.reconcile");
    expect(REVALIDATED_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.runtime.reconcile");
    expect(LIVE_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.runtime.reserve-claims");
    expect(HIGH_IMPACT_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.runtime.reserve-claims");
    expect(REVALIDATED_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.runtime.reserve-claims");
    expect(LIVE_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.worker.start-first");
    expect(HIGH_IMPACT_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.worker.start-first");
    expect(REVALIDATED_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.worker.start-first");
    expect(LIVE_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.worker.start-next");
    expect(HIGH_IMPACT_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.worker.start-next");
    expect(REVALIDATED_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.worker.start-next");
    expect(LIVE_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.worker.reconcile-result");
    expect(HIGH_IMPACT_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.worker.reconcile-result");
    expect(REVALIDATED_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.worker.reconcile-result");
    expect(LIVE_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.worker.validate-first");
    expect(HIGH_IMPACT_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.worker.validate-first");
    expect(REVALIDATED_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.worker.validate-first");
    expect(LIVE_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.worker.audit-first");
    expect(HIGH_IMPACT_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.worker.audit-first");
    expect(REVALIDATED_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.worker.audit-first");
    expect(LIVE_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.worker.rework-plan.compile");
    expect(HIGH_IMPACT_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.worker.rework-plan.compile");
    expect(REVALIDATED_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.worker.rework-plan.compile");
    expect(LIVE_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.worker.rework-start-first");
    expect(HIGH_IMPACT_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.worker.rework-start-first");
    expect(REVALIDATED_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.worker.rework-start-first");
    expect(LIVE_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.worker.rework-reconcile-result");
    expect(HIGH_IMPACT_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.worker.rework-reconcile-result");
    expect(REVALIDATED_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.worker.rework-reconcile-result");
    expect(LIVE_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.worker.rework-validate-first");
    expect(HIGH_IMPACT_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.worker.rework-validate-first");
    expect(REVALIDATED_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.worker.rework-validate-first");
    expect(LIVE_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.worker.rework-audit-first");
    expect(HIGH_IMPACT_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.worker.rework-audit-first");
    expect(REVALIDATED_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.worker.rework-audit-first");
    expect(LIVE_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.integration-candidate.compile");
    expect(HIGH_IMPACT_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.integration-candidate.compile");
    expect(REVALIDATED_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.integration-candidate.compile");
    expect(LIVE_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.integration-check.run");
    expect(HIGH_IMPACT_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.integration-check.run");
    expect(REVALIDATED_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.integration-check.run");
    expect(LIVE_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.integration-outcome.reconcile");
    expect(HIGH_IMPACT_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.integration-outcome.reconcile");
    expect(REVALIDATED_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.integration-outcome.reconcile");
    expect(LIVE_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.run.complete");
    expect(HIGH_IMPACT_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.run.complete");
    expect(REVALIDATED_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.run.complete");
    expect(LIVE_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.run.close-blocked");
    expect(HIGH_IMPACT_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.run.close-blocked");
    expect(REVALIDATED_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.run.close-blocked");
    expect(LIVE_WORKFLOW_ACTION_TYPES).toContain("planning.goal-loop.evaluate");
    expect(HIGH_IMPACT_WORKFLOW_ACTION_TYPES).toContain("planning.goal-loop.evaluate");
    expect(REVALIDATED_WORKFLOW_ACTION_TYPES).toContain("planning.goal-loop.evaluate");
    expect(LIVE_WORKFLOW_ACTION_TYPES).toContain("planning.goal-loop.feedback.evaluate");
    expect(HIGH_IMPACT_WORKFLOW_ACTION_TYPES).toContain("planning.goal-loop.feedback.evaluate");
    expect(REVALIDATED_WORKFLOW_ACTION_TYPES).toContain("planning.goal-loop.feedback.evaluate");
    expect(LIVE_WORKFLOW_ACTION_TYPES).toContain("planning.goal-loop.controller.refresh");
    expect(HIGH_IMPACT_WORKFLOW_ACTION_TYPES).toContain("planning.goal-loop.controller.refresh");
    expect(REVALIDATED_WORKFLOW_ACTION_TYPES).toContain("planning.goal-loop.controller.refresh");
    expect(WORKFLOW_ACTION_TYPES).not.toContain("change.close");
    expect(WORKFLOW_ACTION_TYPES).not.toContain("planning.goal-loop.close");
    expect(WORKFLOW_ACTION_TYPES).not.toContain("planning.goal-loop.archive");
    expect(LIVE_WORKFLOW_ACTION_TYPES).not.toContain("change.close");
    expect(HIGH_IMPACT_WORKFLOW_ACTION_TYPES).not.toContain("change.close");
    expect(REVALIDATED_WORKFLOW_ACTION_TYPES).not.toContain("change.close");
  });

  it("keeps GoalLoopDecision, iteration, brief, and packet ids in target and audit scope matching", () => {
    const request = {
      actionType: "planning.goal-loop.evaluate",
      changeId: "change-1",
      goalLoopDecisionId: "goal-loop-decision-1",
      goalLoopIterationId: "goal-loop-iteration-1",
      goalLoopContinuationBriefId: "goal-loop-continuation-brief-1",
      goalLoopNextStepPacketId: "goal-loop-next-step-packet-1",
    };

    expect(validateWorkflowActionRequiredTargets({ actionType: "planning.goal-loop.evaluate", changeId: "change-1" })).toEqual([]);
    expect(validateWorkflowActionRequiredTargets({ actionType: "planning.goal-loop.evaluate" }).map((item) => item.label)).toEqual(["changeId"]);
    expect(workflowActionTargetId(request, request.changeId)).toBe("goal-loop-next-step-packet-1");
    expect(workflowActionScopePayload({ actionType: "planning.goal-loop.evaluate", changeId: "change-1" }, "change-1", {
      goalLoopDecision: { id: "goal-loop-decision-1" },
      goalLoopIteration: { id: "goal-loop-iteration-1", goalLoopDecisionId: "goal-loop-decision-1" },
      goalLoopContinuationBrief: { id: "goal-loop-continuation-brief-1", sourceGoalLoopDecisionId: "goal-loop-decision-1" },
      goalLoopNextStepPacket: {
        id: "goal-loop-next-step-packet-1",
        sourceGoalLoopDecisionId: "goal-loop-decision-1",
        sourceGoalLoopIterationId: "goal-loop-iteration-1",
        sourceGoalLoopContinuationBriefId: "goal-loop-continuation-brief-1",
      },
    })).toMatchObject({
      changeId: "change-1",
      goalLoopDecisionId: "goal-loop-decision-1",
      goalLoopIterationId: "goal-loop-iteration-1",
      goalLoopContinuationBriefId: "goal-loop-continuation-brief-1",
      goalLoopNextStepPacketId: "goal-loop-next-step-packet-1",
    });
    expect(workflowActionScopesMatchStrict(request, { ...request })).toBe(true);
    expect(workflowActionScopesMatchStrict(request, { ...request, goalLoopDecisionId: undefined })).toBe(false);
    expect(workflowActionScopesMatchStrict(request, { ...request, goalLoopIterationId: undefined })).toBe(false);
    expect(workflowActionScopesMatchStrict(request, { ...request, goalLoopContinuationBriefId: undefined })).toBe(false);
    expect(workflowActionScopesMatchStrict(request, { ...request, goalLoopNextStepPacketId: undefined })).toBe(false);
    expect(workflowActionScopesMatchCompatible(request, { ...request, goalLoopDecisionId: undefined })).toBe(true);
    expect(workflowActionScopesMatchCompatible(request, { ...request, goalLoopIterationId: undefined })).toBe(true);
    expect(workflowActionScopesMatchCompatible(request, { ...request, goalLoopContinuationBriefId: undefined })).toBe(true);
    expect(workflowActionScopesMatchCompatible(request, { ...request, goalLoopNextStepPacketId: undefined })).toBe(true);
  });

  it("keeps GoalLoopFeedback id in target and audit scope matching", () => {
    const request = {
      actionType: "planning.goal-loop.feedback.evaluate",
      changeId: "change-1",
      goalLoopNextStepPacketId: "goal-loop-next-step-packet-1",
      goalLoopFeedbackId: "goal-loop-feedback-1",
    };

    expect(validateWorkflowActionRequiredTargets({
      actionType: "planning.goal-loop.feedback.evaluate",
      changeId: "change-1",
      goalLoopNextStepPacketId: "goal-loop-next-step-packet-1",
    })).toEqual([]);
    expect(validateWorkflowActionRequiredTargets({ actionType: "planning.goal-loop.feedback.evaluate", changeId: "change-1" }).map((item) => item.label)).toEqual(["goalLoopNextStepPacketId"]);
    expect(workflowActionTargetId(request, request.changeId)).toBe("goal-loop-feedback-1");
    expect(workflowActionScopePayload({ actionType: "planning.goal-loop.feedback.evaluate", changeId: "change-1", goalLoopNextStepPacketId: "goal-loop-next-step-packet-1" }, "change-1", {
      goalLoopFeedback: {
        id: "goal-loop-feedback-1",
        sourceGoalLoopNextStepPacketId: "goal-loop-next-step-packet-1",
      },
    })).toMatchObject({
      changeId: "change-1",
      goalLoopNextStepPacketId: "goal-loop-next-step-packet-1",
      goalLoopFeedbackId: "goal-loop-feedback-1",
    });
    expect(workflowActionScopesMatchStrict(request, { ...request })).toBe(true);
    expect(workflowActionScopesMatchStrict(request, { ...request, goalLoopFeedbackId: undefined })).toBe(false);
    expect(workflowActionScopesMatchCompatible(request, { ...request, goalLoopFeedbackId: undefined })).toBe(true);
  });

  it("keeps GoalLoopControllerPolicy id and current gate scope in target and audit scope matching", () => {
    const request = {
      actionType: "planning.goal-loop.controller.refresh",
      changeId: "change-1",
      goalLoopNextStepPacketId: "goal-loop-next-step-packet-1",
      goalLoopControllerPolicyId: "goal-loop-controller-policy-1",
      goalLoopCurrentGateActionType: "planning.scheduler.worker.start-first",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "claim-reservation-1",
    };

    expect(validateWorkflowActionRequiredTargets({
      actionType: "planning.goal-loop.controller.refresh",
      changeId: "change-1",
      goalLoopNextStepPacketId: "goal-loop-next-step-packet-1",
      goalLoopCurrentGateActionType: "planning.scheduler.worker.start-first",
    })).toEqual([]);
    expect(validateWorkflowActionRequiredTargets({
      actionType: "planning.goal-loop.controller.refresh",
      changeId: "change-1",
      goalLoopNextStepPacketId: "goal-loop-next-step-packet-1",
    }).map((item) => item.label)).toEqual(["goalLoopCurrentGateActionType"]);
    expect(workflowActionTargetId(request, request.changeId)).toBe("goal-loop-controller-policy-1");
    expect(workflowActionScopePayload({
      actionType: "planning.goal-loop.controller.refresh",
      changeId: "change-1",
      goalLoopNextStepPacketId: "goal-loop-next-step-packet-1",
      goalLoopCurrentGateActionType: "planning.scheduler.worker.start-first",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "claim-reservation-1",
    }, "change-1", {
      goalLoopControllerPolicy: {
        id: "goal-loop-controller-policy-1",
        sourceGoalLoopNextStepPacketId: "goal-loop-next-step-packet-1",
      },
    })).toMatchObject({
      changeId: "change-1",
      goalLoopNextStepPacketId: "goal-loop-next-step-packet-1",
      goalLoopControllerPolicyId: "goal-loop-controller-policy-1",
      goalLoopCurrentGateActionType: "planning.scheduler.worker.start-first",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "claim-reservation-1",
    });
    expect(workflowActionScopesMatchStrict(request, { ...request })).toBe(true);
    expect(workflowActionScopesMatchStrict(request, { ...request, goalLoopControllerPolicyId: undefined })).toBe(false);
    expect(workflowActionScopesMatchStrict(request, { ...request, goalLoopCurrentGateActionType: "planning.scheduler.worker.start-next" })).toBe(false);
    expect(workflowActionScopesMatchStrict(request, { ...request, schedulerClaimReservationId: "other-reservation" })).toBe(false);
    expect(workflowActionScopesMatchCompatible(request, { ...request, goalLoopControllerPolicyId: undefined })).toBe(true);
  });

  it("keeps GoalLoopGateReadinessPreflight id and concrete gate scope in target and audit scope matching", () => {
    const request = {
      actionType: "planning.goal-loop.gate-readiness.prepare",
      changeId: "change-1",
      goalLoopNextStepPacketId: "goal-loop-next-step-packet-1",
      goalLoopControllerPolicyId: "goal-loop-controller-policy-1",
      goalLoopGateReadinessPreflightId: "goal-loop-gate-readiness-preflight-1",
      goalLoopCurrentGateActionType: "planning.scheduler.worker.start-first",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "claim-reservation-1",
    };

    expect(validateWorkflowActionRequiredTargets({
      actionType: "planning.goal-loop.gate-readiness.prepare",
      changeId: "change-1",
      goalLoopNextStepPacketId: "goal-loop-next-step-packet-1",
      goalLoopControllerPolicyId: "goal-loop-controller-policy-1",
      goalLoopCurrentGateActionType: "planning.scheduler.worker.start-first",
    })).toEqual([]);
    expect(validateWorkflowActionRequiredTargets({
      actionType: "planning.goal-loop.gate-readiness.prepare",
      changeId: "change-1",
      goalLoopNextStepPacketId: "goal-loop-next-step-packet-1",
    }).map((item) => item.label)).toEqual(["goalLoopControllerPolicyId", "goalLoopCurrentGateActionType"]);
    expect(workflowActionTargetId(request, request.changeId)).toBe("goal-loop-gate-readiness-preflight-1");
    expect(workflowActionScopePayload({
      actionType: "planning.goal-loop.gate-readiness.prepare",
      changeId: "change-1",
      goalLoopNextStepPacketId: "goal-loop-next-step-packet-1",
      goalLoopControllerPolicyId: "goal-loop-controller-policy-1",
      goalLoopCurrentGateActionType: "planning.scheduler.worker.start-first",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "claim-reservation-1",
    }, "change-1", {
      goalLoopGateReadinessPreflight: {
        id: "goal-loop-gate-readiness-preflight-1",
        sourceGoalLoopNextStepPacketId: "goal-loop-next-step-packet-1",
        sourceGoalLoopControllerPolicyId: "goal-loop-controller-policy-1",
      },
    })).toMatchObject({
      changeId: "change-1",
      goalLoopNextStepPacketId: "goal-loop-next-step-packet-1",
      goalLoopControllerPolicyId: "goal-loop-controller-policy-1",
      goalLoopGateReadinessPreflightId: "goal-loop-gate-readiness-preflight-1",
      goalLoopCurrentGateActionType: "planning.scheduler.worker.start-first",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "claim-reservation-1",
    });
    expect(workflowActionScopesMatchStrict(request, { ...request })).toBe(true);
    expect(workflowActionScopesMatchStrict(request, { ...request, goalLoopGateReadinessPreflightId: undefined })).toBe(false);
    expect(workflowActionScopesMatchStrict(request, { ...request, schedulerClaimReservationId: "other-reservation" })).toBe(false);
    expect(workflowActionScopesMatchCompatible(request, { ...request, goalLoopGateReadinessPreflightId: undefined })).toBe(true);
  });

  it("keeps assisted Goal Loop preflight evidence from replacing the concrete action target", () => {
    const request = {
      actionType: "planning.scheduler.worker.start-first",
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "claim-reservation-1",
      goalLoopDecisionId: "goal-loop-decision-1",
      goalLoopIterationId: "goal-loop-iteration-1",
      goalLoopContinuationBriefId: "goal-loop-continuation-brief-1",
      goalLoopNextStepPacketId: "goal-loop-next-step-packet-1",
      goalLoopControllerPolicyId: "goal-loop-controller-policy-1",
      goalLoopGateReadinessPreflightId: "goal-loop-gate-readiness-preflight-1",
    };

    expect(workflowActionTargetId(request, request.changeId)).toBe("claim-reservation-1");
    expect(workflowActionScopePayload(request, request.changeId)).toMatchObject({
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "claim-reservation-1",
      goalLoopNextStepPacketId: "goal-loop-next-step-packet-1",
      goalLoopControllerPolicyId: "goal-loop-controller-policy-1",
      goalLoopGateReadinessPreflightId: "goal-loop-gate-readiness-preflight-1",
    });
    expect(workflowActionScopesMatchStrict(request, { ...request })).toBe(true);
    expect(workflowActionScopesMatchStrict(request, { ...request, goalLoopGateReadinessPreflightId: undefined })).toBe(false);
  });

  it("keeps SchedulerContract ids in target and audit scope matching", () => {
    const request = {
      changeId: "change-1",
      decompositionPlanId: "decomposition-1",
      readinessManifestId: "readiness-1",
      schedulerContractId: "scheduler-contract-1",
    };

    expect(workflowActionTargetId(request, request.changeId)).toBe("scheduler-contract-1");
    expect(workflowActionScopePayload(request, request.changeId, { contract: { id: "scheduler-contract-1" } })).toMatchObject({
      changeId: "change-1",
      decompositionPlanId: "decomposition-1",
      readinessManifestId: "readiness-1",
      schedulerContractId: "scheduler-contract-1",
    });
    expect(workflowActionScopesMatchStrict(request, { ...request })).toBe(true);
    expect(workflowActionScopesMatchStrict(request, { ...request, schedulerContractId: undefined })).toBe(false);
    expect(workflowActionScopesMatchCompatible(request, { ...request, schedulerContractId: undefined })).toBe(true);
    expect(validateWorkflowActionRequiredTargets({
      actionType: "planning.scheduler.contract.compile",
      decompositionPlanId: "decomposition-1",
      readinessManifestId: "readiness-1",
    })).toEqual([]);
    expect(validateWorkflowActionRequiredTargets({
      actionType: "planning.scheduler.contract.compile",
      readinessManifestId: "readiness-1",
    }).map((item) => item.label)).toEqual(["decompositionPlanId"]);
    expect(validateWorkflowActionRequiredTargets({
      actionType: "planning.scheduler.dispatch.dry-run",
      schedulerContractId: "scheduler-contract-1",
    })).toEqual([]);
    expect(validateWorkflowActionRequiredTargets({
      actionType: "planning.scheduler.dispatch.dry-run",
    }).map((item) => item.label)).toEqual(["schedulerContractId"]);
    expect(validateWorkflowActionRequiredTargets({
      actionType: "planning.scheduler.worker-plan.compile",
      schedulerDispatchDryRunId: "scheduler-dry-run-1",
    })).toEqual([]);
    expect(validateWorkflowActionRequiredTargets({
      actionType: "planning.scheduler.worker-plan.compile",
      schedulerContractId: "scheduler-contract-1",
    }).map((item) => item.label)).toEqual(["schedulerDispatchDryRunId"]);
    expect(validateWorkflowActionRequiredTargets({
      actionType: "planning.scheduler.claim-reconcile.compile",
      schedulerWorkerPlanId: "scheduler-worker-plan-1",
    })).toEqual([]);
    expect(validateWorkflowActionRequiredTargets({
      actionType: "planning.scheduler.claim-reconcile.compile",
      schedulerDispatchDryRunId: "scheduler-dry-run-1",
    }).map((item) => item.label)).toEqual(["schedulerWorkerPlanId"]);
    expect(validateWorkflowActionRequiredTargets({
      actionType: "planning.scheduler.launch-preflight.check",
      schedulerClaimReconcilePlanId: "scheduler-claim-reconcile-1",
    })).toEqual([]);
    expect(validateWorkflowActionRequiredTargets({
      actionType: "planning.scheduler.launch-preflight.check",
      schedulerWorkerPlanId: "scheduler-worker-plan-1",
    }).map((item) => item.label)).toEqual(["schedulerClaimReconcilePlanId"]);
    expect(validateWorkflowActionRequiredTargets({
      actionType: "planning.scheduler.run.prepare",
      schedulerLaunchPreflightId: "scheduler-launch-preflight-1",
    })).toEqual([]);
    expect(validateWorkflowActionRequiredTargets({
      actionType: "planning.scheduler.run.prepare",
      schedulerClaimReconcilePlanId: "scheduler-claim-reconcile-1",
    }).map((item) => item.label)).toEqual(["schedulerLaunchPreflightId"]);
    expect(validateWorkflowActionRequiredTargets({
      actionType: "planning.scheduler.runtime.initialize",
      schedulerRunId: "scheduler-run-1",
    })).toEqual([]);
    expect(validateWorkflowActionRequiredTargets({
      actionType: "planning.scheduler.runtime.initialize",
      schedulerLaunchPreflightId: "scheduler-launch-preflight-1",
    }).map((item) => item.label)).toEqual(["schedulerRunId"]);
    expect(validateWorkflowActionRequiredTargets({
      actionType: "planning.scheduler.runtime.reconcile",
      schedulerRunId: "scheduler-run-1",
    })).toEqual([]);
    expect(validateWorkflowActionRequiredTargets({
      actionType: "planning.scheduler.runtime.reconcile",
      schedulerLaunchPreflightId: "scheduler-launch-preflight-1",
    }).map((item) => item.label)).toEqual(["schedulerRunId"]);
    const workerPlanRequest = {
      changeId: "change-1",
      schedulerContractId: "scheduler-contract-1",
      schedulerDispatchDryRunId: "scheduler-dry-run-1",
    };
    expect(workflowActionTargetId(workerPlanRequest, workerPlanRequest.changeId)).toBe("scheduler-dry-run-1");
    expect(workflowActionScopePayload(workerPlanRequest, workerPlanRequest.changeId, {
      workerPlan: {
        id: "scheduler-worker-plan-1",
        schedulerContractId: "scheduler-contract-1",
        schedulerDispatchDryRunId: "scheduler-dry-run-1",
      },
    })).toMatchObject({
      changeId: "change-1",
      schedulerContractId: "scheduler-contract-1",
      schedulerDispatchDryRunId: "scheduler-dry-run-1",
      schedulerWorkerPlanId: "scheduler-worker-plan-1",
    });
    expect(workflowActionScopesMatchStrict(workerPlanRequest, { ...workerPlanRequest })).toBe(true);
    expect(workflowActionScopesMatchStrict(workerPlanRequest, { ...workerPlanRequest, schedulerDispatchDryRunId: undefined })).toBe(false);
    expect(workflowActionScopesMatchCompatible(workerPlanRequest, { ...workerPlanRequest, schedulerDispatchDryRunId: undefined })).toBe(true);
    const claimReconcileRequest = {
      changeId: "change-1",
      schedulerContractId: "scheduler-contract-1",
      schedulerDispatchDryRunId: "scheduler-dry-run-1",
      schedulerWorkerPlanId: "scheduler-worker-plan-1",
    };
    expect(workflowActionTargetId(claimReconcileRequest, claimReconcileRequest.changeId)).toBe("scheduler-worker-plan-1");
    expect(workflowActionScopePayload(claimReconcileRequest, claimReconcileRequest.changeId, {
      claimReconcilePlan: {
        id: "scheduler-claim-reconcile-1",
        schedulerContractId: "scheduler-contract-1",
        schedulerDispatchDryRunId: "scheduler-dry-run-1",
        schedulerWorkerPlanId: "scheduler-worker-plan-1",
      },
    })).toMatchObject({
      changeId: "change-1",
      schedulerContractId: "scheduler-contract-1",
      schedulerDispatchDryRunId: "scheduler-dry-run-1",
      schedulerWorkerPlanId: "scheduler-worker-plan-1",
      schedulerClaimReconcilePlanId: "scheduler-claim-reconcile-1",
    });
    expect(workflowActionScopesMatchStrict(claimReconcileRequest, { ...claimReconcileRequest })).toBe(true);
    expect(workflowActionScopesMatchStrict(claimReconcileRequest, { ...claimReconcileRequest, schedulerWorkerPlanId: undefined })).toBe(false);
    expect(workflowActionScopesMatchCompatible(claimReconcileRequest, { ...claimReconcileRequest, schedulerWorkerPlanId: undefined })).toBe(true);
    const launchPreflightRequest = {
      changeId: "change-1",
      schedulerContractId: "scheduler-contract-1",
      schedulerDispatchDryRunId: "scheduler-dry-run-1",
      schedulerWorkerPlanId: "scheduler-worker-plan-1",
      schedulerClaimReconcilePlanId: "scheduler-claim-reconcile-1",
    };
    expect(workflowActionTargetId(launchPreflightRequest, launchPreflightRequest.changeId)).toBe("scheduler-claim-reconcile-1");
    expect(workflowActionScopePayload(launchPreflightRequest, launchPreflightRequest.changeId, {
      launchPreflight: {
        id: "scheduler-launch-preflight-1",
        schedulerContractId: "scheduler-contract-1",
        schedulerDispatchDryRunId: "scheduler-dry-run-1",
        schedulerWorkerPlanId: "scheduler-worker-plan-1",
        schedulerClaimReconcilePlanId: "scheduler-claim-reconcile-1",
      },
    })).toMatchObject({
      changeId: "change-1",
      schedulerContractId: "scheduler-contract-1",
      schedulerDispatchDryRunId: "scheduler-dry-run-1",
      schedulerWorkerPlanId: "scheduler-worker-plan-1",
      schedulerClaimReconcilePlanId: "scheduler-claim-reconcile-1",
      schedulerLaunchPreflightId: "scheduler-launch-preflight-1",
    });
    expect(workflowActionScopesMatchStrict(launchPreflightRequest, { ...launchPreflightRequest })).toBe(true);
    expect(workflowActionScopesMatchStrict(launchPreflightRequest, { ...launchPreflightRequest, schedulerClaimReconcilePlanId: undefined })).toBe(false);
    expect(workflowActionScopesMatchCompatible(launchPreflightRequest, { ...launchPreflightRequest, schedulerClaimReconcilePlanId: undefined })).toBe(true);
    const schedulerRunRequest = {
      changeId: "change-1",
      schedulerContractId: "scheduler-contract-1",
      schedulerDispatchDryRunId: "scheduler-dry-run-1",
      schedulerWorkerPlanId: "scheduler-worker-plan-1",
      schedulerClaimReconcilePlanId: "scheduler-claim-reconcile-1",
      schedulerLaunchPreflightId: "scheduler-launch-preflight-1",
    };
    expect(workflowActionTargetId(schedulerRunRequest, schedulerRunRequest.changeId)).toBe("scheduler-launch-preflight-1");
    expect(workflowActionScopePayload(schedulerRunRequest, schedulerRunRequest.changeId, {
      schedulerRun: {
        id: "scheduler-run-1",
        schedulerContractId: "scheduler-contract-1",
        schedulerDispatchDryRunId: "scheduler-dry-run-1",
        schedulerWorkerPlanId: "scheduler-worker-plan-1",
        schedulerClaimReconcilePlanId: "scheduler-claim-reconcile-1",
        schedulerLaunchPreflightId: "scheduler-launch-preflight-1",
      },
    })).toMatchObject({
      changeId: "change-1",
      schedulerContractId: "scheduler-contract-1",
      schedulerDispatchDryRunId: "scheduler-dry-run-1",
      schedulerWorkerPlanId: "scheduler-worker-plan-1",
      schedulerClaimReconcilePlanId: "scheduler-claim-reconcile-1",
      schedulerLaunchPreflightId: "scheduler-launch-preflight-1",
      schedulerRunId: "scheduler-run-1",
    });
    expect(workflowActionScopesMatchStrict(schedulerRunRequest, { ...schedulerRunRequest })).toBe(true);
    expect(workflowActionScopesMatchStrict(schedulerRunRequest, { ...schedulerRunRequest, schedulerLaunchPreflightId: undefined })).toBe(false);
    expect(workflowActionScopesMatchCompatible(schedulerRunRequest, { ...schedulerRunRequest, schedulerLaunchPreflightId: undefined })).toBe(true);
    const runtimeRequest = {
      ...schedulerRunRequest,
      schedulerRunId: "scheduler-run-1",
    };
    expect(workflowActionTargetId(runtimeRequest, runtimeRequest.changeId)).toBe("scheduler-run-1");
    expect(workflowActionScopePayload(runtimeRequest, runtimeRequest.changeId, {
      runtimeState: {
        id: "scheduler-runtime-1",
        schedulerRunId: "scheduler-run-1",
      },
    })).toMatchObject({
      changeId: "change-1",
      schedulerContractId: "scheduler-contract-1",
      schedulerDispatchDryRunId: "scheduler-dry-run-1",
      schedulerWorkerPlanId: "scheduler-worker-plan-1",
      schedulerClaimReconcilePlanId: "scheduler-claim-reconcile-1",
      schedulerLaunchPreflightId: "scheduler-launch-preflight-1",
      schedulerRunId: "scheduler-run-1",
    });
    const reconcileRequest = {
      ...runtimeRequest,
      schedulerReconcileSnapshotId: "scheduler-reconcile-snapshot-1",
    };
    expect(workflowActionScopePayload(reconcileRequest, reconcileRequest.changeId, {
      reconcileSnapshot: {
        id: "scheduler-reconcile-snapshot-1",
        schedulerRunId: "scheduler-run-1",
      },
    })).toMatchObject({
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerReconcileSnapshotId: "scheduler-reconcile-snapshot-1",
    });
    expect(workflowActionScopesMatchStrict(reconcileRequest, { ...reconcileRequest })).toBe(true);
    expect(workflowActionScopesMatchStrict(reconcileRequest, { ...reconcileRequest, schedulerReconcileSnapshotId: undefined })).toBe(false);
    expect(workflowActionScopesMatchCompatible(reconcileRequest, { ...reconcileRequest, schedulerReconcileSnapshotId: undefined })).toBe(true);
  });

  it("keeps Scheduler claim reservation scope in target, payload, and required-target validation", () => {
    const request = {
      actionType: "planning.scheduler.runtime.reserve-claims",
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerReconcileSnapshotId: "scheduler-reconcile-1",
    };

    const result = {
      claimReservation: {
        id: "scheduler-claim-reservation-1",
        schedulerRunId: "scheduler-run-1",
        schedulerReconcileSnapshotId: "scheduler-reconcile-1",
      },
    };
    expect(validateWorkflowActionRequiredTargets(request)).toEqual([]);
    expect(validateWorkflowActionRequiredTargets({
      actionType: "planning.scheduler.runtime.reserve-claims",
      schedulerRunId: "scheduler-run-1",
    }).map((item) => item.label)).toEqual(["schedulerReconcileSnapshotId"]);
    expect(workflowActionTargetId(request, request.changeId, result)).toBe("scheduler-claim-reservation-1");
    expect(workflowActionScopePayload(request, request.changeId, result)).toMatchObject({
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerReconcileSnapshotId: "scheduler-reconcile-1",
      schedulerClaimReservationId: "scheduler-claim-reservation-1",
    });
    expect(workflowActionScopesMatchStrict(
      { ...request, schedulerClaimReservationId: "scheduler-claim-reservation-1" },
      { ...request, schedulerClaimReservationId: "scheduler-claim-reservation-1" },
    )).toBe(true);
    expect(workflowActionScopesMatch(
      { ...request, schedulerClaimReservationId: "scheduler-claim-reservation-1" },
      { ...request, schedulerClaimReservationId: "other" },
    )).toBe(false);

    const workerStartRequest = {
      actionType: "planning.scheduler.worker.start-first",
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "scheduler-claim-reservation-1",
      reservationIntentId: "reservation-intent-1",
      claimIntentId: "claim-intent-1",
    };
    const workerStartResult = {
      workerStart: {
        id: "scheduler-worker-start-1",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "scheduler-claim-reservation-1",
        reservationIntentId: "reservation-intent-1",
        claimIntentId: "claim-intent-1",
      },
    };
    expect(validateWorkflowActionRequiredTargets(workerStartRequest)).toEqual([]);
    expect(validateWorkflowActionRequiredTargets({
      actionType: "planning.scheduler.worker.start-first",
      schedulerRunId: "scheduler-run-1",
    }).map((item) => item.label)).toEqual(["schedulerClaimReservationId"]);
    expect(workflowActionTargetId(workerStartRequest, workerStartRequest.changeId, workerStartResult)).toBe("scheduler-claim-reservation-1");
    expect(workflowActionScopePayload(workerStartRequest, workerStartRequest.changeId, workerStartResult)).toMatchObject({
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "scheduler-claim-reservation-1",
      reservationIntentId: "reservation-intent-1",
      claimIntentId: "claim-intent-1",
    });
    expect(workflowActionScopesMatchStrict(workerStartRequest, { ...workerStartRequest })).toBe(true);
    expect(workflowActionScopesMatchStrict(workerStartRequest, { ...workerStartRequest, reservationIntentId: undefined })).toBe(false);
    expect(workflowActionScopesMatchCompatible(workerStartRequest, { ...workerStartRequest, reservationIntentId: undefined })).toBe(true);

    const workerStartNextRequest = {
      ...workerStartRequest,
      actionType: "planning.scheduler.worker.start-next",
      reservationIntentId: "reservation-intent-2",
      claimIntentId: "claim-intent-2",
    };
    expect(validateWorkflowActionRequiredTargets(workerStartNextRequest)).toEqual([]);
    expect(validateWorkflowActionRequiredTargets({
      actionType: "planning.scheduler.worker.start-next",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "scheduler-claim-reservation-1",
    }).map((item) => item.label)).toEqual(["reservationIntentId", "claimIntentId"]);
    expect(workflowActionTargetId(workerStartNextRequest, workerStartNextRequest.changeId, {
      workerStart: {
        id: "scheduler-worker-start-2",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "scheduler-claim-reservation-1",
        reservationIntentId: "reservation-intent-2",
        claimIntentId: "claim-intent-2",
      },
    })).toBe("scheduler-claim-reservation-1");
    expect(workflowActionScopePayload(workerStartNextRequest, workerStartNextRequest.changeId, {
      workerStart: {
        id: "scheduler-worker-start-2",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "scheduler-claim-reservation-1",
        reservationIntentId: "reservation-intent-2",
        claimIntentId: "claim-intent-2",
      },
    })).toMatchObject({
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "scheduler-claim-reservation-1",
      reservationIntentId: "reservation-intent-2",
      claimIntentId: "claim-intent-2",
    });

    const workerResultRequest = {
      actionType: "planning.scheduler.worker.reconcile-result",
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "scheduler-claim-reservation-1",
      schedulerWorkerStartId: "scheduler-worker-start-1",
      reservationIntentId: "reservation-intent-1",
      claimIntentId: "claim-intent-1",
      taskRunId: "task-run-1",
      workerLeaseId: "worker-lease-1",
      runId: "run-1",
    };
    const workerResult = {
      result: {
        id: "scheduler-worker-result-1",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "scheduler-claim-reservation-1",
        schedulerWorkerStartId: "scheduler-worker-start-1",
        reservationIntentId: "reservation-intent-1",
        claimIntentId: "claim-intent-1",
        taskRunId: "task-run-1",
        workerLeaseId: "worker-lease-1",
        runId: "run-1",
      },
    };
    expect(validateWorkflowActionRequiredTargets(workerResultRequest)).toEqual([]);
    expect(validateWorkflowActionRequiredTargets({
      actionType: "planning.scheduler.worker.reconcile-result",
      schedulerRunId: "scheduler-run-1",
    }).map((item) => item.label)).toEqual(["schedulerWorkerStartId"]);
    expect(workflowActionTargetId(workerResultRequest, workerResultRequest.changeId, workerResult)).toBe("scheduler-worker-result-1");
    expect(workflowActionScopePayload(workerResultRequest, workerResultRequest.changeId, workerResult)).toMatchObject({
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "scheduler-claim-reservation-1",
      schedulerWorkerStartId: "scheduler-worker-start-1",
      schedulerWorkerResultId: "scheduler-worker-result-1",
      reservationIntentId: "reservation-intent-1",
      claimIntentId: "claim-intent-1",
      taskRunId: "task-run-1",
      workerLeaseId: "worker-lease-1",
      runId: "run-1",
    });
    expect(workflowActionScopesMatchStrict(workerResultRequest, { ...workerResultRequest })).toBe(true);
    expect(workflowActionScopesMatchStrict(workerResultRequest, { ...workerResultRequest, schedulerWorkerStartId: undefined })).toBe(false);
    expect(workflowActionScopesMatchCompatible(workerResultRequest, { ...workerResultRequest, schedulerWorkerStartId: undefined })).toBe(true);

    const workerValidationRequest = {
      actionType: "planning.scheduler.worker.validate-first",
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "scheduler-claim-reservation-1",
      schedulerWorkerStartId: "scheduler-worker-start-1",
      schedulerWorkerResultId: "scheduler-worker-result-1",
      reservationIntentId: "reservation-intent-1",
      claimIntentId: "claim-intent-1",
      taskRunId: "task-run-1",
      workerLeaseId: "worker-lease-1",
      worktreeId: "worktree-1",
      runId: "run-1",
    };
    const workerValidation = {
      schedulerValidation: {
        id: "scheduler-worker-validation-1",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "scheduler-claim-reservation-1",
        schedulerWorkerStartId: "scheduler-worker-start-1",
        schedulerWorkerResultId: "scheduler-worker-result-1",
        validationRunId: "validation-run-1",
      },
    };
    expect(validateWorkflowActionRequiredTargets(workerValidationRequest)).toEqual([]);
    expect(validateWorkflowActionRequiredTargets({
      actionType: "planning.scheduler.worker.validate-first",
      schedulerRunId: "scheduler-run-1",
    }).map((item) => item.label)).toEqual(["schedulerWorkerResultId"]);
    expect(workflowActionTargetId(workerValidationRequest, workerValidationRequest.changeId, workerValidation)).toBe("scheduler-worker-validation-1");
    expect(workflowActionScopePayload(workerValidationRequest, workerValidationRequest.changeId, workerValidation)).toMatchObject({
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "scheduler-claim-reservation-1",
      schedulerWorkerStartId: "scheduler-worker-start-1",
      schedulerWorkerResultId: "scheduler-worker-result-1",
      schedulerWorkerValidationId: "scheduler-worker-validation-1",
      reservationIntentId: "reservation-intent-1",
      claimIntentId: "claim-intent-1",
      taskRunId: "task-run-1",
      workerLeaseId: "worker-lease-1",
      worktreeId: "worktree-1",
      runId: "run-1",
      validationRunId: "validation-run-1",
    });
    expect(workflowActionScopesMatchStrict(workerValidationRequest, { ...workerValidationRequest })).toBe(true);
    expect(workflowActionScopesMatchStrict(workerValidationRequest, { ...workerValidationRequest, schedulerWorkerResultId: undefined })).toBe(false);
    expect(workflowActionScopesMatchCompatible(workerValidationRequest, { ...workerValidationRequest, schedulerWorkerResultId: undefined })).toBe(true);

    const workerAuditRequest = {
      actionType: "planning.scheduler.worker.audit-first",
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "scheduler-claim-reservation-1",
      schedulerWorkerStartId: "scheduler-worker-start-1",
      schedulerWorkerResultId: "scheduler-worker-result-1",
      schedulerWorkerValidationId: "scheduler-worker-validation-1",
      reservationIntentId: "reservation-intent-1",
      claimIntentId: "claim-intent-1",
      taskRunId: "task-run-1",
      workerLeaseId: "worker-lease-1",
      worktreeId: "worktree-1",
      runId: "run-1",
      validationRunId: "validation-run-1",
    };
    const workerAudit = {
      schedulerAudit: {
        id: "scheduler-worker-audit-1",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "scheduler-claim-reservation-1",
        schedulerWorkerStartId: "scheduler-worker-start-1",
        schedulerWorkerResultId: "scheduler-worker-result-1",
        schedulerWorkerValidationId: "scheduler-worker-validation-1",
        auditRunId: "audit-run-1",
      },
    };
    expect(validateWorkflowActionRequiredTargets(workerAuditRequest)).toEqual([]);
    expect(validateWorkflowActionRequiredTargets({
      actionType: "planning.scheduler.worker.audit-first",
      schedulerRunId: "scheduler-run-1",
    }).map((item) => item.label)).toEqual(["schedulerWorkerValidationId"]);
    expect(workflowActionTargetId(workerAuditRequest, workerAuditRequest.changeId, workerAudit)).toBe("scheduler-worker-audit-1");
    expect(workflowActionScopePayload(workerAuditRequest, workerAuditRequest.changeId, workerAudit)).toMatchObject({
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "scheduler-claim-reservation-1",
      schedulerWorkerStartId: "scheduler-worker-start-1",
      schedulerWorkerResultId: "scheduler-worker-result-1",
      schedulerWorkerValidationId: "scheduler-worker-validation-1",
      schedulerWorkerAuditId: "scheduler-worker-audit-1",
      reservationIntentId: "reservation-intent-1",
      claimIntentId: "claim-intent-1",
      taskRunId: "task-run-1",
      workerLeaseId: "worker-lease-1",
      worktreeId: "worktree-1",
      runId: "run-1",
      validationRunId: "validation-run-1",
      auditRunId: "audit-run-1",
    });
    expect(workflowActionScopesMatchStrict(workerAuditRequest, { ...workerAuditRequest })).toBe(true);
    expect(workflowActionScopesMatchStrict(workerAuditRequest, { ...workerAuditRequest, schedulerWorkerValidationId: undefined })).toBe(false);
    expect(workflowActionScopesMatchCompatible(workerAuditRequest, { ...workerAuditRequest, schedulerWorkerValidationId: undefined })).toBe(true);

    const workerReworkPlanRequest = {
      actionType: "planning.scheduler.worker.rework-plan.compile",
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "scheduler-claim-reservation-1",
      schedulerWorkerStartId: "scheduler-worker-start-1",
      schedulerWorkerResultId: "scheduler-worker-result-1",
      schedulerWorkerValidationId: "scheduler-worker-validation-1",
      schedulerWorkerAuditId: "scheduler-worker-audit-1",
      reservationIntentId: "reservation-intent-1",
      claimIntentId: "claim-intent-1",
      taskRunId: "task-run-1",
      workerLeaseId: "worker-lease-1",
      worktreeId: "worktree-1",
      runId: "run-1",
      validationRunId: "validation-run-1",
      auditRunId: "audit-run-1",
    };
    const workerReworkPlan = {
      reworkPlan: {
        id: "scheduler-worker-rework-plan-1",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "scheduler-claim-reservation-1",
        schedulerWorkerStartId: "scheduler-worker-start-1",
        schedulerWorkerResultId: "scheduler-worker-result-1",
        schedulerWorkerValidationId: "scheduler-worker-validation-1",
        schedulerWorkerAuditId: "scheduler-worker-audit-1",
        reservationIntentId: "reservation-intent-1",
        claimIntentId: "claim-intent-1",
        taskRunId: "task-run-1",
        workerLeaseId: "worker-lease-1",
        targetWorktreeId: "worktree-1",
        targetCodeRunId: "run-1",
        validationRunId: "validation-run-1",
        auditRunId: "audit-run-1",
      },
    };
    expect(validateWorkflowActionRequiredTargets(workerReworkPlanRequest)).toEqual([]);
    expect(validateWorkflowActionRequiredTargets({
      actionType: "planning.scheduler.worker.rework-plan.compile",
      schedulerRunId: "scheduler-run-1",
    }).map((item) => item.label)).toEqual(["schedulerWorkerValidationId"]);
    expect(workflowActionTargetId(workerReworkPlanRequest, workerReworkPlanRequest.changeId, workerReworkPlan)).toBe("scheduler-worker-rework-plan-1");
    expect(workflowActionScopePayload(workerReworkPlanRequest, workerReworkPlanRequest.changeId, workerReworkPlan)).toMatchObject({
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "scheduler-claim-reservation-1",
      schedulerWorkerStartId: "scheduler-worker-start-1",
      schedulerWorkerResultId: "scheduler-worker-result-1",
      schedulerWorkerValidationId: "scheduler-worker-validation-1",
      schedulerWorkerAuditId: "scheduler-worker-audit-1",
      schedulerWorkerReworkPlanId: "scheduler-worker-rework-plan-1",
      reservationIntentId: "reservation-intent-1",
      claimIntentId: "claim-intent-1",
      taskRunId: "task-run-1",
      workerLeaseId: "worker-lease-1",
      worktreeId: "worktree-1",
      runId: "run-1",
      validationRunId: "validation-run-1",
      auditRunId: "audit-run-1",
    });
    expect(workflowActionScopesMatchStrict(workerReworkPlanRequest, { ...workerReworkPlanRequest })).toBe(true);
    expect(workflowActionScopesMatchStrict(workerReworkPlanRequest, { ...workerReworkPlanRequest, schedulerWorkerAuditId: undefined })).toBe(false);
    expect(workflowActionScopesMatchCompatible(workerReworkPlanRequest, { ...workerReworkPlanRequest, schedulerWorkerAuditId: undefined })).toBe(true);

    const workerReworkStartRequest = {
      actionType: "planning.scheduler.worker.rework-start-first",
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "scheduler-claim-reservation-1",
      schedulerWorkerStartId: "scheduler-worker-start-1",
      schedulerWorkerResultId: "scheduler-worker-result-1",
      schedulerWorkerValidationId: "scheduler-worker-validation-1",
      schedulerWorkerAuditId: "scheduler-worker-audit-1",
      schedulerWorkerReworkPlanId: "scheduler-worker-rework-plan-1",
      reservationIntentId: "reservation-intent-1",
      claimIntentId: "claim-intent-1",
      taskRunId: "task-run-1",
      workerLeaseId: "worker-lease-1",
      worktreeId: "worktree-1",
      runId: "run-1",
      validationRunId: "validation-run-1",
      auditRunId: "audit-run-1",
    };
    const workerReworkStart = {
      reworkStart: {
        id: "scheduler-worker-rework-start-1",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "scheduler-claim-reservation-1",
        schedulerWorkerStartId: "scheduler-worker-start-1",
        schedulerWorkerResultId: "scheduler-worker-result-1",
        schedulerWorkerValidationId: "scheduler-worker-validation-1",
        schedulerWorkerAuditId: "scheduler-worker-audit-1",
        schedulerWorkerReworkPlanId: "scheduler-worker-rework-plan-1",
        reservationIntentId: "reservation-intent-1",
        claimIntentId: "claim-intent-1",
        reworkTaskRunId: "task-run-rework-1",
        reworkWorkerLeaseId: "worker-lease-rework-1",
        worktreeId: "worktree-1",
        reworkRunId: "run-rework-1",
      },
    };
    expect(validateWorkflowActionRequiredTargets(workerReworkStartRequest)).toEqual([]);
    expect(validateWorkflowActionRequiredTargets({
      actionType: "planning.scheduler.worker.rework-start-first",
      schedulerRunId: "scheduler-run-1",
    }).map((item) => item.label)).toEqual(["schedulerWorkerReworkPlanId"]);
    expect(workflowActionTargetId(workerReworkStartRequest, workerReworkStartRequest.changeId, workerReworkStart)).toBe("scheduler-worker-rework-start-1");
    expect(workflowActionScopePayload(workerReworkStartRequest, workerReworkStartRequest.changeId, workerReworkStart)).toMatchObject({
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "scheduler-claim-reservation-1",
      schedulerWorkerStartId: "scheduler-worker-start-1",
      schedulerWorkerResultId: "scheduler-worker-result-1",
      schedulerWorkerValidationId: "scheduler-worker-validation-1",
      schedulerWorkerAuditId: "scheduler-worker-audit-1",
      schedulerWorkerReworkPlanId: "scheduler-worker-rework-plan-1",
      schedulerWorkerReworkStartId: "scheduler-worker-rework-start-1",
      reservationIntentId: "reservation-intent-1",
      claimIntentId: "claim-intent-1",
      taskRunId: "task-run-rework-1",
      workerLeaseId: "worker-lease-rework-1",
      worktreeId: "worktree-1",
      runId: "run-rework-1",
    });
    expect(workflowActionScopesMatchStrict(workerReworkStartRequest, { ...workerReworkStartRequest })).toBe(true);
    expect(workflowActionScopesMatchStrict(workerReworkStartRequest, { ...workerReworkStartRequest, schedulerWorkerReworkPlanId: undefined })).toBe(false);
    expect(workflowActionScopesMatchCompatible(workerReworkStartRequest, { ...workerReworkStartRequest, schedulerWorkerReworkPlanId: undefined })).toBe(true);

    const workerReworkResultRequest = {
      actionType: "planning.scheduler.worker.rework-reconcile-result",
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "scheduler-claim-reservation-1",
      schedulerWorkerStartId: "scheduler-worker-start-1",
      schedulerWorkerResultId: "scheduler-worker-result-1",
      schedulerWorkerValidationId: "scheduler-worker-validation-1",
      schedulerWorkerAuditId: "scheduler-worker-audit-1",
      schedulerWorkerReworkPlanId: "scheduler-worker-rework-plan-1",
      schedulerWorkerReworkStartId: "scheduler-worker-rework-start-1",
      reservationIntentId: "reservation-intent-1",
      claimIntentId: "claim-intent-1",
      taskRunId: "task-run-rework-1",
      workerLeaseId: "worker-lease-rework-1",
      worktreeId: "worktree-1",
      runId: "run-rework-1",
    };
    const workerReworkResult = {
      result: {
        id: "scheduler-worker-rework-result-1",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "scheduler-claim-reservation-1",
        schedulerWorkerStartId: "scheduler-worker-start-1",
        schedulerWorkerResultId: "scheduler-worker-result-1",
        schedulerWorkerValidationId: "scheduler-worker-validation-1",
        schedulerWorkerAuditId: "scheduler-worker-audit-1",
        schedulerWorkerReworkPlanId: "scheduler-worker-rework-plan-1",
        schedulerWorkerReworkStartId: "scheduler-worker-rework-start-1",
        reservationIntentId: "reservation-intent-1",
        claimIntentId: "claim-intent-1",
        reworkTaskRunId: "task-run-rework-1",
        reworkWorkerLeaseId: "worker-lease-rework-1",
        worktreeId: "worktree-1",
        reworkRunId: "run-rework-1",
      },
    };
    expect(validateWorkflowActionRequiredTargets(workerReworkResultRequest)).toEqual([]);
    expect(validateWorkflowActionRequiredTargets({
      actionType: "planning.scheduler.worker.rework-reconcile-result",
      schedulerRunId: "scheduler-run-1",
    }).map((item) => item.label)).toEqual(["schedulerWorkerReworkStartId"]);
    expect(workflowActionTargetId(workerReworkResultRequest, workerReworkResultRequest.changeId, workerReworkResult)).toBe("scheduler-worker-rework-result-1");
    expect(workflowActionScopePayload(workerReworkResultRequest, workerReworkResultRequest.changeId, workerReworkResult)).toMatchObject({
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "scheduler-claim-reservation-1",
      schedulerWorkerStartId: "scheduler-worker-start-1",
      schedulerWorkerResultId: "scheduler-worker-result-1",
      schedulerWorkerValidationId: "scheduler-worker-validation-1",
      schedulerWorkerAuditId: "scheduler-worker-audit-1",
      schedulerWorkerReworkPlanId: "scheduler-worker-rework-plan-1",
      schedulerWorkerReworkStartId: "scheduler-worker-rework-start-1",
      schedulerWorkerReworkResultId: "scheduler-worker-rework-result-1",
      reservationIntentId: "reservation-intent-1",
      claimIntentId: "claim-intent-1",
      taskRunId: "task-run-rework-1",
      workerLeaseId: "worker-lease-rework-1",
      worktreeId: "worktree-1",
      runId: "run-rework-1",
    });
    expect(workflowActionScopesMatchStrict(workerReworkResultRequest, { ...workerReworkResultRequest })).toBe(true);
    expect(workflowActionScopesMatchStrict(workerReworkResultRequest, { ...workerReworkResultRequest, schedulerWorkerReworkStartId: undefined })).toBe(false);
    expect(workflowActionScopesMatchCompatible(workerReworkResultRequest, { ...workerReworkResultRequest, schedulerWorkerReworkStartId: undefined })).toBe(true);

    const workerReworkValidationRequest = {
      ...workerReworkResultRequest,
      actionType: "planning.scheduler.worker.rework-validate-first",
      schedulerWorkerReworkResultId: "scheduler-worker-rework-result-1",
    };
    const workerReworkValidationResult = {
      schedulerReworkValidation: {
        id: "scheduler-worker-rework-validation-1",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "scheduler-claim-reservation-1",
        schedulerWorkerStartId: "scheduler-worker-start-1",
        schedulerWorkerResultId: "scheduler-worker-result-1",
        schedulerWorkerValidationId: "scheduler-worker-validation-1",
        schedulerWorkerAuditId: "scheduler-worker-audit-1",
        schedulerWorkerReworkPlanId: "scheduler-worker-rework-plan-1",
        schedulerWorkerReworkStartId: "scheduler-worker-rework-start-1",
        schedulerWorkerReworkResultId: "scheduler-worker-rework-result-1",
        reservationIntentId: "reservation-intent-1",
        claimIntentId: "claim-intent-1",
        reworkTaskRunId: "task-run-rework-1",
        reworkWorkerLeaseId: "worker-lease-rework-1",
        worktreeId: "worktree-1",
        reworkRunId: "run-rework-1",
        validationRunId: "validation-rework-1",
      },
    };
    expect(validateWorkflowActionRequiredTargets(workerReworkValidationRequest)).toEqual([]);
    expect(validateWorkflowActionRequiredTargets({
      actionType: "planning.scheduler.worker.rework-validate-first",
      schedulerRunId: "scheduler-run-1",
    }).map((item) => item.label)).toEqual(["schedulerWorkerReworkResultId"]);
    expect(workflowActionTargetId(workerReworkValidationRequest, workerReworkValidationRequest.changeId, workerReworkValidationResult)).toBe("scheduler-worker-rework-validation-1");
    expect(workflowActionScopePayload(workerReworkValidationRequest, workerReworkValidationRequest.changeId, workerReworkValidationResult)).toMatchObject({
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "scheduler-claim-reservation-1",
      schedulerWorkerStartId: "scheduler-worker-start-1",
      schedulerWorkerResultId: "scheduler-worker-result-1",
      schedulerWorkerValidationId: "scheduler-worker-validation-1",
      schedulerWorkerAuditId: "scheduler-worker-audit-1",
      schedulerWorkerReworkPlanId: "scheduler-worker-rework-plan-1",
      schedulerWorkerReworkStartId: "scheduler-worker-rework-start-1",
      schedulerWorkerReworkResultId: "scheduler-worker-rework-result-1",
      schedulerWorkerReworkValidationId: "scheduler-worker-rework-validation-1",
      reservationIntentId: "reservation-intent-1",
      claimIntentId: "claim-intent-1",
      taskRunId: "task-run-rework-1",
      workerLeaseId: "worker-lease-rework-1",
      worktreeId: "worktree-1",
      runId: "run-rework-1",
      reworkValidationRunId: "validation-rework-1",
    });
    expect(workflowActionScopesMatchStrict(workerReworkValidationRequest, { ...workerReworkValidationRequest })).toBe(true);
    expect(workflowActionScopesMatchStrict(workerReworkValidationRequest, { ...workerReworkValidationRequest, schedulerWorkerReworkResultId: undefined })).toBe(false);
    expect(workflowActionScopesMatchCompatible(workerReworkValidationRequest, { ...workerReworkValidationRequest, schedulerWorkerReworkResultId: undefined })).toBe(true);

    const workerReworkAuditRequest = {
      ...workerReworkValidationRequest,
      actionType: "planning.scheduler.worker.rework-audit-first",
      schedulerWorkerReworkValidationId: "scheduler-worker-rework-validation-1",
      reworkValidationRunId: "validation-rework-1",
    };
    const workerReworkAuditResult = {
      schedulerReworkAudit: {
        id: "scheduler-worker-rework-audit-1",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "scheduler-claim-reservation-1",
        schedulerWorkerStartId: "scheduler-worker-start-1",
        schedulerWorkerResultId: "scheduler-worker-result-1",
        schedulerWorkerValidationId: "scheduler-worker-validation-1",
        schedulerWorkerAuditId: "scheduler-worker-audit-1",
        schedulerWorkerReworkPlanId: "scheduler-worker-rework-plan-1",
        schedulerWorkerReworkStartId: "scheduler-worker-rework-start-1",
        schedulerWorkerReworkResultId: "scheduler-worker-rework-result-1",
        schedulerWorkerReworkValidationId: "scheduler-worker-rework-validation-1",
        reservationIntentId: "reservation-intent-1",
        claimIntentId: "claim-intent-1",
        reworkTaskRunId: "task-run-rework-1",
        reworkWorkerLeaseId: "worker-lease-rework-1",
        worktreeId: "worktree-1",
        reworkRunId: "run-rework-1",
        validationRunId: "validation-rework-1",
        auditRunId: "audit-rework-1",
      },
    };
    expect(validateWorkflowActionRequiredTargets(workerReworkAuditRequest)).toEqual([]);
    expect(validateWorkflowActionRequiredTargets({
      actionType: "planning.scheduler.worker.rework-audit-first",
      schedulerRunId: "scheduler-run-1",
    }).map((item) => item.label)).toEqual(["schedulerWorkerReworkValidationId"]);
    expect(workflowActionTargetId(workerReworkAuditRequest, workerReworkAuditRequest.changeId, workerReworkAuditResult)).toBe("scheduler-worker-rework-audit-1");
    expect(workflowActionScopePayload(workerReworkAuditRequest, workerReworkAuditRequest.changeId, workerReworkAuditResult)).toMatchObject({
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "scheduler-claim-reservation-1",
      schedulerWorkerStartId: "scheduler-worker-start-1",
      schedulerWorkerResultId: "scheduler-worker-result-1",
      schedulerWorkerValidationId: "scheduler-worker-validation-1",
      schedulerWorkerAuditId: "scheduler-worker-audit-1",
      schedulerWorkerReworkPlanId: "scheduler-worker-rework-plan-1",
      schedulerWorkerReworkStartId: "scheduler-worker-rework-start-1",
      schedulerWorkerReworkResultId: "scheduler-worker-rework-result-1",
      schedulerWorkerReworkValidationId: "scheduler-worker-rework-validation-1",
      schedulerWorkerReworkAuditId: "scheduler-worker-rework-audit-1",
      reservationIntentId: "reservation-intent-1",
      claimIntentId: "claim-intent-1",
      taskRunId: "task-run-rework-1",
      workerLeaseId: "worker-lease-rework-1",
      worktreeId: "worktree-1",
      runId: "run-rework-1",
      reworkValidationRunId: "validation-rework-1",
      auditRunId: "audit-rework-1",
      reworkAuditRunId: "audit-rework-1",
    });
    expect(workflowActionScopesMatchStrict(workerReworkAuditRequest, { ...workerReworkAuditRequest })).toBe(true);
    expect(workflowActionScopesMatchStrict(workerReworkAuditRequest, { ...workerReworkAuditRequest, schedulerWorkerReworkValidationId: undefined })).toBe(false);
    expect(workflowActionScopesMatchCompatible(workerReworkAuditRequest, { ...workerReworkAuditRequest, schedulerWorkerReworkValidationId: undefined })).toBe(true);

    const integrationCandidateRequest = {
      changeId: "change-1",
      actionType: "planning.scheduler.integration-candidate.compile",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "scheduler-claim-reservation-1",
      schedulerReconcileSnapshotId: "scheduler-reconcile-1",
    };
    const integrationCandidateResult = {
      candidate: {
        id: "scheduler-integration-candidate-1",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "scheduler-claim-reservation-1",
        schedulerReconcileSnapshotId: "scheduler-reconcile-1",
      },
    };
    expect(validateWorkflowActionRequiredTargets(integrationCandidateRequest)).toEqual([]);
    expect(validateWorkflowActionRequiredTargets({
      actionType: "planning.scheduler.integration-candidate.compile",
      schedulerClaimReservationId: "scheduler-claim-reservation-1",
    }).map((item) => item.label)).toEqual(["schedulerRunId"]);
    expect(workflowActionTargetId(integrationCandidateRequest, integrationCandidateRequest.changeId, integrationCandidateResult)).toBe("scheduler-integration-candidate-1");
    expect(workflowActionScopePayload(integrationCandidateRequest, integrationCandidateRequest.changeId, integrationCandidateResult)).toMatchObject({
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "scheduler-claim-reservation-1",
      schedulerReconcileSnapshotId: "scheduler-reconcile-1",
      schedulerIntegrationCandidateId: "scheduler-integration-candidate-1",
    });
    expect(workflowActionScopesMatchStrict(integrationCandidateRequest, { ...integrationCandidateRequest })).toBe(true);
    expect(workflowActionScopesMatchStrict(integrationCandidateRequest, { ...integrationCandidateRequest, schedulerRunId: undefined })).toBe(false);
    expect(workflowActionScopesMatchCompatible(integrationCandidateRequest, { ...integrationCandidateRequest, schedulerRunId: undefined })).toBe(true);

    const integrationCheckRequest = {
      changeId: "change-1",
      actionType: "planning.scheduler.integration-check.run",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "scheduler-claim-reservation-1",
      schedulerReconcileSnapshotId: "scheduler-reconcile-1",
      schedulerIntegrationCandidateId: "scheduler-integration-candidate-1",
      worktreeIds: ["wt-a", "wt-b"],
    };
    const integrationCheckResult = {
      handoff: {
        id: "scheduler-integration-check-handoff-1",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "scheduler-claim-reservation-1",
        schedulerReconcileSnapshotId: "scheduler-reconcile-1",
        schedulerIntegrationCandidateId: "scheduler-integration-candidate-1",
        integrationCheckId: "apply-check-1",
      },
    };
    expect(validateWorkflowActionRequiredTargets(integrationCheckRequest)).toEqual([]);
    expect(validateWorkflowActionRequiredTargets({
      actionType: "planning.scheduler.integration-check.run",
      schedulerRunId: "scheduler-run-1",
    }).map((item) => item.label)).toEqual(["schedulerIntegrationCandidateId"]);
    expect(workflowActionTargetId(integrationCheckRequest, integrationCheckRequest.changeId, integrationCheckResult)).toBe("scheduler-integration-check-handoff-1");
    expect(workflowActionScopePayload(integrationCheckRequest, integrationCheckRequest.changeId, integrationCheckResult)).toMatchObject({
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "scheduler-claim-reservation-1",
      schedulerReconcileSnapshotId: "scheduler-reconcile-1",
      schedulerIntegrationCandidateId: "scheduler-integration-candidate-1",
      schedulerIntegrationCheckHandoffId: "scheduler-integration-check-handoff-1",
      applyCheckId: "apply-check-1",
    });
    expect(workflowActionScopesMatchStrict(integrationCheckRequest, { ...integrationCheckRequest })).toBe(true);
    expect(workflowActionScopesMatchStrict(integrationCheckRequest, { ...integrationCheckRequest, schedulerIntegrationCandidateId: undefined })).toBe(false);
    expect(workflowActionScopesMatchCompatible(integrationCheckRequest, { ...integrationCheckRequest, schedulerIntegrationCandidateId: undefined })).toBe(true);

    const integrationOutcomeRequest = {
      changeId: "change-1",
      actionType: "planning.scheduler.integration-outcome.reconcile",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "scheduler-claim-reservation-1",
      schedulerReconcileSnapshotId: "scheduler-reconcile-1",
      schedulerIntegrationCandidateId: "scheduler-integration-candidate-1",
      schedulerIntegrationCheckHandoffId: "scheduler-integration-check-handoff-1",
      worktreeIds: ["wt-a", "wt-b"],
    };
    const integrationOutcomeResult = {
      outcome: {
        id: "scheduler-integration-outcome-1",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "scheduler-claim-reservation-1",
        schedulerReconcileSnapshotId: "scheduler-reconcile-1",
        schedulerIntegrationCandidateId: "scheduler-integration-candidate-1",
        schedulerIntegrationCheckHandoffId: "scheduler-integration-check-handoff-1",
        integrationCheckId: "apply-check-1",
      },
    };
    expect(validateWorkflowActionRequiredTargets(integrationOutcomeRequest)).toEqual([]);
    expect(validateWorkflowActionRequiredTargets({
      actionType: "planning.scheduler.integration-outcome.reconcile",
      schedulerRunId: "scheduler-run-1",
    }).map((item) => item.label)).toEqual(["schedulerIntegrationCheckHandoffId"]);
    expect(workflowActionTargetId(integrationOutcomeRequest, integrationOutcomeRequest.changeId, integrationOutcomeResult)).toBe("scheduler-integration-outcome-1");
    expect(workflowActionScopePayload(integrationOutcomeRequest, integrationOutcomeRequest.changeId, integrationOutcomeResult)).toMatchObject({
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "scheduler-claim-reservation-1",
      schedulerReconcileSnapshotId: "scheduler-reconcile-1",
      schedulerIntegrationCandidateId: "scheduler-integration-candidate-1",
      schedulerIntegrationCheckHandoffId: "scheduler-integration-check-handoff-1",
      schedulerIntegrationOutcomeId: "scheduler-integration-outcome-1",
      applyCheckId: "apply-check-1",
    });
    expect(workflowActionScopesMatchStrict(integrationOutcomeRequest, { ...integrationOutcomeRequest })).toBe(true);
    expect(workflowActionScopesMatchStrict(integrationOutcomeRequest, { ...integrationOutcomeRequest, schedulerIntegrationCheckHandoffId: undefined })).toBe(false);
    expect(workflowActionScopesMatchCompatible(integrationOutcomeRequest, { ...integrationOutcomeRequest, schedulerIntegrationCheckHandoffId: undefined })).toBe(true);

    const runCompletionRequest = {
      changeId: "change-1",
      actionType: "planning.scheduler.run.complete",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "scheduler-claim-reservation-1",
      schedulerReconcileSnapshotId: "scheduler-reconcile-1",
      schedulerIntegrationCandidateId: "scheduler-integration-candidate-1",
      schedulerIntegrationCheckHandoffId: "scheduler-integration-check-handoff-1",
      schedulerIntegrationOutcomeId: "scheduler-integration-outcome-1",
      worktreeIds: ["wt-a", "wt-b"],
    };
    const runCompletionResult = {
      completion: {
        id: "scheduler-run-completion-1",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "scheduler-claim-reservation-1",
        schedulerReconcileSnapshotId: "scheduler-reconcile-1",
        schedulerIntegrationCandidateId: "scheduler-integration-candidate-1",
        schedulerIntegrationCheckHandoffId: "scheduler-integration-check-handoff-1",
        schedulerIntegrationOutcomeId: "scheduler-integration-outcome-1",
        integrationCheckId: "apply-check-1",
      },
    };
    expect(validateWorkflowActionRequiredTargets(runCompletionRequest)).toEqual([]);
    expect(validateWorkflowActionRequiredTargets({
      actionType: "planning.scheduler.run.complete",
      schedulerRunId: "scheduler-run-1",
    }).map((item) => item.label)).toEqual(["schedulerIntegrationOutcomeId"]);
    expect(workflowActionTargetId(runCompletionRequest, runCompletionRequest.changeId, runCompletionResult)).toBe("scheduler-run-completion-1");
    expect(workflowActionScopePayload(runCompletionRequest, runCompletionRequest.changeId, runCompletionResult)).toMatchObject({
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "scheduler-claim-reservation-1",
      schedulerReconcileSnapshotId: "scheduler-reconcile-1",
      schedulerIntegrationCandidateId: "scheduler-integration-candidate-1",
      schedulerIntegrationCheckHandoffId: "scheduler-integration-check-handoff-1",
      schedulerIntegrationOutcomeId: "scheduler-integration-outcome-1",
      schedulerRunCompletionId: "scheduler-run-completion-1",
      applyCheckId: "apply-check-1",
    });
    expect(workflowActionScopesMatchStrict(runCompletionRequest, { ...runCompletionRequest })).toBe(true);
    expect(workflowActionScopesMatchStrict(runCompletionRequest, { ...runCompletionRequest, schedulerIntegrationOutcomeId: undefined })).toBe(false);
    expect(workflowActionScopesMatchCompatible(runCompletionRequest, { ...runCompletionRequest, schedulerIntegrationOutcomeId: undefined })).toBe(true);

    const runCloseoutRequest = {
      changeId: "change-1",
      actionType: "planning.scheduler.run.close-blocked",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "scheduler-claim-reservation-1",
      schedulerReconcileSnapshotId: "scheduler-reconcile-1",
      schedulerIntegrationCandidateId: "scheduler-integration-candidate-1",
      worktreeIds: ["wt-a"],
    };
    const runCloseoutResult = {
      closeout: {
        id: "scheduler-run-closeout-1",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "scheduler-claim-reservation-1",
        schedulerReconcileSnapshotId: "scheduler-reconcile-1",
        schedulerIntegrationCandidateId: "scheduler-integration-candidate-1",
      },
    };
    expect(validateWorkflowActionRequiredTargets(runCloseoutRequest)).toEqual([]);
    expect(validateWorkflowActionRequiredTargets({
      actionType: "planning.scheduler.run.close-blocked",
      schedulerRunId: "scheduler-run-1",
    }).map((item) => item.label)).toEqual(["schedulerClaimReservationId", "schedulerIntegrationCandidateId"]);
    expect(workflowActionTargetId(runCloseoutRequest, runCloseoutRequest.changeId, runCloseoutResult)).toBe("scheduler-run-closeout-1");
    expect(workflowActionScopePayload(runCloseoutRequest, runCloseoutRequest.changeId, runCloseoutResult)).toMatchObject({
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "scheduler-claim-reservation-1",
      schedulerReconcileSnapshotId: "scheduler-reconcile-1",
      schedulerIntegrationCandidateId: "scheduler-integration-candidate-1",
      schedulerRunBlockedCloseoutId: "scheduler-run-closeout-1",
    });
    expect(workflowActionScopesMatchStrict(runCloseoutRequest, { ...runCloseoutRequest })).toBe(true);
    expect(workflowActionScopesMatchStrict(runCloseoutRequest, { ...runCloseoutRequest, schedulerIntegrationCandidateId: undefined })).toBe(false);
    expect(workflowActionScopesMatchCompatible(runCloseoutRequest, { ...runCloseoutRequest, schedulerIntegrationCandidateId: undefined })).toBe(true);
  });

  it("keeps graph ids in target and audit scope matching", () => {
    const request = {
      changeId: "change-1",
      decompositionPlanId: "decomposition-1",
      readinessManifestId: "readiness-1",
      taskQueueProposalId: "proposal-1",
      workflowGraphPlanId: "graph-1",
      workflowRunId: "workflow-1",
      queueRunId: "queue-1",
    };

    expect(workflowActionTargetId(request, request.changeId)).toBe("workflow-1");
    expect(workflowActionScopePayload(request, request.changeId, { graph: { id: "graph-1" } })).toMatchObject({
      changeId: "change-1",
      decompositionPlanId: "decomposition-1",
      readinessManifestId: "readiness-1",
      taskQueueProposalId: "proposal-1",
      workflowGraphPlanId: "graph-1",
      workflowRunId: "workflow-1",
      queueRunId: "queue-1",
    });
    expect(workflowActionScopesMatch(request, { ...request })).toBe(true);
    expect(workflowActionScopesMatchStrict(request, { ...request })).toBe(true);
    expect(workflowActionScopesMatch(request, { ...request, workflowGraphPlanId: "graph-2" })).toBe(false);
    expect(workflowActionScopesMatchStrict(request, { ...request, readinessManifestId: undefined })).toBe(false);
    expect(workflowActionScopesMatchCompatible(request, { ...request, readinessManifestId: undefined })).toBe(true);
  });

  it("requires exact targets for task and taskqueue workflow actions", () => {
    expect(validateWorkflowActionRequiredTargets({ actionType: "task.run.start", taskRunId: "taskrun-1" }).map((item) => item.label)).toEqual(["single taskIds[0]"]);
    expect(validateWorkflowActionRequiredTargets({ actionType: "task.run.retry", taskIds: ["T-001"] }).map((item) => item.label)).toEqual(["taskRunId"]);
    expect(validateWorkflowActionRequiredTargets({
      actionType: "task.queue.start",
      workflowRunId: "workflow-1",
      queueRunId: "queue-1",
      taskQueueProposalId: "proposal-1",
      workflowGraphPlanId: "graph-1",
      readinessManifestId: "readiness-1",
      decompositionPlanId: "decomposition-1",
    })).toEqual([]);
    expect(validateWorkflowActionRequiredTargets({
      actionType: "planning.taskqueue.confirm-start",
      taskQueueProposalId: "proposal-1",
      workflowGraphPlanId: "graph-1",
    }).map((item) => item.label)).toEqual(["readinessManifestId", "decompositionPlanId"]);
  });

  it("keeps landing and PR draft target rules aligned with execution scopes", () => {
    expect(validateWorkflowActionRequiredTargets({ actionType: "landing.review", worktreeId: "worktree-1" }).map((item) => item.label)).toEqual(["landingPackageId"]);
    expect(validateWorkflowActionRequiredTargets({ actionType: "landing.review", landingPackageId: "landing-1" })).toEqual([]);
    expect(validateWorkflowActionRequiredTargets({ actionType: "landing.prepare", worktreeIds: ["worktree-1"] }).map((item) => item.label)).toEqual(["applyCheckId or worktreeId"]);
    expect(validateWorkflowActionRequiredTargets({ actionType: "landing.refresh", worktreeIds: ["worktree-1"] }).map((item) => item.label)).toEqual(["applyCheckId or worktreeId"]);
    expect(validateWorkflowActionRequiredTargets({ actionType: "landing.prepare", worktreeId: "worktree-1" })).toEqual([]);
    expect(validateWorkflowActionRequiredTargets({ actionType: "landing.refresh", applyCheckId: "apply-1" })).toEqual([]);
    expect(validateWorkflowActionRequiredTargets({ actionType: "landing-queue.refresh" })).toEqual([]);
    expect(validateWorkflowActionRequiredTargets({ actionType: "landing-queue.merge-next" }).map((item) => item.label)).toEqual(["landingPackageId"]);
    expect(validateWorkflowActionRequiredTargets({ actionType: "landing-queue.merge-next", landingPackageId: "landing-1" })).toEqual([]);
    expect(REVALIDATED_WORKFLOW_ACTION_TYPES).toContain("pr-draft.create");
  });
});
