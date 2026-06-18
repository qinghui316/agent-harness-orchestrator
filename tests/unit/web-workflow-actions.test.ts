import { describe, expect, it } from "vitest";
import { workflowActionPayloadFromScope } from "../../src/web/src/workflow-actions.js";

describe("web workflow action payload helpers", () => {
  it("preserves full typed scope for paused TaskQueue resume", () => {
    expect(workflowActionPayloadFromScope({
      workflowRunId: "workflow-1",
      queueRunId: "queue-1",
      taskQueueProposalId: "proposal-1",
      workflowGraphPlanId: "graph-1",
      readinessManifestId: "readiness-1",
      decompositionPlanId: "decomposition-1",
    })).toEqual({
      workflowRunId: "workflow-1",
      queueRunId: "queue-1",
      taskQueueProposalId: "proposal-1",
      workflowGraphPlanId: "graph-1",
      readinessManifestId: "readiness-1",
      decompositionPlanId: "decomposition-1",
    });
  });

  it("preserves maintenance patch proposal scope", () => {
    expect(workflowActionPayloadFromScope({
      maintenancePatchProposalId: "canonical-patch-proposal-1",
    })).toEqual({
      maintenancePatchProposalId: "canonical-patch-proposal-1",
    });
  });
});
