import { existsSync } from "node:fs";
import { latestLandingQueueSnapshot } from "../../../landing-queue/manager.js";
import { getMemoryStatus } from "../../../memory/status.js";
import { getProjectStatus } from "../../../project/status.js";
import { readRun } from "../../../run/manager.js";
import { providerInteractionHistory } from "../../parent-agent-transcript.js";
import { buildConversationInteractionQueue } from "../../conversation-interactions.js";
import { buildConversationInteractionAttention } from "../../conversation-interactions.js";
import { deleteConversation, hideConversation } from "../../conversation-thread.js";
import { WorkbenchStore, type StoredProviderAttempt, type StoredProviderThreadLink } from "../../store.js";
import { summarizeRunArtifacts } from "../artifact-preview.js";
import { readRunEvents } from "./thread-stream.js";
import { buildAgentWorkspace, emptyAgentWorkspace } from "./agent-workspace.js";
import { buildConfirmationQueue, emptyConfirmationQueue } from "./confirmation-queue.js";
import { listWorkbenchDecisions } from "./decision-store.js";
import { alignDecisionInspectorWithConfirmationPrimary, buildDecisionInspector, emptyDecisionInspector } from "./decision-inspector.js";
import { buildApprovalInbox } from "./approval-inbox.js";
import { buildMaintenanceSummary } from "./maintenance-summary.js";
import { buildAgentRelationGraph, emptyAgentRelationGraph, shellWorkbenchWorkpad } from "./agent-relation-graph.js";
import { listWorkbenchRoles } from "./roles.js";
import { buildHarnessGaps, buildRepoSummary, resolveWorkbenchMemory } from "./support.js";
import { listWorkbenchTopicsFromMemory, selectTopicDetail } from "./topics.js";
import { buildDiagnosticWorkpad, buildMultiWorkpadSummaries, buildWorkbenchWorkpad } from "./workpad.js";
import type { LandingQueueSnapshot, ResolvedMemory } from "../../../types/index.js";
import type {
  AgentRelationGraph,
  WorkbenchApprovalItem,
  WorkbenchMaintenanceSummary,
  WorkbenchProjectInput,
  WorkbenchSnapshot,
  WorkbenchStreamPacket,
  WorkbenchTopicDetail,
  WorkbenchTopicSummary,
  WorkbenchWorkpad,
  WorkpadEvidenceSummary,
} from "../../read-model-types.js";

export type {
  AgentRelationGraph,
  AgentRelationGraphEdge,
  AgentRelationGraphEdgeKind,
  AgentRelationGraphNode,
  AgentRelationGraphNodeKind,
  AgentRelationGraphNodeStatus,
  HarnessGap,
  HarnessGapSeverity,
  HarnessGapStatus,
  ThreadStreamAction,
  ThreadStreamEvidence,
  ThreadStreamItem,
  WorkbenchAgentTaskSummary,
  WorkbenchApprovalAction,
  WorkbenchApprovalItem,
  WorkbenchApprovalKind,
  WorkbenchAutoReworkSummary,
  WorkbenchCodingPackage,
  WorkbenchCodingPackageAssignmentStatus,
  WorkbenchCodingPackageStatus,
  WorkbenchConfirmationQueue,
  WorkbenchConfirmationQueueItem,
  WorkbenchConfirmationQueueItemKind,
  WorkbenchConversationLifecycle,
  WorkbenchDecisionAction,
  WorkbenchDecisionContext,
  WorkbenchDecisionContextKind,
  WorkbenchDecisionInspector,
  WorkbenchDecisionItem,
  WorkbenchFailureClassification,
  WorkbenchMaintenanceSummary,
  WorkbenchPendingFeedback,
  WorkbenchProjectInput,
  WorkbenchResultReview,
  WorkbenchResultReviewStatus,
  WorkbenchReworkPrompt,
  WorkbenchRolePipelineSummary,
  WorkbenchRoleRunSummary,
  WorkbenchRoleSummary,
  WorkbenchRunControlState,
  WorkbenchScopedFeedbackTarget,
  WorkbenchSnapshot,
  WorkbenchStreamPacket,
  WorkbenchTaskEvidence,
  WorkbenchTaskGraph,
  WorkbenchTaskNextAction,
  WorkbenchTaskNode,
  WorkbenchTaskNodeStatus,
  WorkbenchTaskQueueItemSummary,
  WorkbenchTaskQueueSummary,
  WorkbenchTaskRunSummary,
  WorkbenchThreadEvent,
  WorkbenchTopicDetail,
  WorkbenchTopicState,
  WorkbenchTopicSummary,
  WorkbenchUserDecisionState,
  WorkbenchWorkerLeaseSummary,
  WorkbenchWorkpad,
  WorkbenchWorkpadRuntimeStatus,
  WorkbenchWorkpadSummary,
  WorkpadBackgroundActivitySummary,
  WorkpadEvidenceSummary,
  WorkpadIntakeSummary,
  WorkpadMemoryIsolationSummary,
  WorkpadNextAction,
  WorkpadProgress,
  WorkpadRelatedMemorySummary,
  WorkpadTaskPreview,
} from "../../read-model-types.js";

