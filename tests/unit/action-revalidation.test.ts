import { describe, expect, it, vi } from "vitest";
import { assertCurrentWorkflowAction } from "../../src/workbench/actions/current-action-revalidation.js";

function snapshot(action: Record<string, unknown>) {
  return {
    center: { workpad: { nextAction: action } },
    right: {
      confirmationQueue: { primary: null, current: [], otherDemands: [], maintenance: [] },
      agentWorkspace: { agents: [] },
    },
  };
}

describe("Workbench action revalidation", () => {
  it("accepts the exact current visible workflow target", async () => {
    const getWorkbenchSnapshot = vi.fn(async () => snapshot({
      kind: "workflow-action",
      actionType: "planning.decompose",
      changeId: "change-1",
      enabled: true,
    }));
    await expect(assertCurrentWorkflowAction(
      { project: null, path: "project" },
      { actionType: "planning.decompose", changeId: "change-1" },
      { getWorkbenchSnapshot },
    )).resolves.toBeUndefined();
  });

  it("rejects stale or disabled visible workflow targets", async () => {
    const getWorkbenchSnapshot = vi.fn(async () => snapshot({
      kind: "workflow-action",
      actionType: "planning.decompose",
      changeId: "change-2",
      enabled: false,
    }));
    await expect(assertCurrentWorkflowAction(
      { project: null, path: "project" },
      { actionType: "planning.decompose", changeId: "change-1" },
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
