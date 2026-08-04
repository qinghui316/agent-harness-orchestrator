import { createHash, randomUUID } from "node:crypto";
import { listAgentTasks } from "../agent-task/repository.js";
import { defaultProviderRegistry } from "../provider-runtime/index.js";
import type { ProviderRegistry } from "../provider-runtime/registry.js";
import type { ProviderOperationProfile } from "../provider-runtime/types.js";
import { reconcileTaskQueues } from "../task-queue/reconcile.js";
import { isActiveTaskRunStatus } from "../task-run/guards.js";
import { listTaskRuns, listWorkerLeases } from "../task-run/repository.js";
import { reconcileTaskRuns } from "../task-run/reconcile.js";
import type { ManagedProject } from "../types/index.js";
import type { ProjectRuntimeResolution } from "../project-runtime/context.js";
import type { WorkbenchWorkflowActionRequest } from "./types.js";
import { reconcileDemandWorkersForAction } from "./demand-workers/orchestration.js";
import { assembleSharedConversationContext, type HandoffSnapshot } from "./shared-conversation-context.js";
import { openProjectRuntimeWorkbenchDatabase } from "./persistence/open-workbench-database.js";
import { publishAgentSurfacesInvalidated } from "./project-live-events.js";
import { type StoredConversation, type StoredProviderAttempt, type StoredProviderResumePoint } from "./persistence/contracts.js";

const ACTIVE_ATTEMPT_STATUSES = new Set(["queued", "running"]);
const PROVIDER_STOP_TIMEOUT_MS = 30_000;

export interface ProviderSwitchResult {
  conversationId: string;
  previousProviderId: string;
  selectedProviderId: string;
  graphScopeId: string | null;
  resumePointId: string;
  resumePointHash: string;
  resumeAttemptId: string;
  switchedAt: string;
}

export async function resolveProviderSwitchWorkflowResumeRequest(input: {
  project: ManagedProject;
  resolution: ProjectRuntimeResolution;
  conversationId: string;
  switchResult: ProviderSwitchResult;
}): Promise<WorkbenchWorkflowActionRequest | null> {
  if (input.switchResult.resumePointId === "unchanged") return null;
  const current = await readSwitchState(input.resolution, input.conversationId);
  if (current.conversation.selectedProviderId !== input.switchResult.selectedProviderId) return null;
  if (current.resumePoint?.resumePointId !== input.switchResult.resumePointId) return null;
  const handoff = await assembleSharedConversationContext({
    resolution: input.resolution,
    conversationId: input.conversationId,
    providerId: input.switchResult.selectedProviderId,
    currentUserMessage: "",
  });
  return workflowResumeRequestFromHandoff(handoff.snapshot);
}

export function workflowResumeRequestFromHandoff(snapshot: HandoffSnapshot): WorkbenchWorkflowActionRequest | null {
  const workflow = snapshot.workflow;
  if (!workflow || workflow.resume.nextRuntimeAction !== "task.queue.start") return null;
  if (!snapshot.change?.active || !workflow.graph || !workflow.workflowRunId || !workflow.queueRunId) return null;
  const resumableTaskRun = workflow.resume.taskRunId
    ? workflow.taskRuns.find((taskRun) => taskRun.id === workflow.resume.taskRunId)
    : null;
  if (workflow.resume.taskRunId && !resumableTaskRun) {
    throw new Error(`Workflow 恢复需要精确 TaskRun ${workflow.resume.taskRunId}，但 handoff 中缺少该证据。`);
  }
  if (resumableTaskRun?.status === "interrupted") {
    if (!resumableTaskRun.worktreeId || workflow.activeWorktree?.id !== resumableTaskRun.worktreeId || !workflow.activeWorktree.diffHash) {
      throw new Error("Workflow 已中断，但当前 worktree 或 diff 证据不完整，不能自动切换 provider 继续。");
    }
  }
  return {
    actionType: "task.queue.start",
    changeId: snapshot.change.id,
    workflowGraphPlanId: workflow.graph.id,
    workflowRunId: workflow.workflowRunId,
    queueRunId: workflow.queueRunId,
  };
}

