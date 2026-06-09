import { existsSync } from "node:fs";
import { join } from "node:path";
import { recordToolEventAuditEntry } from "../../agent-task/boundary-audit.js";
import { evaluateToolPolicy, highImpactActions } from "../../agent-task/tool-policy.js";
import { getChangeStatusForChange } from "../../change/manager.js";
import { getActiveChanges } from "../../ecl/index.js";
import { resolveProjectMemory } from "../../memory/resolver.js";
import { latestLandingQueueSnapshot } from "../../landing-queue/manager.js";
import { listTaskQueues } from "../../task-queue/manager.js";
import { listTaskRuns } from "../../task-run/manager.js";
import type { ManagedProject, ResolvedMemory } from "../../types/index.js";
import { assertKnownTaskIds, requireSingleTaskId, requireTaskRunId } from "../../workflow-runtime/code-workflow.js";
import {
  readLatestDecompositionPlan,
  readLatestDecompositionReadinessManifest,
  readLatestTaskQueueProposal,
  readLatestWorkflowGraphPlan,
} from "../../workflow-artifacts/manager.js";
import {
  assertWorkflowActionRequiredTargets,
  workflowActionScopePayload as buildWorkflowActionScopePayload,
  workflowActionScopesMatchStrict,
  workflowActionTargetId as buildWorkflowActionTargetId,
} from "../../workflow-actions/registry.js";
import { readWorkflowRun } from "../../workflow-run/manager.js";
import type { WorkbenchLiveSink, WorkbenchWorkflowActionRequest } from "../types.js";
import { readLatestPlanningBundle } from "./planning-bundle.js";

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

