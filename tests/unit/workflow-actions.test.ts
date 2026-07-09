import { describe, expect, it } from "vitest";
import {
  HIGH_IMPACT_WORKFLOW_ACTION_TYPES,
  LIVE_WORKFLOW_ACTION_TYPES,
  REVALIDATED_WORKFLOW_ACTION_TYPES,
  WORKFLOW_ACTION_TYPES,
  validateWorkflowActionRequiredTargets,
  workflowActionScopePayload,
  workflowActionScopesMatchStrict,
  workflowActionTargetId,
} from "../../src/workflow-actions/registry.js";
import {
  buildCurrentGateContract,
  classifyCurrentGateActionType,
  validateCurrentGateContract,
} from "../../src/workflow-actions/current-gate.js";

describe("workflow action registry", () => {
  it("keeps concrete Scheduler actions in canonical action sets", () => {
    expect(WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.worker.start-next");
    expect(LIVE_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.worker.start-next");
    expect(HIGH_IMPACT_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.integration-check.run");
    expect(REVALIDATED_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.run.complete");
  });

  it("requires exact Scheduler worker targets", () => {
    expect(validateWorkflowActionRequiredTargets({
      actionType: "planning.scheduler.worker.start-next",
      schedulerRunId: "run-1",
      schedulerClaimReservationId: "reservation-1",
    }).map((issue) => issue.label)).toEqual(["reservationIntentId", "claimIntentId"]);
    expect(validateWorkflowActionRequiredTargets({
      actionType: "planning.scheduler.worker.start-next",
      schedulerRunId: "run-1",
      schedulerClaimReservationId: "reservation-1",
      reservationIntentId: "intent-1",
      claimIntentId: "claim-1",
    })).toEqual([]);
  });

  it("keeps action target and audit scope aligned", () => {
    const request = {
      actionType: "planning.scheduler.worker.start-next",
      changeId: "change-1",
      schedulerRunId: "run-1",
      schedulerClaimReservationId: "reservation-1",
      reservationIntentId: "intent-1",
      claimIntentId: "claim-1",
    };
    expect(workflowActionTargetId(request, request.changeId)).toBe("reservation-1");
    expect(workflowActionScopePayload(request, request.changeId)).toMatchObject({
      changeId: request.changeId,
      schedulerRunId: request.schedulerRunId,
      schedulerClaimReservationId: request.schedulerClaimReservationId,
      reservationIntentId: request.reservationIntentId,
      claimIntentId: request.claimIntentId,
    });
    expect(workflowActionScopesMatchStrict(request, request)).toBe(true);
    expect(workflowActionScopesMatchStrict(request, { ...request, claimIntentId: "claim-2" })).toBe(false);
  });
});

describe("workflow action current-gate contract", () => {
  it("remains non-executing and rejects missing targets or authorization flags", () => {
    const contract = buildCurrentGateContract({
      source: {
        actionType: "planning.scheduler.worker.start-next",
        changeId: "change-1",
        schedulerRunId: "run-1",
        schedulerClaimReservationId: "reservation-1",
        reservationIntentId: "intent-1",
        claimIntentId: "claim-1",
        enabled: true,
        requiresConfirmation: true,
      },
    });
    expect(contract).toMatchObject({ nonExecuting: true, actionType: "planning.scheduler.worker.start-next" });
    expect(validateCurrentGateContract({
      actionType: "planning.scheduler.worker.start-next",
      schedulerRunId: "run-1",
      schedulerClaimReservationId: "reservation-1",
    }).map((issue) => issue.label)).toEqual(["reservationIntentId", "claimIntentId"]);
    expect(validateCurrentGateContract({ actionType: "chat.ask", executionStarted: true }).map((issue) => issue.label)).toContain("executionStarted");
  });

  it("classifies concrete, manual barrier, and terminal human gates", () => {
    expect(classifyCurrentGateActionType("planning.scheduler.worker.start-next")).toBe("concrete");
    expect(classifyCurrentGateActionType("planning.scheduler.integration-check.run")).toBe("manual-barrier");
    expect(classifyCurrentGateActionType("planning.scheduler.run.complete")).toBe("terminal-human-gate");
  });
});
