import { describe, expect, it, vi } from "vitest";
import { assertCurrentWorkflowAction } from "../../src/workbench/actions/current-action-revalidation.js";

function snapshot(action: Record<string, unknown>) {
  return {
    center: { workpad: { nextAction: action } },
    right: {
      confirmationQueue: { primary: null, current: [], otherDemands: [], maintenance: [] },
    },
  };
}

describe("Workbench action revalidation", () => {
  it("accepts the exact current visible workflow target", async () => {
    const getWorkbenchSnapshot = vi.fn(async () => snapshot({
      kind: "workflow-action",
      actionType: "workflow.run.start",
      changeId: "change-1",
      graphScopeId: "graph-scope-1",
      workflowGraphPlanId: "graph-1",
      enabled: true,
    }));
    await expect(assertCurrentWorkflowAction(
      { project: null, path: "project" },
      {
        actionType: "workflow.run.start",
        changeId: "change-1",
        graphScopeId: "graph-scope-1",
        workflowGraphPlanId: "graph-1",
      },
      { getWorkbenchSnapshot },
    )).resolves.toBeUndefined();
  });

  it("rejects stale or disabled visible workflow targets", async () => {
    const getWorkbenchSnapshot = vi.fn(async () => snapshot({
      kind: "workflow-action",
      actionType: "workflow.run.start",
      changeId: "change-2",
      workflowGraphPlanId: "graph-2",
      enabled: false,
    }));
    await expect(assertCurrentWorkflowAction(
      { project: null, path: "project" },
      { actionType: "workflow.run.start", changeId: "change-1", workflowGraphPlanId: "graph-1" },
      { getWorkbenchSnapshot },
    )).rejects.toThrow("stale or no longer available");
  });

  it.each([
    [{ graphScopeId: "graph-scope-2", workflowGraphPlanId: "graph-1" }, "graph scope"],
    [{ graphScopeId: "graph-scope-1", workflowGraphPlanId: "graph-2" }, "graph id"],
  ])("rejects a stale workflow start %s", async (staleScope) => {
    const getWorkbenchSnapshot = vi.fn(async () => snapshot({
      kind: "workflow-action",
      actionType: "workflow.run.start",
      changeId: "change-1",
      graphScopeId: "graph-scope-1",
      workflowGraphPlanId: "graph-1",
      enabled: true,
    }));
    await expect(assertCurrentWorkflowAction(
      { project: null, path: "project" },
      { actionType: "workflow.run.start", changeId: "change-1", ...staleScope },
      { getWorkbenchSnapshot },
    )).rejects.toThrow("stale or no longer available");
  });

  it("does not project revalidation policy onto non-revalidated actions", async () => {
    const getWorkbenchSnapshot = vi.fn();
    await expect(assertCurrentWorkflowAction(
      { project: null, path: "project" },
      { actionType: "chat.ask", changeId: "change-1" },
      { getWorkbenchSnapshot },
    )).resolves.toBeUndefined();
    expect(getWorkbenchSnapshot).not.toHaveBeenCalled();
  });
});