export { listWorkbenchRoles } from "./roles.js";
export {
  getWorkbenchWorkflowGraphPlanProjection,
  getWorkbenchSchedulerContractProjection,
  getWorkbenchSchedulerDispatchDryRunProjection,
  getWorkbenchSchedulerWorkerSessionPlanProjection,
  getWorkbenchSchedulerClaimReconcilePlanProjection,
  getWorkbenchSchedulerLaunchPreflightProjection,
  getWorkbenchSchedulerRunProjection,
  getWorkbenchSchedulerRuntimeProjection,
  getWorkbenchSchedulerReconcileSnapshotProjection,
  getWorkbenchSchedulerClaimReservationProjection,
  getWorkbenchSchedulerWorkerAuditProjection,
  getWorkbenchSchedulerWorkerReworkPlanProjection,
  getWorkbenchSchedulerWorkerReworkAuditProjection,
  getWorkbenchSchedulerWorkerReworkResultProjection,
  getWorkbenchSchedulerWorkerReworkValidationProjection,
  getWorkbenchSchedulerWorkerReworkStartProjection,
  getWorkbenchSchedulerWorkerValidationProjection,
  getWorkbenchSchedulerIntegrationCandidateProjection,
  getWorkbenchSchedulerIntegrationCheckHandoffProjection,
  getWorkbenchSchedulerIntegrationOutcomeProjection,
  getWorkbenchSchedulerRunBlockedCloseoutProjection,
  getWorkbenchSchedulerRunCompletionProjection,
  getWorkbenchWorkflowRunProjection,
} from "./lazy-projections.js";

