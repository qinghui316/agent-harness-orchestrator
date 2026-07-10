import { recordToolEventAuditEntry } from "../../agent-task/boundary-audit.js";
import { evaluateToolPolicy, highImpactActions } from "../../agent-task/tool-policy.js";
import { getChangeStatusForChange } from "../../change/manager.js";
import { resolveProjectMemory } from "../../memory/resolver.js";
import { latestLandingQueueSnapshot } from "../../landing-queue/manager.js";
import { listTaskQueues } from "../../task-queue/manager.js";
import { listTaskRuns } from "../../task-run/manager.js";
import type { ManagedProject, ResolvedMemory } from "../../types/index.js";
import { assertKnownTaskIds, requireSingleTaskId, requireTaskRunId } from "../../workflow-runtime/code-workflow.js";
import { readLatestWorkflowGraphPlan } from "../../workflow-artifacts/manager.js";
import {
  assertWorkflowActionRequiredTargets,
  workflowActionScopePayload as buildWorkflowActionScopePayload,
  workflowActionScopesMatchStrict,
  workflowActionTargetId as buildWorkflowActionTargetId,
} from "../../workflow-actions/registry.js";
import { readWorkflowRun } from "../../workflow-run/manager.js";
import type { WorkbenchLiveSink, WorkbenchWorkflowActionRequest } from "../types.js";
import { requireActiveChangeTarget } from "./active-target.js";

const HIGH_IMPACT_WORKBENCH_ACTIONS = new Set(highImpactActions());

export function assertWorkflowActionScope(request: WorkbenchWorkflowActionRequest): void {
  assertWorkflowActionRequiredTargets(request);
  const requireOne = (label: string, values: Array<unknown>): void => {
    if (!values.some((value) => Array.isArray(value) ? value.length > 0 : Boolean(value))) throw new Error(`${request.actionType} requires ${label}.`);
  };
  switch (request.actionType) {
    case "result.refresh-rework":
    case "result.revalidate":
    case "result.reaudit":
    case "result.refresh-status":
    case "validate.run":
    case "audit.run":
    case "spec-test.drift":
      requireOne("worktreeId", [request.worktreeId]);
      return;
    case "landing.prepare":
    case "landing.refresh":
      requireOne("applyCheckId or worktreeId", [request.applyCheckId, request.worktreeId]);
      return;
    case "landing.review":
      requireOne("landingPackageId", [request.landingPackageId]);
      return;
    case "landing-queue.refresh":
      return;
    case "landing-queue.merge-next":
      requireOne("landingPackageId", [request.landingPackageId]);
      return;
    default:
      return;
  }
}

export async function auditHighImpactWorkflowAction(project: ManagedProject, conversationId: string, changeId: string, request: WorkbenchWorkflowActionRequest, live?: WorkbenchLiveSink): Promise<void> {
  if (!HIGH_IMPACT_WORKBENCH_ACTIONS.has(request.actionType)) return;
  const memory = await resolveProjectMemory(project);
  await assertCurrentHighImpactWorkflowTarget(memory, changeId, request);
  const targetId = workflowActionTargetId(request, changeId);
  const scope = workflowActionScopePayload(request, changeId);
  const decision = evaluateToolPolicy({
    actionType: request.actionType,
    actorRoleId: "main-agent",
    changeId,
    conversationId,
    targetId,
    enforcementMode: "broker-enforced",
  });
  const artifact = await recordToolEventAuditEntry(memory, {
    changeId,
    conversationId,
    actorRoleId: "main-agent",
    actionType: request.actionType,
    targetId,
    scope,
    decision,
  });
  live?.emit({
    event: "run.status",
    data: {
      actionRunId: decision.id,
      status: decision.status === "denied" || decision.status === "unavailable" ? "failed" : "running",
      label: "ToolPolicyGate",
    },
  });
  if (decision.status === "denied" || decision.status === "unavailable") {
    throw new Error(`${decision.readableMessage} Evidence: ${artifact}`);
  }
}

async function assertCurrentHighImpactWorkflowTarget(memory: ResolvedMemory, changeId: string, request: WorkbenchWorkflowActionRequest): Promise<void> {
  if (request.actionType === "workflow.run.start") {
    const target = await requireActiveChangeTarget(memory, changeId, "workflow.run.start");
    if (!request.workflowGraphPlanId) throw new Error("workflow.run.start requires workflowGraphPlanId.");
    const graph = await readLatestWorkflowGraphPlan(memory, target.path);
    if (graph.authoringContractVersion !== "1.0" || graph.graphMode !== "sequential-v1" || graph.id !== request.workflowGraphPlanId || graph.status !== "compiled") {
      throw new Error("workflow.run.start authored graph target is stale.");
    }
  }
  if (request.actionType === "code.run") {
    await requireActiveChangeTarget(memory, changeId, "code.run");
    if (request.taskIds?.length) {
      assertKnownTaskIds(await getChangeStatusForChange(memory, changeId), request.taskIds, "code.run");
    }
  }
  if (request.actionType === "task.run.start") {
    assertKnownTaskIds(await getChangeStatusForChange(memory, changeId), [requireSingleTaskId(request.taskIds)], "task.run.start");
  }
  if (request.actionType === "task.run.retry") {
    const taskRunId = requireTaskRunId(request.taskRunId);
    const runs = await listTaskRuns(memory, changeId);
    if (!runs.some((run) => run.id === taskRunId)) throw new Error(`task.run.retry target is stale or not scoped to Change ${changeId}.`);
  }
  if (request.actionType === "landing-queue.merge-next") {
    const snapshot = await latestLandingQueueSnapshot(memory);
    const candidate = snapshot?.candidates.find((item) => item.landingPackageId === request.landingPackageId);
    if (!candidate || !candidate.canMerge || !candidate.changeIds.includes(changeId)) {
      throw new Error("landing-queue.merge-next target is stale or not currently mergeable.");
    }
  }
  if (request.actionType === "pr-draft.create") {
    if (!request.landingPackageId) throw new Error("pr-draft.create requires landingPackageId.");
  }
  if (request.actionType === "task.queue.start") {
    const queues = await listTaskQueues(memory, changeId);
    if (request.queueRunId) {
      const queue = queues.find((item) => item.id === request.queueRunId);
      if (!queue || queue.status !== "paused") throw new Error("task.queue.start target is stale or not paused.");
      if (!workflowActionScopesMatchStrict({ ...queue, queueRunId: queue.id }, request)) throw new Error("task.queue.start target scope is stale or incomplete.");
      if (!queue.workflowRunId) throw new Error("task.queue.start target has no WorkflowRun binding.");
      const workflow = await readWorkflowRun(memory, changeId, queue.workflowRunId);
      if (!workflowActionScopesMatchStrict({ ...workflow, workflowRunId: workflow.id }, request)) throw new Error("task.queue.start WorkflowRun scope is stale or incomplete.");
      return;
    }
    throw new Error("task.queue.start only resumes an existing paused graph-backed queue.");
  }
}

export function workflowActionTargetId(request: WorkbenchWorkflowActionRequest, changeId: string, result?: unknown): string {
  return buildWorkflowActionTargetId(request, changeId, result);
}

export function workflowActionScopePayload(request: WorkbenchWorkflowActionRequest, changeId: string, result?: unknown): Record<string, unknown> {
  return buildWorkflowActionScopePayload(request, changeId, result);
}