export async function switchConversationProviderAtSafePoint(input: {
  project: ManagedProject;
  resolution: ProjectRuntimeResolution;
  conversationId: string;
  targetProviderId: string;
  registry?: ProviderRegistry;
}): Promise<ProviderSwitchResult> {
  const projectId = input.resolution.harness.projectId;
  const registry = input.registry ?? defaultProviderRegistry;
  const initial = await readSwitchState(input.resolution, input.conversationId);
  if (initial.conversation.selectedProviderId === input.targetProviderId) {
    const latest = initial.resumePoint;
    return {
      conversationId: input.conversationId,
      previousProviderId: initial.conversation.selectedProviderId,
      selectedProviderId: initial.conversation.selectedProviderId,
      graphScopeId: initial.conversation.currentGraphScopeId,
      resumePointId: latest?.resumePointId ?? "unchanged",
      resumePointHash: latest?.snapshotHash ?? "unchanged",
      resumeAttemptId: "unchanged",
      switchedAt: latest?.createdAt ?? initial.conversation.updatedAt,
    };
  }

  assertNoPendingProviderInput(initial.messages);
  const activeTasks = (await listAgentTasks(input.resolution.paths, initial.conversation.boundChangeId ?? undefined))
    .filter((task) => task.kind === "background" && (task.status === "claimed" || task.status === "running"));
  if (activeTasks.length > 0) throw new Error("当前后台 Agent 任务仍在运行，完成后才能切换 provider。");

  const preflightHandoff = await assembleSharedConversationContext({
    resolution: input.resolution,
    conversationId: input.conversationId,
    providerId: input.targetProviderId,
    currentUserMessage: "验证目标 provider 能否接管当前 Workflow。",
  });
  const preflight = await registry.requireProfiles(
    input.targetProviderId,
    requiredProfilesForResume(preflightHandoff.snapshot),
    input.project,
    input.project.path,
  );

  const scopeIds = switchRuntimeScopeIds(initial.conversation, initial.attempts);
  const activeTurns = registry.findActiveTurns(scopeIds);
  await Promise.all(activeTurns.map((turn) => turn.interrupt("用户正在安全暂停 Workflow 并切换 Agent provider。")));
  await waitForProviderTurnsToStop(registry, scopeIds);
  await fenceStoppedProviderAttempts(registry, input.resolution, input.conversationId, scopeIds);

  if (initial.conversation.boundChangeId) {
    await waitForWorkflowWritersToSettle(input.project, input.resolution, initial.conversation.boundChangeId);
    await reconcileDemandWorkersForAction(input.project);
    await assertNoActiveWorkflowWriter(input.resolution, initial.conversation.boundChangeId);
  }

  const handoff = await assembleSharedConversationContext({
    resolution: input.resolution,
    conversationId: input.conversationId,
    providerId: input.targetProviderId,
    currentUserMessage: "从已安全暂停并完成对账的 Workflow 状态继续。",
  });
  const resumePointId = `resume-${randomUUID()}`;
  const switchedAt = new Date().toISOString();
  const resumeSnapshot = {
    version: "1.0",
    resumePointId,
    previousProviderId: initial.conversation.selectedProviderId,
    targetProviderId: input.targetProviderId,
    reconciledAt: switchedAt,
    handoff: handoff.snapshot,
  };
  const snapshotJson = JSON.stringify(resumeSnapshot);
  const snapshotHash = createHash("sha256").update(snapshotJson).digest("hex");
  const resumeAttemptId = `attempt-${resumePointId}`;
  const postReconcile = await registry.requireProfiles(
    input.targetProviderId,
    requiredProfilesForResume(handoff.snapshot),
    input.project,
    input.project.path,
  );
  const capabilitySnapshot = postReconcile.snapshot.snapshotHash === preflight.snapshot.snapshotHash
    ? preflight.snapshot
    : postReconcile.snapshot;

  const store = await openProjectRuntimeWorkbenchDatabase(input.resolution.paths);
  try {
    const point = {
      projectId,
      conversationId: input.conversationId,
      resumePointId,
      graphScopeId: initial.conversation.currentGraphScopeId,
      changeId: initial.conversation.boundChangeId,
      previousProviderId: initial.conversation.selectedProviderId,
      targetProviderId: input.targetProviderId,
      snapshotJson,
      snapshotHash,
      createdAt: switchedAt,
    };
    const existingBinding = store.providerAttempts.readConversationProviderBinding(projectId, input.conversationId, input.targetProviderId);
    store.unitOfWork.commitConversationProviderSwitch(point, existingBinding ?? {
      projectId,
      conversationId: input.conversationId,
      providerId: input.targetProviderId,
      nativeSessionId: null,
      lastDeliveredCompletedTurn: 0,
      preferredModel: null,
      lastUsedAt: null,
      bindingStatus: "ready",
    }, initial.conversation.selectedProviderId, {
      projectId,
      conversationId: input.conversationId,
      attemptId: resumeAttemptId,
      graphScopeId: initial.conversation.currentGraphScopeId,
      changeId: initial.conversation.boundChangeId,
      agentTaskId: null,
      roleId: "main-agent",
      operationProfile: "main",
      providerId: input.targetProviderId,
      nativeSessionId: existingBinding?.nativeSessionId ?? null,
      model: capabilitySnapshot.effectiveModel ? { providerId: input.targetProviderId, modelId: capabilitySnapshot.effectiveModel } : null,
      capabilitySnapshot,
      handoffHash: snapshotHash,
      deliveredThroughCompletedTurn: initial.conversation.completedTurnSequence,
      worktreeId: null,
      status: "queued",
      createdAt: switchedAt,
      updatedAt: switchedAt,
    });
    publishAgentSurfacesInvalidated(projectId, {
      conversationId: input.conversationId,
      graphScopeId: initial.conversation.currentGraphScopeId ?? undefined,
      reason: "attempt-updated",
    });
  } finally {
    store.close();
  }
  return {
    conversationId: input.conversationId,
    previousProviderId: initial.conversation.selectedProviderId,
    selectedProviderId: input.targetProviderId,
    graphScopeId: initial.conversation.currentGraphScopeId,
    resumePointId,
    resumePointHash: snapshotHash,
    resumeAttemptId,
    switchedAt,
  };
}