export async function getWorkbenchSnapshot(input: WorkbenchProjectInput, options: {
  topicId?: string;
  ignoreActiveWorkflowActions?: boolean;
  ignoreActiveWorkflowActionTypes?: string[];
} = {}): Promise<WorkbenchSnapshot> {
  const memoryStatus = await getMemoryStatus(input.project, input.path);
  const projectStatus = await getProjectStatus(input.project, input.path);
  const memory = await resolveWorkbenchMemory(input);
  const roles = await listWorkbenchRoles();
  const gaps = buildHarnessGaps();
  const warnings: string[] = [];

  if (!input.project) warnings.push("Project is not registered; snapshot is diagnostic only.");
  if (!memoryStatus.managed) warnings.push("Project is not managed by AHO.");
  if (!memoryStatus.memoryAvailable || !memory.supported) {
    warnings.push("Durable memory is unavailable. AHO will not infer project history.");
    const diagnosticWorkpad = buildDiagnosticWorkpad(input.project?.name ?? "未选择项目", warnings, gaps);
    return {
      project: input.project,
      memory: memoryStatus,
      left: {
        project: input.project,
        memory: memoryStatus,
        topics: [],
        workpads: [],
        repo: buildRepoSummary(projectStatus),
      },
      center: {
        selectedTopic: null,
        workpad: diagnosticWorkpad,
        thread: { items: [] },
        conversationInteractions: { items: [] },
        activeTab: "conversation",
        agentLoop: { runs: [] },
        agentRelationGraph: emptyAgentRelationGraph(),
      },
      right: { approvals: [], decisions: [], decisionInspector: emptyDecisionInspector(), confirmationQueue: emptyConfirmationQueue(), agentWorkspace: emptyAgentWorkspace() },
      roles,
      harnessGaps: gaps,
      warnings,
    };
  }

  const visibleTopics = await listWorkbenchTopicsFromMemory(memory);
  const allTopics = await listWorkbenchTopicsFromMemory(memory, { includeDeleted: true });
  const workflowTopics = workflowScopedTopics(allTopics);
  const selectableTopics = options.topicId ? allTopics : visibleTopics;
  const selectedTopic = await selectTopicDetail(input.project, memory, selectableTopics, options.topicId, { threadMode: "latest", threadLimit: 100 });
  const selectedChangeId = executionChangeId(selectedTopic);
  const approvals = input.project ? await buildApprovalInbox(input.project, memory, workflowTopics) : [];
  const decisions = input.project ? await listWorkbenchDecisions(memory, selectedChangeId) : [];
  const workpads = await buildMultiWorkpadSummaries(memory, visibleTopics, approvals, selectedTopic?.id);
  const workpad = await buildWorkbenchWorkpad({
    project: input.project,
    memory,
    topics: visibleTopics,
    workpads,
    selectedTopic,
    approvals,
    decisions,
    warnings,
    gaps,
  });
  const graphContext = selectedTopic ? await resolveAgentGraphContext(memory, selectedTopic, options.topicId) : null;
  const conversationInteractions = await buildConversationInteractionQueue(memory, selectedTopic?.id, graphContext?.graphScopeId);
  const providerThreads = selectedTopic
    ? await readProviderThreads(memory, [
        selectedTopic.id,
        ...(workpad.mainAgentExecution?.agentTasks.map((task) => task.conversationId) ?? []),
      ])
    : [];
  const decisionInspector = buildDecisionInspector({
    selectedTopic: executionScopedTopic(selectedTopic),
    workpad,
    approvals,
    decisions,
  });
  const selectedIsPureConversation = selectedTopic?.kind === "conversation" && !selectedTopic.boundChangeId;
  const confirmationQueue = selectedIsPureConversation
    ? emptyConfirmationQueue()
    : await buildConfirmationQueue({
      project: input.project,
      memory,
      selectedTopic,
      workpad,
      decisionInspector,
      ignoreActiveWorkflowActions: options.ignoreActiveWorkflowActions,
      ignoreActiveWorkflowActionTypes: options.ignoreActiveWorkflowActionTypes,
    });
  const alignedDecisionInspector = alignDecisionInspectorWithConfirmationPrimary(decisionInspector, confirmationQueue.primary, selectedTopic?.id);
  const shellWorkpad = shellWorkbenchWorkpad(workpad);
  const publicSelectedTopic = selectedTopic ? {
    ...selectedTopic,
    threadItems: selectedTopic.threadItems.map(publicThreadItem),
  } : null;
  return {
    project: input.project,
    memory: memoryStatus,
    left: {
        project: input.project,
        memory: memoryStatus,
        topics: visibleTopics,
        workpads,
        repo: buildRepoSummary(projectStatus),
    },
    center: {
      selectedTopic: publicSelectedTopic,
      workpad: shellWorkpad,
      thread: { items: publicSelectedTopic?.threadItems ?? [] },
      conversationInteractions,
      activeTab: "conversation",
      agentLoop: { runs: selectedTopic?.runs ?? [] },
      agentRelationGraph: emptyAgentRelationGraph(),
    },
    right: {
      approvals,
      decisions,
      decisionInspector: alignedDecisionInspector,
      confirmationQueue,
      agentWorkspace: buildAgentWorkspace({
        selectedTopic,
        providerThreads,
        providerAttempts: await readProviderAttempts(memory, providerThreads.map((link) => link.conversationId)),
        graphScopeId: graphContext?.graphScopeId,
      }),
    },
    roles,
    harnessGaps: gaps,
    warnings,
  };
}

