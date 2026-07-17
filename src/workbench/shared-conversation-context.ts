import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getChangeStatusForChange } from "../change/manager.js";
import type { ManagedProject, ResolvedMemory } from "../types/index.js";
import { listWorkflowRuns } from "../workflow-run/repository.js";
import { listTaskQueues, listTaskQueueItems } from "../task-queue/repository.js";
import { listTaskRuns } from "../task-run/repository.js";
import { listValidationResults } from "../validation/repository.js";
import { listAuditResults } from "../audit/repository.js";
import { collectWorktreeDiff } from "../audit/diff.js";
import { readLatestWorkflowGraphPlan } from "../workflow-artifacts/manager.js";
import { openWorkbenchDatabase } from "./persistence/open-workbench-database.js";
import { type StoredConversation } from "./persistence/contracts.js";
import { fromStoredThreadMessage } from "./conversation-thread-log.js";

const MAX_RECENT_COMPLETED_TURNS = 8;
const MAX_RECENT_VISIBLE_CHARACTERS = 4_000;

export interface HandoffSnapshot {
  version: "1.0";
  projectId: string;
  conversationId: string;
  graphScopeId: string | null;
  providerId: string;
  deliveredAfterCompletedTurn: number;
  deliveredThroughCompletedTurn: number;
  currentDemand: string;
  change: {
    id: string;
    active: boolean;
    state: string;
    artifactRefs: string[];
    artifactHashes: Record<string, string>;
    acceptanceCriteria: Array<{ id: string; text: string }>;
    tasks: Array<{ id: string; text: string; acIds: string[]; done: boolean }>;
  } | null;
  workflow: {
    workflowRunId: string | null;
    workflowStatus: string | null;
    queueRunId: string | null;
    queueStatus: string | null;
    recoveryKey: unknown;
    resumeReason: string | null;
    rework: { used: number; maximum: number } | null;
    graph: {
      id: string;
      mode: string;
      artifact: string;
      sourceArtifactHashes: Record<string, string>;
      nodes: Array<{ id: string; title: string; prompt: string | null; taskIds: string[]; acIds: string[]; sourceScopes: string[]; dependsOn: string[] }>;
    } | null;
    resume: {
      nodeId: string | null;
      taskId: string | null;
      taskRunId: string | null;
      nextRuntimeAction: "task.queue.start" | "workflow.run.start" | "none";
      reason: string;
    };
    nodeStates: Array<{ id: string; taskId: string; status: string; taskRunId: string | null; blockedReason: string | null; failureReason: string | null }>;
    taskRuns: Array<{ id: string; taskId: string; roleId: string; attempt: number; status: string; runId: string | null; worktreeId: string | null; leaseId: string | null; blockedReason: string | null; failureReason: string | null }>;
    activeWorktree: { id: string; checkoutPath: string; baseCommit: string; diffHash: string; expectedTree: string; changedPaths: string[]; evidenceRefs: string[] } | null;
    latestValidation: { id: string; status: string; worktreeId: string | null; worktreeDiffHash: string | null } | null;
    latestAudit: { id: string; status: string; validationId: string | null; worktreeId: string | null; worktreeDiffHash: string | null } | null;
  } | null;
  pendingUserInput: Array<{ requestKey: string; status: string }>;
  pendingConfirmations: Array<{ id: string; type: string; status: string; label: string; targetId: string | null; artifact: string | null }>;
  resumePoint: { id: string; hash: string; previousProviderId: string; targetProviderId: string; snapshot: unknown } | null;
  recentVisibleConversation: Array<{ sequence: number; role: "user" | "assistant"; text: string }>;
  createdAt: string;
}

export interface AssembledHandoff {
  snapshot: HandoffSnapshot;
  hash: string;
  context: Record<string, { kind: "application"; value: string }>;
}

