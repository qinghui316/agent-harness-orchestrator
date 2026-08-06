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
  let runtimeState: Awaited<ReturnType<typeof resolveProjectRuntimeState>> | null = null;
  if (input.project) {
    runtimeState = await resolveProjectRuntimeState(input.project, {
      discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
    });
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
      conversationInteractions: { items: [] },
      activeTab: "conversation",
      agentLoop: { runs: [] },
    },
    right: { approvals: [], decisions: [], decisionInspector: emptyDecisionInspector(), confirmationQueue: emptyConfirmationQueue() },
    roles,
    harnessGaps: gaps,
    warnings,
  };
}

async function requireReadyProjectRuntime(project: ManagedProject): Promise<ProjectRuntimeResolution> {
  const state = await resolveProjectRuntimeState(project, {
    discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
  });
  if (state.state !== "ready") {
    throw new Error(`Project Harness is not ready for Workbench read models: ${state.state}.`);
  }
  return state.resolution;
}

export async function getWorkbenchWorkpadProjection(input: WorkbenchProjectInput, changeId: string): Promise<WorkbenchWorkpad> {
  return (await getWorkbenchSnapshot(input, { topicId: changeId })).center.workpad;
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
  const runtime = await requireReadyProjectRuntime(input.project);
  return latestLandingQueueSnapshot(runtime.paths).catch(() => null);
}

export async function listWorkbenchTopics(input: WorkbenchProjectInput): Promise<WorkbenchTopicSummary[]> {
  if (!input.project) return [];
  const runtime = await resolveProjectRuntimeState(input.project, {
    discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
  });
  if (runtime.state !== "ready") return [];
  const store = await openProjectRuntimeWorkbenchDatabase(runtime.resolution.paths);
  try {
    return store.conversations.listConversations(runtime.resolution.harness.projectId).map((conversation) => ({
      id: conversation.conversationId,
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

export async function hideWorkbenchTopic(input: WorkbenchProjectInput, topicId: string): Promise<{ hidden: true; topicId: string }> {
  if (!input.project) {
    const error = new Error("Project Harness runtime is unavailable; cannot hide this conversation.");
    error.name = "Conflict";
    throw error;
  }
  const runtime = await requireReadyProjectRuntime(input.project);
  await hideConversation(runtime.paths, topicId);
  return { hidden: true, topicId };
}

export async function deleteWorkbenchConversation(input: WorkbenchProjectInput, topicId: string): Promise<{ deleted: true; topicId: string }> {
  if (!input.project) {
    const error = new Error("Project Harness runtime is unavailable; cannot delete this conversation.");
    error.name = "Conflict";
    throw error;
  }
  const runtime = await requireReadyProjectRuntime(input.project);
  await deleteConversation(runtime.paths, topicId);
  return { deleted: true, topicId };
}

export async function getWorkbenchTopic(input: WorkbenchProjectInput, topicId: string): Promise<WorkbenchTopicDetail> {
  if (!input.project) throw new Error(`Topic not found: ${topicId}.`);
  const detail = (await getWorkbenchSnapshot(input, { topicId })).center.selectedTopic;
  if (!detail) throw new Error(`Topic not found: ${topicId}.`);
  return detail;
}

export async function getWorkbenchStream(input: WorkbenchProjectInput, runId: string): Promise<WorkbenchStreamPacket> {
  if (!input.project) {
    throw new Error("Project Harness runtime is unavailable; cannot replay run stream.");
  }
  const runtime = await resolveProjectRuntimeState(input.project, {
    discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
  });
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

export async function listWorkbenchApprovals(input: WorkbenchProjectInput, options: { topicId?: string } = {}): Promise<WorkbenchApprovalItem[]> {
  if (!input.project) return [];
  return (await getWorkbenchSnapshot(input, { topicId: options.topicId })).right.approvals;
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