export function requiredProfilesForResume(snapshot: HandoffSnapshot): ProviderOperationProfile[] {
  const profiles = new Set<ProviderOperationProfile>(["main"]);
  if (snapshot.workflow?.resume.nextRuntimeAction === "task.queue.start") {
    profiles.add("coder");
    profiles.add("auditor");
  }
  return [...profiles];
}

async function waitForWorkflowWritersToSettle(project: ManagedProject, resolution: ProjectRuntimeResolution, changeId: string): Promise<void> {
  const deadline = Date.now() + PROVIDER_STOP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await reconcileTaskRuns(project, { changeId });
    await reconcileTaskQueues(project, { changeId });
    const [taskRuns, leases] = await Promise.all([listTaskRuns(resolution.paths, changeId), listWorkerLeases(resolution.paths, changeId)]);
    if (!taskRuns.some((run) => isActiveTaskRunStatus(run.status)) && !leases.some((lease) => lease.status === "claimed")) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Workflow 模型任务未能在限定时间内停止并释放写入租约，未执行 provider 切换。");
}

async function readSwitchState(resolution: ProjectRuntimeResolution, conversationId: string): Promise<{
  conversation: StoredConversation;
  attempts: StoredProviderAttempt[];
  messages: Array<{ rawJson: string }>;
  resumePoint: StoredProviderResumePoint | null;
}> {
  const projectId = resolution.harness.projectId;
  const store = await openProjectRuntimeWorkbenchDatabase(resolution.paths);
  try {
    const conversation = store.conversations.readConversation(projectId, conversationId);
    if (!conversation) throw new Error(`Conversation not found: ${conversationId}.`);
    return {
      conversation,
      attempts: store.providerAttempts.listProviderAttempts(projectId, conversationId),
      messages: store.timeline.listConversationMessages(projectId, conversationId),
      resumePoint: store.providerAttempts.readLatestProviderResumePoint(projectId, conversationId),
    };
  } finally {
    store.close();
  }
}