export async function assembleSharedConversationContext(input: {
  project: ManagedProject;
  memory: ResolvedMemory;
  conversationId: string;
  providerId: string;
  currentUserMessage: string;
}): Promise<AssembledHandoff> {
  if (!input.memory.projectId) throw new Error("Project id is required to assemble Shared Conversation context.");
  const store = await openWorkbenchDatabase(input.memory);
  let conversation: StoredConversation;
  let deliveredAfterCompletedTurn = 0;
  let recentRows;
  let pendingConfirmations: HandoffSnapshot["pendingConfirmations"] = [];
  let resumePoint: HandoffSnapshot["resumePoint"] = null;
  try {
    const stored = store.conversations.readConversation(input.memory.projectId, input.conversationId);
    if (!stored) throw new Error(`Conversation not found: ${input.conversationId}.`);
    conversation = stored;
    deliveredAfterCompletedTurn = store.providerAttempts.readConversationProviderBinding(input.memory.projectId, input.conversationId, input.providerId)?.lastDeliveredCompletedTurn ?? 0;
    recentRows = store.timeline.listRecentSemanticMessages(input.memory.projectId, input.conversationId, 256);
    pendingConfirmations = store.decisions.listDecisions(input.memory.projectId, stored.boundChangeId ?? undefined)
      .filter((decision) => decision.status === "pending" || decision.status === "requested-changes")
      .map((decision) => ({
        id: decision.id,
        type: decision.decisionType,
        status: decision.status,
        label: decision.label,
        targetId: decision.targetId,
        artifact: decision.artifact,
      }));
    const storedResumePoint = store.providerAttempts.readLatestProviderResumePoint(input.memory.projectId, input.conversationId);
    if (storedResumePoint) {
      resumePoint = {
        id: storedResumePoint.resumePointId,
        hash: storedResumePoint.snapshotHash,
        previousProviderId: storedResumePoint.previousProviderId,
        targetProviderId: storedResumePoint.targetProviderId,
        snapshot: parseJson(storedResumePoint.snapshotJson),
      };
    }
  } finally {
    store.close();
  }
  const entries = recentRows.map(fromStoredThreadMessage);
  const recentVisibleConversation = boundedVisibleConversation(
    entries,
    deliveredAfterCompletedTurn,
    conversation.completedTurnSequence,
  );
  const pendingUserInput = entries
    .flatMap((entry) => entry.providerUserInput ? [{ requestKey: entry.providerUserInput.requestKey, status: entry.providerUserInput.status }] : [])
    .filter((request) => request.status !== "submitted");
  const change = conversation.boundChangeId
    ? await buildChangeSnapshot(input.project, input.memory, conversation.boundChangeId)
    : null;
  const workflow = conversation.boundChangeId
    ? await buildWorkflowSnapshot(input.memory, conversation.boundChangeId)
    : null;
  const snapshot: HandoffSnapshot = {
    version: "1.0",
    projectId: input.memory.projectId,
    conversationId: input.conversationId,
    graphScopeId: conversation.currentGraphScopeId,
    providerId: input.providerId,
    deliveredAfterCompletedTurn,
    deliveredThroughCompletedTurn: conversation.completedTurnSequence,
    currentDemand: input.currentUserMessage,
    change,
    workflow,
    pendingUserInput,
    pendingConfirmations,
    resumePoint,
    recentVisibleConversation,
    createdAt: new Date().toISOString(),
  };
  const serialized = JSON.stringify(snapshot);
  return {
    snapshot,
    hash: createHash("sha256").update(serialized).digest("hex"),
    context: { "aho.shared-conversation-handoff": { kind: "application", value: serialized } },
  };
}