export async function getWorkbenchAgentRelationGraphProjection(input: WorkbenchProjectInput, changeId: string): Promise<AgentRelationGraph> {
  const memory = await resolveWorkbenchMemory(input);
  if (!memory.supported) return emptyAgentRelationGraph();
  const topics = await listWorkbenchTopicsFromMemory(memory, { includeDeleted: true });
  const selectedTopic = await selectTopicDetail(input.project, memory, topics, changeId);
  if (!selectedTopic) return emptyAgentRelationGraph();
  const workflowTopics = workflowScopedTopics(topics);
  const approvals = input.project ? await buildApprovalInbox(input.project, memory, workflowTopics) : [];
  const decisions = input.project ? await listWorkbenchDecisions(memory, executionChangeId(selectedTopic)) : [];
  const workpads = await buildMultiWorkpadSummaries(memory, topics, approvals, selectedTopic.id);
  const workpad = await buildWorkbenchWorkpad({
    project: input.project,
    memory,
    topics,
    workpads,
    selectedTopic,
    approvals,
    decisions,
    warnings: [],
    gaps: buildHarnessGaps(),
  });
  const decisionInspector = buildDecisionInspector({ selectedTopic: executionScopedTopic(selectedTopic), workpad, approvals, decisions });
  const confirmationQueue = await buildConfirmationQueue({
    project: input.project,
    memory,
    selectedTopic,
    workpad,
    decisionInspector,
    includeProjectWideActions: false,
  });
  const graphContext = await resolveAgentGraphContext(memory, selectedTopic, changeId);
  const providerThreads = await readProviderThreads(memory, [
    selectedTopic.id ?? changeId,
    ...(workpad.mainAgentExecution?.agentTasks.map((task) => task.conversationId) ?? []),
  ]);
  const agentWorkspace = buildAgentWorkspace({
    selectedTopic,
    providerThreads,
    providerAttempts: await readProviderAttempts(memory, providerThreads.map((link) => link.conversationId)),
    graphScopeId: graphContext?.graphScopeId,
  });
  const interactionAttention = await buildConversationInteractionAttention(memory, selectedTopic.id, graphContext?.graphScopeId);
  return buildAgentRelationGraph({
    project: input.project,
    selectedTopic,
    workpad,
    confirmationQueue,
    agents: agentWorkspace.agents,
    graphScopeId: graphContext?.graphScopeId,
    scopeChangeId: graphContext?.changeId,
    mainNeedsInput: interactionAttention.mainNeedsInput,
    waitingAgentSurfaceIds: interactionAttention.agentSurfaceIds,
  });
}

function publicThreadItem(item: import("../../read-model-types.js").ThreadStreamItem): import("../../read-model-types.js").ThreadStreamItem {
  if (item.providerUserInput) {
    const { providerUserInput, ...safe } = item;
    return { ...safe, interactionHistory: providerInteractionHistory(providerUserInput) };
  }
  if (item.clarification) {
    const { clarification, ...safe } = item;
    return {
      ...safe,
      interactionHistory: {
        kind: "clarification",
        status: clarification.status === "expired" ? "superseded" : clarification.status,
        questions: clarification.questions.map((question) => ({ questionId: question.id, title: question.question })),
        answers: clarification.answers
          ? Object.fromEntries(clarification.answers.map((answer) => [answer.questionId, answer.answer]))
          : undefined,
      },
    };
  }
  return item;
}

