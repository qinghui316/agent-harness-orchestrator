import { getProjectStatus } from "../../../project/status.js";
import { readProjectHarnessPlanningGate } from "../../../project-harness/planning-gate-query.js";
import type { ProjectRuntimeResolution } from "../../../project-runtime/context.js";
import { listWorkflowRuns } from "../../../workflow-run/manager.js";
import { readExecutionAuthorization } from "../../../workflow-runtime/execution-authorization.js";
import type { ManagedProject, WorkflowGraphPlan } from "../../../types/index.js";
import { buildConversationInteractionQueue } from "../../conversation-interactions.js";
import { openProjectRuntimeWorkbenchDatabase } from "../../persistence/open-workbench-database.js";
import type {
  HarnessGap,
  WorkbenchConfirmationQueue,
  WorkbenchProjectHarnessStatus,
  WorkbenchSnapshot,
  WorkbenchTopicDetail,
  WorkbenchTopicSummary,
  WorkbenchWorkpad,
  WorkbenchWorkpadSummary,
} from "../../read-model-types.js";
import type { WorkbenchWorkflowGraphPlanSummary } from "../../workflow-projection.js";
import { buildTypedWorkflowNextAction } from "../../workflow-projection.js";
import { sequentialWorkflowToConfirmationItems } from "./confirmation/typed-workflow.js";
import { emptyDecisionInspector } from "./decision-inspector.js";
import { buildHarnessGaps, buildRepoSummary } from "./support.js";
import { buildDiagnosticWorkpad } from "./workpad.js";
import { listWorkbenchRoles } from "./roles.js";

export async function tryBuildSkillNativePlanningSnapshot(input: {
  project: ManagedProject;
  resolution: ProjectRuntimeResolution;
  topicId?: string;
}): Promise<WorkbenchSnapshot | null> {
  const conversations = await readPlanningConversations(input.resolution);
  const selected = input.topicId
    ? conversations.find((item) => item.conversationId === input.topicId || item.boundChangeId === input.topicId)
    : conversations.find((item) => item.state === "active" && item.boundChangeId);
  if (!selected) return null;
  const existingWorkflowRun = selected.boundChangeId
    ? (await listWorkflowRuns(input.resolution.paths, selected.boundChangeId))[0] ?? null
    : null;
  if (existingWorkflowRun) {
    throw new Error(
      `Skill-native planning snapshot stops before WorkflowRun projection; run ${existingWorkflowRun.id} requires the execution read-model migration.`,
    );
  }

  const status = projectHarnessStatus(input.resolution);
  const gaps = buildHarnessGaps();
  const topic = conversationTopic(selected);
  const warnings: string[] = [];
  let graph: WorkflowGraphPlan | null = null;
  let gateReady = false;
  if (!selected.boundChangeId || !selected.currentGraphScopeId) {
    warnings.push("Planning gate requires an exact Change and current Conversation graph scope.");
  } else try {
    const evidence = await readProjectHarnessPlanningGate({
      projectId: input.resolution.harness.projectId,
      projectRoot: input.resolution.projectRoot,
      skillRoot: input.resolution.harness.skillRoot,
      conversationId: selected.conversationId,
      graphScopeId: selected.currentGraphScopeId,
      changeId: selected.boundChangeId,
    });
    graph = evidence.graph;
    if (evidence.authorizationIntent.status === "issued" && evidence.authorizationIntent.authorizationId) {
      const authorization = await readExecutionAuthorization(
        input.resolution.paths,
        evidence.authorizationIntent.authorizationId,
      );
      if (authorization.status !== "active"
        || authorization.projectId !== input.resolution.harness.projectId
        || authorization.changeId !== selected.boundChangeId
        || authorization.conversationId !== selected.conversationId
        || authorization.acceptedPlanHash !== evidence.authorizationIntent.proposalHash
        || authorization.graphId !== graph.id) {
        throw new Error("Planning gate execution authorization lineage is stale.");
      }
      gateReady = true;
    }
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : String(error));
  }

  const graphSummary = graph ? workflowGraphSummary(graph) : undefined;
  const workpad = planningWorkpad(input.project, topic, graphSummary, gateReady, warnings, gaps);
  const gateItems = gateReady ? sequentialWorkflowToConfirmationItems(input.project, topic, workpad) : [];
  const confirmationQueue: WorkbenchConfirmationQueue = {
    primary: gateItems[0] ?? null,
    current: gateItems,
    otherDemands: [],
    maintenance: [],
    history: [],
  };
  const topics = conversations.map(conversationTopicSummary);
  const workpads = topics.map((item): WorkbenchWorkpadSummary => ({
    id: item.id,
    title: item.title,
    state: item.state,
    runtimeStatus: item.id === topic.id ? "waiting-decision" : "active",
    userStatus: item.id === topic.id ? "waiting-confirmation" : "processing",
    userStatusLabel: item.id === topic.id ? "等待确认" : "处理中",
    conversationLifecycle: item.state === "active" ? "active" : "archived-readonly",
    linkedFromChangeId: item.boundChangeId ?? undefined,
    selected: item.id === topic.id,
    waitingDecisionCount: item.id === topic.id && gateReady ? 1 : 0,
    updatedAt: item.updatedAt,
  }));
  const [projectStatus, roles, conversationInteractions] = await Promise.all([
    getProjectStatus(input.project, input.project.path),
    listWorkbenchRoles(),
    selected.currentGraphScopeId
      ? buildConversationInteractionQueue(input.resolution.paths, selected.conversationId, selected.currentGraphScopeId)
      : Promise.resolve({ items: [] }),
  ]);
  return {
    project: input.project,
    memory: status,
    left: {
      project: input.project,
      memory: status,
      topics,
      workpads,
      repo: buildRepoSummary(projectStatus),
    },
    center: {
      selectedTopic: topic,
      workpad,
      thread: { items: [] },
      conversationInteractions,
      activeTab: "conversation",
      agentLoop: { runs: [] },
    },
    right: {
      approvals: [],
      decisions: [],
      decisionInspector: emptyDecisionInspector(),
      confirmationQueue,
    },
    roles,
    harnessGaps: gaps,
    warnings,
  };
}