async function buildWorkflowSnapshot(memory: ResolvedMemory, changeId: string): Promise<HandoffSnapshot["workflow"]> {
  const changePath = `harness/changes/active/${changeId}`;
  const [workflows, queues, taskRuns, validations, audits, graph] = await Promise.all([
    listWorkflowRuns(memory, changeId),
    listTaskQueues(memory, changeId),
    listTaskRuns(memory, changeId),
    listValidationResults(memory, changeId),
    listAuditResults(memory, changeId),
    readLatestWorkflowGraphPlan(memory, changePath).catch(() => null),
  ]);
  const workflow = workflows[0] ?? null;
  const queue = queues[0] ?? null;
  const items = queue ? await listTaskQueueItems(memory, changeId, queue.id) : [];
  const resumableItem = items.find((item) => item.status === "running")
    ?? items.find((item) => item.status === "blocked" || item.status === "failed")
    ?? items.find((item) => item.status === "queued")
    ?? null;
  const resumableTaskRun = resumableItem?.taskRunId
    ? taskRuns.find((run) => run.id === resumableItem.taskRunId) ?? null
    : resumableItem
      ? [...taskRuns].reverse().find((run) => run.taskId === resumableItem.taskId) ?? null
      : null;
  const scopedValidation = resumableTaskRun?.worktreeId
    ? validations.find((item) => item.worktreeId === resumableTaskRun.worktreeId) ?? null
    : null;
  const scopedAudit = resumableTaskRun?.worktreeId
    ? audits.find((item) => item.worktreeId === resumableTaskRun.worktreeId) ?? null
    : null;
  let activeWorktree: NonNullable<HandoffSnapshot["workflow"]>["activeWorktree"] = null;
  if (resumableTaskRun?.worktreeId) {
    try {
      const diff = await collectWorktreeDiff(memory, resumableTaskRun.worktreeId, changeId);
      activeWorktree = {
        id: diff.worktree.worktreeId,
        checkoutPath: diff.worktree.checkoutPath,
        baseCommit: diff.worktree.baseCommit,
        diffHash: diff.diffHash,
        expectedTree: diff.expectedTree,
        changedPaths: diff.changedPaths,
        evidenceRefs: [
          ...(resumableTaskRun.runId ? [`${memory.artifactBase}/runs/${resumableTaskRun.runId}`] : []),
          ...(scopedValidation ? [`${memory.artifactBase}/runs/${scopedValidation.id}`] : []),
          ...(scopedAudit ? [`${memory.artifactBase}/runs/${scopedAudit.id}`] : []),
        ],
      };
    } catch (error) {
      throw new Error(`Workflow 恢复证据读取失败，不能接管 TaskRun ${resumableTaskRun.id}: ${(error as Error).message}`);
    }
  }
  const graphNodeForTask = graph && resumableItem
    ? graph.nodes.find((node) => ("taskId" in node ? node.taskId === resumableItem.taskId : node.taskIds.includes(resumableItem.taskId))) ?? null
    : null;
  const nextRuntimeAction = queue?.status === "paused"
    ? "task.queue.start" as const
    : workflow?.status === "created"
        ? "workflow.run.start" as const
        : "none" as const;
  return {
    workflowRunId: workflow?.id ?? null,
    workflowStatus: workflow?.status ?? null,
    queueRunId: queue?.id ?? null,
    queueStatus: queue?.status ?? null,
    recoveryKey: workflow?.recoveryKey ?? null,
    resumeReason: queue?.pausedReason ?? workflow?.statusReason ?? null,
    rework: workflow && "reworkAttempts" in workflow
      ? { used: workflow.reworkAttempts, maximum: workflow.maxReworkAttempts }
      : null,
    graph: graph ? {
      id: graph.id,
      mode: graph.graphMode,
      artifact: graph.artifact,
      sourceArtifactHashes: graph.sourceArtifactHashes,
      nodes: graph.nodes.map((node) => ({
        id: node.id,
        title: node.title,
        prompt: node.prompt ?? null,
        taskIds: "taskIds" in node && node.taskIds?.length ? node.taskIds : "taskId" in node ? [node.taskId] : [],
        acIds: node.acIds,
        sourceScopes: node.sourceScopes,
        dependsOn: node.dependsOn ?? [],
      })),
    } : null,
    resume: {
      nodeId: graphNodeForTask?.id ?? null,
      taskId: resumableItem?.taskId ?? null,
      taskRunId: resumableTaskRun?.id ?? null,
      nextRuntimeAction,
      reason: queue?.pausedReason ?? workflow?.statusReason ?? "No paused Workflow operation requires automatic resume.",
    },
    nodeStates: items.map((item) => ({
      id: item.id,
      taskId: item.taskId,
      status: item.status,
      taskRunId: item.taskRunId ?? null,
      blockedReason: item.blockedReason ?? null,
      failureReason: item.failureReason ?? null,
    })),
    taskRuns: boundedTaskRuns(taskRuns, resumableTaskRun).map((run) => ({
      id: run.id,
      taskId: run.taskId,
      roleId: run.roleId,
      attempt: run.attempt,
      status: run.status,
      runId: run.runId ?? null,
      worktreeId: run.worktreeId ?? null,
      leaseId: run.leaseId ?? null,
      blockedReason: run.blockedReason ?? null,
      failureReason: run.failureReason ?? null,
    })),
    activeWorktree,
    latestValidation: scopedValidation ? {
      id: scopedValidation.id,
      status: scopedValidation.status,
      worktreeId: scopedValidation.worktreeId ?? null,
      worktreeDiffHash: scopedValidation.worktreeDiffHash ?? null,
    } : null,
    latestAudit: scopedAudit ? {
      id: scopedAudit.id,
      status: scopedAudit.status,
      validationId: scopedAudit.validationId ?? null,
      worktreeId: scopedAudit.worktreeId ?? null,
      worktreeDiffHash: scopedAudit.worktreeDiffHash ?? null,
    } : null,
  };
}

