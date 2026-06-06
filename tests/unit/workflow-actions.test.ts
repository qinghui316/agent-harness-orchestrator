import { describe, expect, it } from "vitest";
import { highImpactActions } from "../../src/agent-task/tool-policy.js";
import {
  HIGH_IMPACT_WORKFLOW_ACTION_TYPES,
  LIVE_WORKFLOW_ACTION_TYPES,
  REVALIDATED_WORKFLOW_ACTION_TYPES,
  WORKFLOW_ACTION_TYPES,
  workflowActionScopePayload,
  workflowActionScopesMatch,
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

    expect(highImpactActions()).toEqual([...HIGH_IMPACT_WORKFLOW_ACTION_TYPES].sort());
    expect(LIVE_WORKFLOW_ACTION_TYPES).toContain("planning.workflowgraph.compile");
    expect(HIGH_IMPACT_WORKFLOW_ACTION_TYPES).toContain("planning.workflowgraph.compile");
    expect(REVALIDATED_WORKFLOW_ACTION_TYPES).toContain("planning.workflowgraph.compile");
  });

  it("keeps graph ids in target and audit scope matching", () => {
    const request = {
      changeId: "change-1",
      taskQueueProposalId: "proposal-1",
      workflowGraphPlanId: "graph-1",
      workflowRunId: "workflow-1",
      queueRunId: "queue-1",
    };

    expect(workflowActionTargetId(request, request.changeId)).toBe("workflow-1");
    expect(workflowActionScopePayload(request, request.changeId, { graph: { id: "graph-1" } })).toMatchObject({
      changeId: "change-1",
      taskQueueProposalId: "proposal-1",
      workflowGraphPlanId: "graph-1",
      workflowRunId: "workflow-1",
      queueRunId: "queue-1",
    });
    expect(workflowActionScopesMatch(request, { ...request })).toBe(true);
    expect(workflowActionScopesMatch(request, { ...request, workflowGraphPlanId: "graph-2" })).toBe(false);
  });
});
