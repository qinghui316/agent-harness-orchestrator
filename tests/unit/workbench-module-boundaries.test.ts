import { describe, expect, it } from "vitest";
import { appendTopicThreadEntry, runWorkbenchWorkflowAction } from "../../src/workbench/chat.js";
import { getWorkbenchSnapshot, getWorkbenchWorkflowGraphPlanProjection } from "../../src/workbench/manager.js";
import { readTopicThreadLog } from "../../src/workbench/thread-log.js";
import { runWorkbenchWorkflowActionService } from "../../src/workbench/actions/service.js";
import { findWorkbenchTopicPath } from "../../src/workbench/projections/typed-workflow.js";
import { startOrResumeWorkflowTaskQueue, validateWorkflowTaskQueueProposalStart } from "../../src/workflow-runtime/taskqueue.js";
import { fetchJson } from "../../src/web/src/api.js";
import { workflowActionLabel } from "../../src/web/src/action-labels.js";

describe("Workbench module boundaries", () => {
  it("keeps legacy facades available while exposing split modules", () => {
    expect(typeof appendTopicThreadEntry).toBe("function");
    expect(typeof runWorkbenchWorkflowAction).toBe("function");
    expect(typeof getWorkbenchSnapshot).toBe("function");
    expect(typeof getWorkbenchWorkflowGraphPlanProjection).toBe("function");

    expect(typeof readTopicThreadLog).toBe("function");
    expect(typeof runWorkbenchWorkflowActionService).toBe("function");
    expect(typeof startOrResumeWorkflowTaskQueue).toBe("function");
    expect(typeof validateWorkflowTaskQueueProposalStart).toBe("function");
    expect(typeof fetchJson).toBe("function");
    expect(workflowActionLabel("planning.workflowgraph.compile")).toBe("编译执行图");
  });

  it("resolves typed workflow topic paths outside the manager facade", () => {
    expect(findWorkbenchTopicPath([{ id: "change-1", name: "phase-x", path: "harness/changes/active/phase-x" }], "change-1")).toBe("harness/changes/active/phase-x");
    expect(findWorkbenchTopicPath([{ id: "change-1", name: "phase-x", path: "harness/changes/active/phase-x" }], "phase-x")).toBe("harness/changes/active/phase-x");
    expect(findWorkbenchTopicPath([{ id: "change-1", name: "phase-x", path: "harness/changes/active/phase-x" }], "missing")).toBeNull();
  });
});
