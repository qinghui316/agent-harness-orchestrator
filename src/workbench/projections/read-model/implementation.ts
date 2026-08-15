import { latestLandingQueueSnapshot } from "../../../landing-queue/manager.js";
import { getProjectStatus } from "../../../project/status.js";
import { DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY } from "../../../provider-runtime/project-harness-discovery.js";
import { resolveProjectRuntimeState } from "../../../project-runtime/coordinator.js";
import type { ProjectRuntimeResolution } from "../../../project-runtime/context.js";
import { readRun } from "../../../run/manager.js";
import { deleteConversation, hideConversation } from "../../conversation-lifecycle.js";
import { openProjectRuntimeWorkbenchDatabase } from "../../persistence/open-workbench-database.js";
import { summarizeRunArtifacts } from "../artifact-preview.js";
import { readRunEvents } from "./thread-stream.js";
import { emptyConfirmationQueue } from "./confirmation-queue.js";
import { CurrentProjectConversationUnavailableError } from "./errors.js";
import { emptyDecisionInspector } from "./decision-inspector.js";
import { tryBuildSkillNativePlanningSnapshot } from "./skill-native-planning-snapshot.js";
import { listWorkbenchRoles } from "./roles.js";
import { buildHarnessGaps, buildRepoSummary } from "./support.js";
import { buildDiagnosticWorkpad } from "./workpad.js";
import { buildThreadStreamFromMessages } from "./thread-stream.js";
import { fromStoredThreadMessage } from "../../conversation-thread-log.js";
import { buildConversationInteractionQueue } from "../../conversation-interactions.js";
import type { ProductMode } from "../../../provider-runtime/index.js";
import type { LandingQueueSnapshot, ManagedProject } from "../../../types/index.js";
import type {
  WorkbenchApprovalItem,
  WorkbenchProjectHarnessDiagnosticStatus,
  WorkbenchProjectInput,
  WorkbenchSnapshot,
  WorkbenchStreamPacket,
  WorkbenchTopicDetail,
  WorkbenchTopicSummary,
  WorkbenchWorkpad,
  WorkpadEvidenceSummary,
} from "../../read-model-types.js";

export type {
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
  WorkbenchPendingFeedback,
  ProviderAttemptReadModel,
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
  productMode?: ProductMode;
  ignoreActiveWorkflowActions?: boolean;
  ignoreActiveWorkflowActionTypes?: string[];
} = {}): Promise<WorkbenchSnapshot> {
  const productMode = options.productMode ?? "harness";
  let runtimeState: Awaited<ReturnType<typeof resolveProjectRuntimeState>> | null = null;
  if (input.project) {
    runtimeState = input.runtimeStateResolver
      ? await input.runtimeStateResolver(input.project)
      : await resolveProjectRuntimeState(input.project, { discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY });
    const runtimePaths = runtimeState.state === "onboarding"
      ? runtimeState.paths
      : runtimeState.resolution.paths;
    await assertRequestedConversationMode(
      runtimePaths,
      runtimePaths.projectId,
      options.topicId,
      productMode,
    );
    if (productMode === "agent") {
      return buildAgentModeSnapshot(input, input.project, runtimeState, options.topicId);
    }
    if (runtimeState.state === "ready") {
      const planningSnapshot = await tryBuildSkillNativePlanningSnapshot({
        project: input.project,
        resolution: runtimeState.resolution,
        topicId: options.topicId,
      });
      if (planningSnapshot) return planningSnapshot;
      throw new CurrentProjectConversationUnavailableError();
    }
  }
  const projectStatus = await getProjectStatus(input.project, input.path);
  const roles = await listWorkbenchRoles();
  const gaps = buildHarnessGaps();
  const status = diagnosticProjectHarnessStatus(input, runtimeState);
  const warnings = [status.reason];
  const diagnosticWorkpad = buildDiagnosticWorkpad(input.project?.name ?? "未选择项目", warnings, gaps);
  return {
    productMode,
    project: input.project,
    harness: status,
    left: {
      project: input.project,
      harness: status,
      topics: [],
      workpads: [],
      repo: buildRepoSummary(projectStatus),
    },
    center: {
      selectedTopic: null,
      workpad: diagnosticWorkpad,
      thread: { items: [] },
      conversationInteractions: { productMode, items: [] },
      activeTab: "conversation",
      agentLoop: { runs: [] },
    },
    right: { approvals: [], decisions: [], decisionInspector: emptyDecisionInspector(), confirmationQueue: emptyConfirmationQueue() },
    roles,
    harnessGaps: gaps,
    warnings,
  };
}