interface PlanningConversation {
  conversationId: string;
  title: string;
  state: "active" | "archive";
  boundChangeId: string | null;
  currentGraphScopeId: string | null;
  selectedProviderId: string;
  createdAt: string;
  updatedAt: string;
}

async function readPlanningConversations(resolution: ProjectRuntimeResolution): Promise<PlanningConversation[]> {
  const store = await openProjectRuntimeWorkbenchDatabase(resolution.paths);
  try {
    return store.conversations.listConversations(resolution.harness.projectId).map((conversation) => ({
      conversationId: conversation.conversationId,
      title: conversation.title,
      state: conversation.state,
      boundChangeId: conversation.boundChangeId,
      currentGraphScopeId: conversation.currentGraphScopeId,
      selectedProviderId: conversation.selectedProviderId,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    }));
  } finally {
    store.close();
  }
}

function conversationTopicSummary(conversation: PlanningConversation): WorkbenchTopicSummary {
  return {
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
  };
}

function conversationTopic(conversation: PlanningConversation): WorkbenchTopicDetail {
  return {
    ...conversationTopicSummary(conversation),
    change: null,
    runs: [],
    taskQueues: [],
    taskQueueItems: [],
    taskRuns: [],
    workerLeases: [],
    worktrees: [],
    validations: [],
    audits: [],
    threadItems: [],
  };
}

function workflowGraphSummary(graph: WorkflowGraphPlan): WorkbenchWorkflowGraphPlanSummary {
  return {
    id: graph.id,
    changeId: graph.changeId,
    status: graph.status,
    graphMode: graph.graphMode,
    authoringContractVersion: graph.authoringContractVersion,
    schedulerContractId: graph.graphMode === "ready-set-v1" ? graph.schedulerContractId : undefined,
    schedulerWorkerPlanId: graph.graphMode === "ready-set-v1" ? graph.schedulerWorkerPlanId : undefined,
    schedulerClaimReconcilePlanId: graph.graphMode === "ready-set-v1" ? graph.schedulerClaimReconcilePlanId : undefined,
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    waveCount: graph.graphMode === "ready-set-v1" ? graph.waves.length : undefined,
    artifact: graph.artifact,
    markdownArtifact: graph.markdownArtifact,
    updatedAt: graph.updatedAt,
  };
}

function planningWorkpad(
  project: ManagedProject,
  topic: WorkbenchTopicDetail,
  graph: WorkbenchWorkflowGraphPlanSummary | undefined,
  gateReady: boolean,
  warnings: string[],
  gaps: HarnessGap[],
): WorkbenchWorkpad {
  const base = buildDiagnosticWorkpad(project.name, warnings, gaps);
  const nextAction = graph && gateReady
    ? buildTypedWorkflowNextAction({
        topic: { runs: [] },
        readiness: { specReady: true, planReady: true, tasksReady: true },
        workflowGraphPlan: graph,
        workflowRun: null,
      })
    : {
        id: "planning-gate-unavailable",
        label: "等待计划就绪",
        description: warnings[0] ?? "当前计划尚未形成可确认的执行门禁。",
        kind: "read-only" as const,
        enabled: false,
        requiresConfirmation: false,
        disabledReason: warnings[0] ?? "执行授权尚未就绪。",
      };
  return {
    ...base,
    title: topic.title,
    subtitle: topic.boundChangeId ?? topic.id,
    state: "active",
    userStatus: gateReady ? "waiting-confirmation" : "processing",
    userStatusLabel: gateReady ? "等待确认" : "处理中",
    conversationId: topic.id,
    demandId: topic.id,
    boundChangeId: topic.boundChangeId ?? undefined,
    conversationLifecycle: topic.state === "active" ? "active" : "archived-readonly",
    workflowGraphPlan: graph,
    intake: {
      ...base.intake,
      goal: topic.title,
      currentUnderstanding: graph ? "计划已接受并绑定当前项目 Harness Change。" : "正在核对当前计划证据。",
      source: "topic",
      relatedArtifacts: graph?.artifact ? [graph.artifact] : [],
      missingInfo: [],
    },
    blockers: warnings,
    warnings: [],
    nextAction,
    memoryIsolation: {
      projectStableNamespace: "project/stable",
      currentChangeNamespace: topic.boundChangeId ? `project/change/${topic.boundChangeId}` : undefined,
      providerSessionNamespace: "agent/{roleId}/session/{sessionId}",
      runNamespaces: [],
      relatedWorkpads: [],
      stableFactSources: ["project-harness"],
      writeBoundaries: ["runtime-sidecar", "project-skill"],
      warnings: [],
    },
  };
}

function projectHarnessStatus(resolution: ProjectRuntimeResolution): WorkbenchProjectHarnessStatus {
  return {
    kind: "project-skill",
    registered: true,
    managed: true,
    memoryAvailable: true,
    harnessReady: true,
    projectId: resolution.harness.projectId,
    skillName: resolution.harness.skillName,
    skillRevision: resolution.harness.skillRevision,
    contentFingerprint: resolution.harness.contentFingerprint,
    runtimeAvailable: true,
  };
}