async function resolveAgentGraphContext(
  memory: ResolvedMemory,
  selectedTopic: WorkbenchTopicDetail,
  requestedId?: string,
): Promise<{ graphScopeId: string; changeId?: string } | null> {
  if (!memory.projectId) return null;
  const store = await WorkbenchStore.open(memory);
  try {
    const conversation = store.readConversation(memory.projectId, selectedTopic.id)
      ?? store.findConversationForChange(memory.projectId, requestedId ?? selectedTopic.id);
    if (!conversation) return null;
    const requestedChangeId = requestedId && requestedId !== conversation.conversationId
      ? requestedId
      : undefined;
    const graphScopeId = requestedChangeId
      ? store.findGraphScopeForChange(memory.projectId, requestedChangeId)
      : conversation.currentGraphScopeId;
    if (!graphScopeId) return null;
    const changeId = requestedChangeId
      ?? (conversation.currentGraphScopeId === graphScopeId ? conversation.boundChangeId ?? undefined : undefined);
    return { graphScopeId, changeId };
  } finally {
    store.close();
  }
}

async function readProviderThreads(memory: ResolvedMemory, conversationIds: string | string[]): Promise<StoredProviderThreadLink[]> {
  if (!memory.projectId) return [];
  const store = await WorkbenchStore.open(memory);
  try {
    const ids = [...new Set(Array.isArray(conversationIds) ? conversationIds : [conversationIds])];
    return ids.flatMap((conversationId) => store.listProviderThreads(memory.projectId!, conversationId));
  } finally {
    store.close();
  }
}

async function readProviderAttempts(memory: ResolvedMemory, conversationIds: string | string[]): Promise<StoredProviderAttempt[]> {
  if (!memory.projectId) return [];
  const store = await WorkbenchStore.open(memory);
  try {
    const ids = [...new Set(Array.isArray(conversationIds) ? conversationIds : [conversationIds])];
    return ids.flatMap((conversationId) => store.listProviderAttempts(memory.projectId!, conversationId));
  } finally {
    store.close();
  }
}

export async function getWorkbenchWorkpadProjection(input: WorkbenchProjectInput, changeId: string): Promise<WorkbenchWorkpad> {
  const memory = await resolveWorkbenchMemory(input);
  if (!memory.supported) return buildDiagnosticWorkpad(input.project?.name ?? "未选择项目", ["Durable memory is unavailable."], buildHarnessGaps());
  const topics = await listWorkbenchTopicsFromMemory(memory, { includeDeleted: true });
  const selectedTopic = await selectTopicDetail(input.project, memory, topics, changeId);
  return buildWorkbenchProjectionWorkpad(input, memory, topics, selectedTopic);
}

export async function getWorkbenchEvidenceProjection(input: WorkbenchProjectInput, changeId: string): Promise<{
  changeId: string;
  evidence: WorkpadEvidenceSummary[];
}> {
  const workpad = await getWorkbenchWorkpadProjection(input, changeId);
  return {
    changeId,
    evidence: workpad.evidence,
  };
}

export async function getWorkbenchMaintenanceProjection(input: WorkbenchProjectInput): Promise<WorkbenchMaintenanceSummary | null> {
  const memory = await resolveWorkbenchMemory(input);
  if (!memory.supported) return null;
  return buildMaintenanceSummary(memory);
}

export async function getWorkbenchLandingQueueProjection(input: WorkbenchProjectInput): Promise<LandingQueueSnapshot | null> {
  const memory = await resolveWorkbenchMemory(input);
  if (!memory.supported) return null;
  return latestLandingQueueSnapshot(memory).catch(() => null);
}

async function buildWorkbenchProjectionWorkpad(
  input: WorkbenchProjectInput,
  memory: ResolvedMemory,
  topics: WorkbenchTopicSummary[],
  selectedTopic: WorkbenchTopicDetail | null,
): Promise<WorkbenchWorkpad> {
  const workflowTopics = workflowScopedTopics(topics);
  const approvals = input.project ? await buildApprovalInbox(input.project, memory, workflowTopics) : [];
  const decisions = input.project ? await listWorkbenchDecisions(memory, executionChangeId(selectedTopic)) : [];
  const workpads = await buildMultiWorkpadSummaries(memory, topics, approvals, selectedTopic?.id);
  return buildWorkbenchWorkpad({
    project: input.project,
    memory,
    topics,
    workpads,
    selectedTopic,
    approvals,
    decisions,
    warnings: [],
    gaps: buildHarnessGaps(),
  });
}