function assertNoPendingProviderInput(messages: Array<{ rawJson: string }>): void {
  const pending = messages.some((message) => {
    try {
      const raw = JSON.parse(message.rawJson) as { providerUserInput?: { status?: string } };
      return raw.providerUserInput?.status === "pending" || raw.providerUserInput?.status === "submitting";
    } catch {
      return false;
    }
  });
  if (pending) throw new Error("当前 Agent 正在等待你的回答，完成回答后才能切换 provider。");
}

function switchRuntimeScopeIds(conversation: StoredConversation, attempts: StoredProviderAttempt[]): Set<string> {
  return new Set([
    conversation.conversationId,
    ...(conversation.currentGraphScopeId ? [conversation.currentGraphScopeId] : []),
    ...(conversation.boundChangeId ? [conversation.boundChangeId] : []),
    ...attempts.filter((attempt) => ACTIVE_ATTEMPT_STATUSES.has(attempt.status)).flatMap((attempt) => [attempt.attemptId]),
  ]);
}

async function waitForProviderTurnsToStop(registry: ProviderRegistry, scopeIds: Set<string>): Promise<void> {
  const deadline = Date.now() + PROVIDER_STOP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const activeTurns = registry.findActiveTurns(scopeIds);
    if (activeTurns.length === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Agent provider 未能在限定时间内停止并完成对账，未执行 provider 切换。");
}

async function fenceStoppedProviderAttempts(registry: ProviderRegistry, resolution: ProjectRuntimeResolution, conversationId: string, scopeIds: Set<string>): Promise<void> {
  const projectId = resolution.harness.projectId;
  if (registry.findActiveTurns(scopeIds).length > 0) {
    throw new Error("Agent provider turn 仍在运行，不能 fencing 旧 attempt。");
  }
  const store = await openProjectRuntimeWorkbenchDatabase(resolution.paths);
  try {
    let changed = false;
    for (const attempt of store.providerAttempts.listProviderAttempts(projectId, conversationId)) {
      if (!ACTIVE_ATTEMPT_STATUSES.has(attempt.status)) continue;
      store.providerAttempts.completeProviderAttempt(projectId, attempt.attemptId, "interrupted", attempt.nativeSessionId, new Date().toISOString());
      changed = true;
    }
    if (changed) {
      const graphScopeId = store.conversations.readConversation(projectId, conversationId)?.currentGraphScopeId;
      publishAgentSurfacesInvalidated(projectId, { conversationId, graphScopeId: graphScopeId ?? undefined, reason: "provider-interrupted" });
    }
  } finally {
    store.close();
  }
}

async function assertNoActiveWorkflowWriter(resolution: ProjectRuntimeResolution, changeId: string): Promise<void> {
  const [taskRuns, leases] = await Promise.all([listTaskRuns(resolution.paths, changeId), listWorkerLeases(resolution.paths, changeId)]);
  const activeRuns = taskRuns.filter((run) => isActiveTaskRunStatus(run.status));
  const activeLeases = leases.filter((lease) => lease.status === "claimed");
  if (activeRuns.length > 0 || activeLeases.length > 0) {
    throw new Error("Workflow writer 或工作租约尚未完成 fencing，对账完成前不能切换 provider。");
  }
}
