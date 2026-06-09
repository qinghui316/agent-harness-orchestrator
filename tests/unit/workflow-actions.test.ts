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