export async function listWorkbenchTopics(input: WorkbenchProjectInput): Promise<WorkbenchTopicSummary[]> {
  const memory = await resolveWorkbenchMemory(input);
  if (!memory.supported || !existsSync(memory.memoryRoot)) return [];
  return listWorkbenchTopicsFromMemory(memory);
}

export async function hideWorkbenchTopic(input: WorkbenchProjectInput, topicId: string): Promise<{ hidden: true; topicId: string }> {
  const memory = await resolveWorkbenchMemory(input);
  if (!memory.supported || !existsSync(memory.memoryRoot)) {
    const error = new Error("Durable memory is unavailable; cannot hide this conversation.");
    error.name = "Conflict";
    throw error;
  }
  await hideConversation(memory, topicId);
  return { hidden: true, topicId };
}

export async function deleteWorkbenchConversation(input: WorkbenchProjectInput, topicId: string): Promise<{ deleted: true; topicId: string }> {
  const memory = await resolveWorkbenchMemory(input);
  if (!memory.supported || !existsSync(memory.memoryRoot)) {
    const error = new Error("Durable memory is unavailable; cannot delete this conversation.");
    error.name = "Conflict";
    throw error;
  }
  await deleteConversation(memory, topicId);
  return { deleted: true, topicId };
}

export async function getWorkbenchTopic(input: WorkbenchProjectInput, topicId: string): Promise<WorkbenchTopicDetail> {
  const memory = await resolveWorkbenchMemory(input);
  const topics = await listWorkbenchTopicsFromMemory(memory);
  const detail = await selectTopicDetail(input.project, memory, topics, topicId);
  if (!detail) throw new Error(`Topic not found: ${topicId}.`);
  return detail;
}

export async function getWorkbenchStream(input: WorkbenchProjectInput, runId: string): Promise<WorkbenchStreamPacket> {
  const memory = await resolveWorkbenchMemory(input);
  if (!memory.supported || !existsSync(memory.runsRoot)) {
    throw new Error("Durable memory is unavailable; cannot replay run stream.");
  }
  const run = await readRun(memory, runId);
  const events = await readRunEvents(memory, run);
  const { artifacts, diagnostics, warnings } = await summarizeRunArtifacts(memory, run);
  return {
    run,
    live: false,
    events,
    artifacts,
    diagnostics,
    warnings,
  };
}

export async function listWorkbenchApprovals(input: WorkbenchProjectInput, options: { topicId?: string } = {}): Promise<WorkbenchApprovalItem[]> {
  if (!input.project) return [];
  const memory = await resolveWorkbenchMemory(input);
  if (!memory.supported || !existsSync(memory.memoryRoot)) return [];
  const topics = await listWorkbenchTopicsFromMemory(memory, { includeDeleted: true });
  const approvals = await buildApprovalInbox(input.project, memory, workflowScopedTopics(topics));
  if (!options.topicId) return approvals;
  const topic = topics.find((item) => item.id === options.topicId || item.name === options.topicId);
  const changeId = topic?.boundChangeId ?? options.topicId;
  return approvals.filter((item) => !item.changeId || item.changeId === changeId);
}

function workflowScopedTopics(topics: WorkbenchTopicSummary[]): WorkbenchTopicSummary[] {
  return topics.flatMap((topic) => {
    if (topic.kind !== "conversation") return [topic];
    if (!topic.boundChangeId) return [];
    return [{
      ...topic,
      id: topic.boundChangeId,
      kind: "change" as const,
      name: topic.boundChangeId,
    }];
  });
}

function executionChangeId(topic: WorkbenchTopicSummary | null | undefined): string | undefined {
  return topic?.boundChangeId ?? topic?.id;
}

function executionScopedTopic(topic: WorkbenchTopicDetail | null): WorkbenchTopicDetail | null {
  if (!topic?.boundChangeId || topic.boundChangeId === topic.id) return topic;
  return { ...topic, id: topic.boundChangeId, name: topic.boundChangeId };
}