async function requireReadyProjectRuntime(input: WorkbenchProjectInput): Promise<ProjectRuntimeResolution> {
  if (!input.project) throw new Error("Project Harness runtime is unavailable for Workbench read models.");
  const state = input.runtimeStateResolver
    ? await input.runtimeStateResolver(input.project)
    : await resolveProjectRuntimeState(input.project, { discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY });
  if (state.state !== "ready") {
    throw new Error(`Project Harness is not ready for Workbench read models: ${state.state}.`);
  }
  return state.resolution;
}

export async function getWorkbenchWorkpadProjection(input: WorkbenchProjectInput, changeId: string): Promise<WorkbenchWorkpad> {
  return (await getWorkbenchSnapshot(input, { topicId: changeId, productMode: "harness" })).center.workpad;
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

export async function getWorkbenchLandingQueueProjection(input: WorkbenchProjectInput): Promise<LandingQueueSnapshot | null> {
  if (!input.project) return null;
  const runtime = await requireReadyProjectRuntime(input);
  return latestLandingQueueSnapshot(runtime.paths).catch(() => null);
}

export async function listWorkbenchTopics(input: WorkbenchProjectInput, productMode: ProductMode): Promise<WorkbenchTopicSummary[]> {
  if (!input.project) return [];
  const runtime = input.runtimeStateResolver
    ? await input.runtimeStateResolver(input.project)
    : await resolveProjectRuntimeState(input.project, { discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY });
  if (runtime.state !== "ready" && productMode === "harness") return [];
  const paths = runtime.state === "onboarding" ? runtime.paths : runtime.resolution.paths;
  const store = await openProjectRuntimeWorkbenchDatabase(paths);
  try {
    return store.conversations.listConversations(paths.projectId, productMode).map((conversation) => ({
      id: conversation.conversationId,
      productMode: conversation.productMode,
      agentTurnMode: conversation.agentTurnMode,
      kind: "conversation",
      name: conversation.conversationId,
      title: conversation.title,
      state: conversation.state,
      path: `runtime-sidecar:conversation/${conversation.conversationId}`,
      boundChangeId: conversation.boundChangeId,
      graphScopeId: conversation.currentGraphScopeId ?? undefined,
      selectedProviderId: conversation.selectedProviderId,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    }));
  } finally {
    store.close();
  }
}

async function buildAgentModeSnapshot(
  input: WorkbenchProjectInput,
  project: ManagedProject,
  runtime: Awaited<ReturnType<typeof resolveProjectRuntimeState>>,
  topicId?: string,
): Promise<WorkbenchSnapshot> {
  const paths = runtime.state === "onboarding" ? runtime.paths : runtime.resolution.paths;
  const database = await openProjectRuntimeWorkbenchDatabase(paths);
  try {
    const conversations = database.conversations.listConversations(paths.projectId, "agent");
    const selected = topicId
      ? conversations.find((conversation) => conversation.conversationId === topicId)
      : conversations.find((conversation) => conversation.state === "active") ?? conversations[0];
    if (topicId && !selected) {
      const other = database.conversations.readConversation(paths.projectId, topicId);
      const error = new Error(other
        ? `Conversation ${topicId} belongs to ${other.productMode} mode, not agent.`
        : `Conversation not found: ${topicId}.`);
      error.name = other ? "Conflict" : "NotFound";
      throw error;
    }
    const topics: WorkbenchTopicSummary[] = conversations.map((conversation) => ({
      id: conversation.conversationId,
      productMode: "agent",
      agentTurnMode: conversation.agentTurnMode,
      kind: "conversation",
      name: conversation.conversationId,
      title: conversation.title,
      state: conversation.state,
      path: `runtime-sidecar:conversation/${conversation.conversationId}`,
      boundChangeId: conversation.boundChangeId,
      graphScopeId: conversation.currentGraphScopeId ?? undefined,
      selectedProviderId: conversation.selectedProviderId,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    }));
    let selectedTopic: WorkbenchTopicDetail | null = null;
    if (selected) {
      const topic = topics.find((candidate) => candidate.id === selected.conversationId)!;
      selectedTopic = {
        ...topic,
        change: null,
        runs: [],
        taskQueues: [],
        taskQueueItems: [],
        taskRuns: [],
        workerLeases: [],
        worktrees: [],
        validations: [],
        audits: [],
        threadItems: await buildThreadStreamFromMessages(
          topic,
          database.timeline.listConversationMessages(paths.projectId, selected.conversationId).map(fromStoredThreadMessage),
          { includeChangeState: false },
        ),
      };
    }
    const [projectStatus, roles] = await Promise.all([
      getProjectStatus(project, project.path),
      listWorkbenchRoles(),
    ]);
    const harness = runtime.state === "ready" ? {
      kind: "project-skill" as const,
      registered: true as const,
      managed: true as const,
      harnessReady: true as const,
      projectId: runtime.resolution.harness.projectId,
      skillName: runtime.resolution.harness.skillName,
      skillRevision: runtime.resolution.harness.skillRevision,
      contentFingerprint: runtime.resolution.harness.contentFingerprint,
      runtimeAvailable: true as const,
    } : diagnosticProjectHarnessStatus({ project, path: project.path }, runtime);
    const workpad: WorkbenchWorkpad = {
      ...buildDiagnosticWorkpad(project.name, [], []),
      title: selectedTopic?.title ?? "Agent",
      subtitle: project.name,
      state: selectedTopic ? "active" as const : "empty" as const,
      conversationId: selectedTopic?.id,
      demandId: selectedTopic?.id,
      blockers: [],
      warnings: [],
    };
    const runningMainAttempt = selected?.currentGraphScopeId
      ? [...database.providerAttempts.listProviderAttempts(paths.projectId, selected.conversationId)]
        .reverse()
        .find((attempt) => attempt.productMode === "agent"
          && attempt.operationProfile === "agent"
          && attempt.roleId === "main-agent"
          && attempt.graphScopeId === selected.currentGraphScopeId
          && attempt.status === "running")
      : undefined;
    const turnControl = selected && runningMainAttempt
      ? input.turnControlStateResolver?.(paths.projectId, selected.conversationId, runningMainAttempt.attemptId)
      : undefined;
    if (runningMainAttempt) {
      workpad.conversationLifecycle = "running" as const;
      workpad.runControlState = {
        state: turnControl?.state ?? "running",
        canStop: turnControl?.canInterrupt ?? false,
        providerId: runningMainAttempt.providerId,
        attemptId: runningMainAttempt.attemptId,
        ...(turnControl?.runId ? { runId: turnControl.runId } : {}),
        pendingFeedbackCount: 0,
        explanation: turnControl?.state === "stopping"
          ? "正在停止当前 Agent 回合。"
          : turnControl?.canInterrupt
            ? "可以停止当前 Agent 回合，当前输入会保留用于下一回合。"
            : "当前 Agent 回合正在启动，等待精确控制身份。",
      };
    }
    const conversationInteractions = selected?.currentGraphScopeId
      ? await buildConversationInteractionQueue(
          paths,
          selected.conversationId,
          selected.currentGraphScopeId,
          "agent",
        )
      : { productMode: "agent" as const, items: [] };
    return {
      productMode: "agent",
      project,
      harness,
      left: { project, harness, topics, workpads: [], repo: buildRepoSummary(projectStatus) },
      center: {
        selectedTopic,
        workpad,
        thread: { items: selectedTopic?.threadItems ?? [] },
        conversationInteractions,
        activeTab: "conversation",
        agentLoop: { runs: [] },
      },
      right: {
        approvals: [],
        decisions: [],
        decisionInspector: emptyDecisionInspector(),
        confirmationQueue: emptyConfirmationQueue(),
      },
      roles,
      harnessGaps: [],
      warnings: [],
    };
  } finally {
    database.close();
  }
}

async function assertRequestedConversationMode(
  paths: ProjectRuntimeResolution["paths"],
  projectId: string,
  topicId: string | undefined,
  productMode: ProductMode,
): Promise<void> {
  if (!topicId) return;
  const database = await openProjectRuntimeWorkbenchDatabase(paths);
  try {
    const conversation = database.conversations.readConversation(projectId, topicId);
    if (conversation && conversation.productMode !== productMode) {
      const error = new Error("Conversation productMode does not match the requested mode.");
      error.name = "Conflict";
      throw error;
    }
  } finally {
    database.close();
  }
}

export async function hideWorkbenchTopic(input: WorkbenchProjectInput, topicId: string): Promise<{ hidden: true; topicId: string }> {
  if (!input.project) {
    const error = new Error("Project Harness runtime is unavailable; cannot hide this conversation.");
    error.name = "Conflict";
    throw error;
  }
  const runtime = await requireReadyProjectRuntime(input);
  await hideConversation(runtime.paths, topicId);
  return { hidden: true, topicId };
}

export async function deleteWorkbenchConversation(input: WorkbenchProjectInput, topicId: string): Promise<{ deleted: true; topicId: string }> {
  if (!input.project) {
    const error = new Error("Project Harness runtime is unavailable; cannot delete this conversation.");
    error.name = "Conflict";
    throw error;
  }
  const runtime = await requireReadyProjectRuntime(input);
  await deleteConversation(runtime.paths, topicId);
  return { deleted: true, topicId };
}

export async function getWorkbenchTopic(input: WorkbenchProjectInput, topicId: string, productMode: ProductMode): Promise<WorkbenchTopicDetail> {
  if (!input.project) throw new Error(`Topic not found: ${topicId}.`);
  const detail = (await getWorkbenchSnapshot(input, { topicId, productMode })).center.selectedTopic;
  if (!detail) throw new Error(`Topic not found: ${topicId}.`);
  return detail;
}

export async function getWorkbenchStream(input: WorkbenchProjectInput, runId: string): Promise<WorkbenchStreamPacket> {
  if (!input.project) {
    throw new Error("Project Harness runtime is unavailable; cannot replay run stream.");
  }
  const runtime = input.runtimeStateResolver
    ? await input.runtimeStateResolver(input.project)
    : await resolveProjectRuntimeState(input.project, { discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY });
  if (runtime.state !== "ready") {
    throw new Error("Project Harness is not ready; cannot replay run stream.");
  }
  const run = await readRun(runtime.resolution.paths, runId);
  const events = await readRunEvents(runtime.resolution.paths, run);
  const { artifacts, diagnostics, warnings } = await summarizeRunArtifacts({
    projectRoot: runtime.resolution.projectRoot,
    runArtifactRoot: runtime.resolution.paths.sidecarRoot,
  }, run);
  return {
    run,
    live: false,
    events,
    artifacts,
    diagnostics,
    warnings,
  };
}

export async function listWorkbenchApprovals(input: WorkbenchProjectInput, options: { topicId?: string; productMode: ProductMode }): Promise<WorkbenchApprovalItem[]> {
  if (!input.project) return [];
  return (await getWorkbenchSnapshot(input, { topicId: options.topicId, productMode: options.productMode })).right.approvals;
}

function diagnosticProjectHarnessStatus(
  input: WorkbenchProjectInput,
  state: Awaited<ReturnType<typeof resolveProjectRuntimeState>> | null,
): WorkbenchProjectHarnessDiagnosticStatus {
  if (!input.project || !state) {
    return {
      kind: "project-skill",
      registered: false,
      managed: false,
      harnessReady: false,
      runtimeAvailable: false,
      state: "unregistered",
      reason: "Project is not registered; Workbench will not infer project history.",
    };
  }
  if (state.state === "onboarding") {
    return {
      kind: "project-skill",
      registered: true,
      managed: true,
      harnessReady: false,
      runtimeAvailable: true,
      projectId: state.reservedProjectId,
      state: "onboarding",
      reason: "Project Harness onboarding is incomplete; Workbench will not infer project history.",
    };
  }
  return {
    kind: "project-skill",
    registered: true,
    managed: true,
    harnessReady: false,
    runtimeAvailable: true,
    projectId: state.resolution.harness.projectId,
    state: "repair-required",
    reason: "Project Harness doctor or audit requires repair before Workbench can read project history.",
  };
}



