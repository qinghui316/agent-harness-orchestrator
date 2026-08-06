import { recordToolEventAuditEntry } from "../../agent-task/boundary-audit.js";
import { evaluateToolPolicy, highImpactActions } from "../../agent-task/tool-policy.js";
import { readProjectHarnessPlanningGate } from "../../project-harness/planning-gate-query.js";
import { DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY } from "../../provider-runtime/project-harness-discovery.js";
import { resolveProjectRuntimeState } from "../../project-runtime/coordinator.js";
import { resolveProjectActiveExecutionScope } from "../../project-runtime/active-execution-scope.js";
import type {
  ProjectExecutionRuntimePort,
  ProjectHarnessExecutionPort,
} from "../../project-runtime/execution-ports.js";
import { latestLandingQueueSnapshot } from "../../landing-queue/manager.js";
import { listTaskQueues } from "../../task-queue/manager.js";
import { listTaskRuns } from "../../task-run/manager.js";
import type { ManagedProject } from "../../types/index.js";
import { assertKnownTaskIds, requireSingleTaskId, requireTaskRunId } from "../../workflow-runtime/code-workflow.js";
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
      requireOne("worktreeId", [request.worktreeId]);
      return;
    case "spec-test.propose":
    case "spec-test.generate":
    case "spec-test.drift":
      requireOne("graphScopeId", [request.graphScopeId]);
      requireOne("specTestEvidenceFingerprint", [request.specTestEvidenceFingerprint]);
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
  if (request.actionType === "workflow.run.start"
    || request.actionType === "harness-change.close"
    || request.actionType === "spec-test.generate"
    || request.actionType.startsWith("planning.scheduler.")) {
    const state = await resolveProjectRuntimeState(project, {
      discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
    });
    if (state.state !== "ready") {
      throw new Error(`Project Harness is not ready for ${request.actionType}: ${state.state}.`);
    }
    if (request.actionType === "harness-change.close") {
      if (!request.finalizationRequestId) throw new Error("harness-change.close requires finalizationRequestId.");
      await recordHighImpactToolAudit(state.resolution.paths, conversationId, changeId, request, live);
      return;
    }
    if (request.actionType.startsWith("planning.scheduler.")) {
      await recordHighImpactToolAudit(state.resolution.paths, conversationId, changeId, request, live);
      return;
    }
    if (request.actionType === "spec-test.generate") {
      await recordHighImpactToolAudit(state.resolution.paths, conversationId, changeId, request, live);
      return;
    }
    if (!request.workflowGraphPlanId) throw new Error("workflow.run.start requires workflowGraphPlanId.");
    if (!request.graphScopeId) throw new Error("workflow.run.start requires graphScopeId.");
    const evidence = await readProjectHarnessPlanningGate({
      projectId: state.resolution.harness.projectId,
      projectRoot: state.resolution.projectRoot,
      skillRoot: state.resolution.harness.skillRoot,
      conversationId,
      graphScopeId: request.graphScopeId,
      changeId,
    });
    if (evidence.graph.id !== request.workflowGraphPlanId
      || evidence.graph.authoringContractVersion !== "1.0"
      || evidence.graph.status !== "compiled") {
      throw new Error("workflow.run.start authored graph target is stale.");
    }
    await recordHighImpactToolAudit(state.resolution.paths, conversationId, changeId, request, live);
    return;
  }
  const scope = await resolveProjectActiveExecutionScope(project, changeId);
  if (scope.conversationId !== conversationId) {
    throw new Error(`${request.actionType} Conversation identity is stale.`);
  }
  await assertCurrentHighImpactWorkflowTarget(scope.runtime, scope.harness, changeId, request);
  await recordHighImpactToolAudit(scope.runtime, conversationId, changeId, request, live);
}

async function recordHighImpactToolAudit(
  memory: Parameters<typeof recordToolEventAuditEntry>[0],
  conversationId: string,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live?: WorkbenchLiveSink,
): Promise<void> {
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

async function assertCurrentHighImpactWorkflowTarget(
  memory: ProjectExecutionRuntimePort,
  harness: ProjectHarnessExecutionPort,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
): Promise<void> {
  if (request.actionType === "code.run") {
    await requireActiveChangeTarget(harness, changeId, "code.run");
    if (request.taskIds?.length) {
      assertKnownTaskIds(harness.changeStatus, request.taskIds, "code.run");
    }
  }
  if (request.actionType === "task.run.start") {
    assertKnownTaskIds(harness.changeStatus, [requireSingleTaskId(request.taskIds)], "task.run.start");
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