function boundedTaskRuns<T extends { id: string }>(taskRuns: T[], resumableTaskRun: T | null): T[] {
  const selected = new Map<string, T>();
  if (resumableTaskRun) selected.set(resumableTaskRun.id, resumableTaskRun);
  for (const run of [...taskRuns].reverse()) {
    if (selected.size >= 20) break;
    selected.set(run.id, run);
  }
  return [...selected.values()];
}

async function buildChangeSnapshot(project: ManagedProject, memory: ResolvedMemory, changeId: string): Promise<HandoffSnapshot["change"]> {
  const status = await getChangeStatusForChange(project, changeId);
  const relativeRefs = ["spec.md", "plan.md", "tasks.md"];
  const artifactRefs = relativeRefs.map((name) => `${memory.artifactBase}/changes/active/${changeId}/${name}`);
  const artifactHashes: Record<string, string> = {};
  await Promise.all(relativeRefs.map(async (name, index) => {
    const content = await readFile(join(memory.changesRoot, "active", changeId, name)).catch(() => null);
    if (content) artifactHashes[artifactRefs[index]!] = createHash("sha256").update(content).digest("hex");
  }));
  return {
    id: changeId,
    active: status.activeChanges.some((change) => change.name === changeId),
    state: status.change ? "active" : "archived-or-missing",
    artifactRefs,
    artifactHashes,
    acceptanceCriteria: status.acMap?.acceptanceCriteria.map((criterion) => ({ id: criterion.id, text: criterion.text })) ?? [],
    tasks: status.acMap?.tasks.map((task) => ({ id: task.id, text: task.text, acIds: task.acIds, done: task.done })) ?? [],
  };
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function boundedVisibleConversation(
  entries: ReturnType<typeof fromStoredThreadMessage>[],
  deliveredAfter: number,
  deliveredThrough: number,
): HandoffSnapshot["recentVisibleConversation"] {
  const candidates = entries
    .filter((entry) => entry.type === "user.message" || entry.type === "assistant.message")
    .filter((entry) => Boolean(entry.text?.trim()))
    .map((entry) => ({ sequence: entry.completedTurnSequence ?? 0, role: entry.type === "user.message" ? "user" as const : "assistant" as const, text: entry.text!.trim() }))
    .filter((entry) => entry.sequence > deliveredAfter && entry.sequence <= deliveredThrough);
  const includedSequences = new Set(
    [...new Set(candidates.map((entry) => entry.sequence))].slice(-MAX_RECENT_COMPLETED_TURNS),
  );
  const visible = candidates.filter((entry) => includedSequences.has(entry.sequence));
  let remaining = MAX_RECENT_VISIBLE_CHARACTERS;
  const bounded: HandoffSnapshot["recentVisibleConversation"] = [];
  for (const entry of [...visible].reverse()) {
    if (remaining <= 0) break;
    const text = entry.text.slice(Math.max(0, entry.text.length - remaining));
    remaining -= text.length;
    bounded.push({ ...entry, text });
  }
  return bounded.reverse();
}
