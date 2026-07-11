import { describe, expect, it } from "vitest";
import { workflowActionPayloadFromScope } from "../../src/web/src/workflow-actions.js";

describe("web workflow action payload helpers", () => {
  it("preserves accepted graph scope for paused TaskQueue resume", () => {
    expect(workflowActionPayloadFromScope({
      workflowRunId: "workflow-1",
      queueRunId: "queue-1",
      workflowGraphPlanId: "graph-1",
    })).toEqual({
      workflowRunId: "workflow-1",
      queueRunId: "queue-1",
      workflowGraphPlanId: "graph-1",
    });
  });

  it("preserves direct Scheduler worker target ids", () => {
    expect(workflowActionPayloadFromScope({
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "claim-reservation-1",
      reservationIntentId: "reservation-1",
      claimIntentId: "claim-1",
    })).toEqual({
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "claim-reservation-1",
      reservationIntentId: "reservation-1",
      claimIntentId: "claim-1",
    });
  });
});