export async function auditHighImpactWorkflowAction(project: ManagedProject, changeId: string, request: WorkbenchWorkflowActionRequest, live?: WorkbenchLiveSink): Promise<void> {
  if (!HIGH_IMPACT_WORKBENCH_ACTIONS.has(request.actionType)) return;
  const memory = await resolveProjectMemory(project);
  await assertCurrentHighImpactWorkflowTarget(memory, changeId, request);
  const targetId = workflowActionTargetId(request, changeId);
  const scope = workflowActionScopePayload(request, changeId);
  const decision = evaluateToolPolicy({
    actionType: request.actionType,
    actorRoleId: "main-agent",
    changeId,
    conversationId: changeId,
    targetId,
    enforcementMode: "broker-enforced",
  });
  const artifact = await recordToolEventAuditEntry(memory, {
    changeId,
    conversationId: changeId,
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
  if (request.actionType === "planning.confirm-execution") {
    const active = await getActiveChanges(memory);
    const target = active.find((item) => item.name === changeId);
    if (!target) throw new Error(`planning.confirm-execution target is stale or missing active Change: ${changeId}.`);
    if (!request.planningBundleId) throw new Error("planning.confirm-execution requires planningBundleId.");
    const bundle = await readLatestPlanningBundle(memory, target.path);
    if (bundle.id !== request.planningBundleId || bundle.status !== "draft" || !existsSync(join(memory.memoryRoot, target.path, "planning", "latest-bundle.json"))) {
      throw new Error("planning.confirm-execution target is stale or no longer confirmable.");
    }
  }
  if (request.actionType === "planning.decomposition.confirm") {
    const active = await getActiveChanges(memory);
    const target = active.find((item) => item.name === changeId);
    if (!target) throw new Error(`planning.decomposition.confirm target is stale or missing active Change: ${changeId}.`);
    if (!request.decompositionPlanId) throw new Error("planning.decomposition.confirm requires decompositionPlanId.");
    const plan = await readLatestDecompositionPlan(memory, target.path);
    if (plan.id !== request.decompositionPlanId || plan.status !== "draft") {
      throw new Error("planning.decomposition.confirm target is stale or no longer confirmable.");
    }
  }
  if (request.actionType === "planning.decomposition.assess-readiness") {
    const active = await getActiveChanges(memory);
    const target = active.find((item) => item.name === changeId);
    if (!target) throw new Error(`planning.decomposition.assess-readiness target is stale or missing active Change: ${changeId}.`);
    if (!request.decompositionPlanId) throw new Error("planning.decomposition.assess-readiness requires decompositionPlanId.");
    const plan = await readLatestDecompositionPlan(memory, target.path);
    if (plan.id !== request.decompositionPlanId || plan.status !== "confirmed") {
      throw new Error("planning.decomposition.assess-readiness target is stale or no longer assessable.");
    }
  }
  if (request.actionType === "planning.taskqueue.propose") {
    const active = await getActiveChanges(memory);
    const target = active.find((item) => item.name === changeId);
    if (!target) throw new Error(`planning.taskqueue.propose target is stale or missing active Change: ${changeId}.`);
    if (!request.readinessManifestId) throw new Error("planning.taskqueue.propose requires readinessManifestId.");
    const manifest = await readLatestDecompositionReadinessManifest(memory, target.path);
    if (manifest.id !== request.readinessManifestId || manifest.status !== "ready-for-sequential-taskqueue-proposal" || manifest.nextAllowedAction !== "taskqueue.proposal") {
      throw new Error("planning.taskqueue.propose target is stale or no longer proposal-ready.");
    }
  }
  if (request.actionType === "planning.workflowgraph.compile") {
    const active = await getActiveChanges(memory);
    const target = active.find((item) => item.name === changeId);
    if (!target) throw new Error(`planning.workflowgraph.compile target is stale or missing active Change: ${changeId}.`);
    if (!request.taskQueueProposalId) throw new Error("planning.workflowgraph.compile requires taskQueueProposalId.");
    if (!request.readinessManifestId) throw new Error("planning.workflowgraph.compile requires readinessManifestId.");
    const proposal = await readLatestTaskQueueProposal(memory, target.path);
    if (proposal.id !== request.taskQueueProposalId || proposal.changeId !== changeId || !["draft", "confirmed"].includes(proposal.status)) {
      throw new Error("planning.workflowgraph.compile target is stale or no longer compilable.");
    }
    const manifest = await readLatestDecompositionReadinessManifest(memory, target.path);
    if (manifest.id !== request.readinessManifestId || manifest.id !== proposal.readinessManifestId || manifest.status !== "ready-for-sequential-taskqueue-proposal") {
      throw new Error("planning.workflowgraph.compile readiness target is stale.");
    }
  }
  if (request.actionType === "planning.taskqueue.confirm-start") {
    const active = await getActiveChanges(memory);
    const target = active.find((item) => item.name === changeId);
    if (!target) throw new Error(`planning.taskqueue.confirm-start target is stale or missing active Change: ${changeId}.`);
    if (!request.taskQueueProposalId) throw new Error("planning.taskqueue.confirm-start requires taskQueueProposalId.");
    if (!request.workflowGraphPlanId) throw new Error("planning.taskqueue.confirm-start requires workflowGraphPlanId.");
    if (!request.readinessManifestId) throw new Error("planning.taskqueue.confirm-start requires readinessManifestId.");
    if (!request.decompositionPlanId) throw new Error("planning.taskqueue.confirm-start requires decompositionPlanId.");
    const proposal = await readLatestTaskQueueProposal(memory, target.path);
    if (proposal.id !== request.taskQueueProposalId || proposal.changeId !== changeId || proposal.status !== "confirmed" || proposal.decompositionPlanId !== request.decompositionPlanId || proposal.readinessManifestId !== request.readinessManifestId) {
      throw new Error("planning.taskqueue.confirm-start target is stale or no longer startable.");
    }
    const manifest = await readLatestDecompositionReadinessManifest(memory, target.path);
    if (manifest.id !== proposal.readinessManifestId || manifest.status !== "ready-for-sequential-taskqueue-proposal") {
      throw new Error("planning.taskqueue.confirm-start readiness target is stale.");
    }
    const graph = await readLatestWorkflowGraphPlan(memory, target.path);
    if (graph.id !== request.workflowGraphPlanId || graph.taskQueueProposalId !== proposal.id || graph.readinessManifestId !== manifest.id || graph.status !== "compiled") {
      throw new Error("planning.taskqueue.confirm-start graph target is stale.");
    }
  }
  if (request.actionType === "code.run" && request.taskIds?.length) {
    assertKnownTaskIds(await getChangeStatusForChange(memory, changeId), request.taskIds, "code.run");
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
    if (!request.taskQueueProposalId) throw new Error("task.queue.start requires queueRunId for resume or taskQueueProposalId from planning.taskqueue.confirm-start.");
  }
}

export function workflowActionTargetId(request: WorkbenchWorkflowActionRequest, changeId: string, result?: unknown): string {
  return buildWorkflowActionTargetId(request, changeId, result);
}

export function workflowActionScopePayload(request: WorkbenchWorkflowActionRequest, changeId: string, result?: unknown): Record<string, unknown> {
  return buildWorkflowActionScopePayload(request, changeId, result);
}
