import { createHash } from "node:crypto";
import { DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY } from "../provider-runtime/project-harness-discovery.js";
import { resolveProjectRuntimeState } from "../project-runtime/coordinator.js";
import type { ProjectRuntimeResolution } from "../project-runtime/context.js";
import type { ProjectWorkbenchPathPort } from "../project-runtime/paths.js";
import { listRuns } from "../run/manager.js";
import type { ManagedProject, RunMetadata } from "../types/index.js";
import { buildMainAgentExecutionContext } from "./main-agent-context.js";
import { runWorkbenchWorkflowActionService } from "./actions/service.js";
import { artifactForActionResult, extractRunId, labelForAction, summarizeActionResult, workflowFailureMessage } from "./actions/results.js";
import { assertWorkflowActionScope, auditHighImpactWorkflowAction, workflowActionScopePayload, workflowActionTargetId } from "./actions/boundary.js";
import { dispatchWorkbenchWorkflowAction } from "./actions/dispatcher.js";
import { buildWorkbenchActionHandlers } from "./actions/handlers/index.js";
import { recordWorkbenchDecision } from "./decisions.js";
import { createAssistantTranscriptCapture } from "./live-transcript.js";
import { getSingleActiveChangeId, resolveProjectHarnessTopic } from "./topic-resolver.js";
import { openCanonicalTimelineWriter } from "./canonical-timeline-command.js";
import { collectAllConversationThreadEntries, readConversationThread as readThreadLog } from "./conversation-thread-log.js";
import { openProjectRuntimeWorkbenchDatabase } from "./persistence/open-workbench-database.js";
import { resolveConversationId } from "./conversation-identity.js";
import type { TopicMessageResult, TopicThreadEntry, ValidatedPlanHandoffIntent, WorkbenchLiveSink, WorkbenchWorkflowActionRequest, WorkbenchWorkflowActionResult, WorkbenchWorkflowActionType } from "./types.js";
import type { ConversationTurnRoutingPort } from "./conversation-turn-contract.js";

export interface WorkflowConversationPorts {
  postConversationMessage?: (
    project: ManagedProject,
    conversationId: string,
    input: string,
    live?: WorkbenchLiveSink,
  ) => Promise<TopicMessageResult>;
  continueMainAgentTurn?: (
    project: ManagedProject,
    conversationId: string,
    message: string,
    live?: WorkbenchLiveSink,
    planHandoff?: ValidatedPlanHandoffIntent,
    options?: { goalResume?: { deliveryKey: string; contextText: string }; graphScopeId?: string },
  ) => Promise<TopicThreadEntry>;
  interruptMainAgentTurn?: ConversationTurnRoutingPort["interruptMainAgentTurn"];
}

const PROJECT_SCOPED_WORKFLOW_ACTIONS = new Set<WorkbenchWorkflowActionType>([
  "demand.worker.start-available",
  "demand.worker.reconcile",
  "orchestrator.pump",
]);

export async function listTopicMessages(project: ManagedProject, changeId: string): Promise<TopicThreadEntry[]> {
  const resolution = await requireReadyProjectRuntime(project);
  await resolveProjectHarnessTopic(resolution, changeId);
  return readThreadLog(resolution.paths, changeId);
}

export async function readConversationThread(runtime: ProjectWorkbenchPathPort, changeId: string): Promise<TopicThreadEntry[]> {
  return readThreadLog(runtime, changeId);
}

export async function runWorkbenchWorkflowAction(
  project: ManagedProject,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
  ports: WorkflowConversationPorts,
): Promise<WorkbenchWorkflowActionResult> {
  if (request.actionType === "chat.ask") {
    if (!request.changeId) throw new Error("chat.ask requires a conversationId.");
    if (!request.prompt) throw new Error("chat.ask requires prompt.");
    const result = await requirePostConversationMessage(ports)(project, request.changeId, request.prompt, live);
    return {
      actionRunId: `chat-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      actionType: request.actionType,
      status: "completed",
      result,
      runId: result.run?.id,
    };
  }
  const handlers = buildWorkflowActionHandlers(ports);
  return runWorkbenchWorkflowActionService(project, request, live, {
    resolveChangeId: resolveWorkflowActionChangeId,
    createTranscriptCapture: createAssistantTranscriptCapture,
    openTimelineWriter: openCanonicalTimelineWriter,
    readThreadEntries: readWorkflowActionThreadEntries,
    execute: (ownerProject, changeId, ownerRequest, ownerLive) => executeWorkflowAction(ownerProject, changeId, ownerRequest, ownerLive, handlers),
    labelForAction,
    extractRunId,
    failureMessage: workflowFailureMessage,
    summarizeResult: summarizeActionResult,
    artifactForResult: artifactForActionResult,
    targetId: workflowActionTargetId,
    scopePayload: workflowActionScopePayload,
    recordDecision: recordWorkbenchDecision,
    resumeGoalAfterAction: (input) => resumeNativeGoalAfterAction(input, ports),
  });
}

export async function resumeNativeGoalAfterAction(input: {
  project: ManagedProject;
  changeId: string;
  actionRunId: string;
  actionType: WorkbenchWorkflowActionRequest["actionType"] | "result.apply";
  status: "completed" | "failed";
  result: unknown;
}, ports: WorkflowConversationPorts): Promise<void> {
  const resolution = await requireReadyProjectRuntime(input.project);
  await resolveProjectHarnessTopic(resolution, input.changeId);
  const conversationId = await resolveConversationId(input.project, input.changeId);
  const projectId = resolution.harness.projectId;
  const database = await openProjectRuntimeWorkbenchDatabase(resolution.paths);
  let graphScopeId: string | null = null;
  try {
    const conversation = database.conversations.readConversation(projectId, conversationId);
    const link = conversation ? database.providerAttempts.readProviderThread(projectId, conversationId, conversation.selectedProviderId, "main-agent") : null;
    const attempt = link ? database.providerAttempts.readProviderAttempt(projectId, link.attemptId) : null;
    if (!link || attempt?.operationProfile !== "main" || attempt.roleId !== "main-agent") return;
    graphScopeId = conversation?.currentGraphScopeId ?? null;
  } finally {
    database.close();
  }
  if (!graphScopeId) throw new Error("Native Goal continuation requires the current Conversation graph scope.");
  const entries = await readThreadLog(resolution.paths, input.changeId);
  const actionStartedIndex = entries.findIndex((entry) => entry.actionRunId === input.actionRunId && entry.type === "workflow.started");
  if (actionStartedIndex >= 0 && entries.slice(actionStartedIndex + 1).some((entry) => entry.actionType === "conversation.interrupt" && entry.type === "workflow.started")) return;
  const context = await buildMainAgentExecutionContext(
    input.project,
    resolution,
    conversationId,
    graphScopeId,
    input.changeId,
    `Workflow action ${input.actionType} ${input.status}.`,
  );
  const evidenceHash = createHash("sha256").update(stableJson(input.result)).digest("hex");
  await requireContinueMainAgentTurn(ports)(
    input.project,
    conversationId,
    `Continue the current native Goal after ${input.actionType} ${input.status}.`,
    undefined,
    undefined,
    {
      goalResume: {
        deliveryKey: `${input.actionRunId}:${evidenceHash}`,
        contextText: [
          context,
          "",
          "Canonical action evidence:",
          JSON.stringify({ actionRunId: input.actionRunId, actionType: input.actionType, status: input.status, evidenceHash, result: input.result }, null, 2),
          "",
          "Read this evidence and autonomously decide whether to continue the accepted workflow, request a Plan revision, wait for user confirmation, or complete the current Goal.",
        ].join("\n"),
      },
    },
  );
}

export async function getWorkbenchActionEvents(project: ManagedProject, actionRunId: string): Promise<TopicThreadEntry[]> {
  const resolution = await requireReadyProjectRuntime(project);
  return (await collectAllConversationThreadEntries(resolution.paths)).filter((entry) => entry.actionRunId === actionRunId);
}

async function findRunningRunForChange(project: ManagedProject, changeId: string): Promise<RunMetadata | null> {
  const resolution = await requireReadyProjectRuntime(project);
  const runs = await listRuns(resolution.paths).catch(() => []);
  return runs.find((run) => run.changeId === changeId && (run.status === "created" || run.status === "running")) ?? null;
}

async function readWorkflowActionThreadEntries(project: ManagedProject, changeId: string): Promise<TopicThreadEntry[]> {
  const resolution = await requireReadyProjectRuntime(project);
  await resolveProjectHarnessTopic(resolution, changeId);
  return readThreadLog(resolution.paths, changeId);
}

async function resolveWorkflowActionChangeId(project: ManagedProject, request: WorkbenchWorkflowActionRequest): Promise<string> {
  if (request.changeId) return request.changeId;
  if (PROJECT_SCOPED_WORKFLOW_ACTIONS.has(request.actionType)) return getSingleActiveChangeId(project);
  throw new Error(`${request.actionType} requires changeId.`);
}

async function executeWorkflowAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
  handlers: ReturnType<typeof buildWorkbenchActionHandlers>,
): Promise<unknown> {
  assertWorkflowActionScope(request);
  const conversationId = await resolveConversationId(project, changeId);
  await auditHighImpactWorkflowAction(project, conversationId, changeId, request, live);
  return dispatchWorkbenchWorkflowAction(handlers, project, changeId, request, live, conversationId);
}

function buildWorkflowActionHandlers(ports: WorkflowConversationPorts): ReturnType<typeof buildWorkbenchActionHandlers> {
  return buildWorkbenchActionHandlers({
    postConversationMessage: requirePostConversationMessage(ports),
    findRunningRunForChange,
    interruptProviderTurn: ports.interruptMainAgentTurn,
    continueTopicGoal: async (project, changeId, prompt, live) => {
      const conversationId = await resolveConversationId(project, changeId);
      const continuation = prompt?.trim() || "Continue the current accepted objective from the latest project evidence.";
      const actionRunId = [...await readWorkflowActionThreadEntries(project, changeId)]
        .reverse()
        .find((entry) => entry.type === "workflow.started" && entry.actionType === "conversation.continue" && entry.status === "running")
        ?.actionRunId;
      if (!actionRunId) throw new Error("Explicit Goal continuation requires the current Workbench action identity.");
      return requireContinueMainAgentTurn(ports)(project, conversationId, continuation, live, undefined, {
        goalResume: {
          deliveryKey: `conversation-continue:${actionRunId}`,
          contextText: `The user explicitly requested continuation of the current native Goal.\n\n${continuation}`,
        },
      });
    },
  });
}

function requirePostConversationMessage(ports: WorkflowConversationPorts): NonNullable<WorkflowConversationPorts["postConversationMessage"]> {
  return ports.postConversationMessage ?? (async () => {
    throw new Error("Workflow action requires the Conversation message port.");
  });
}

function requireContinueMainAgentTurn(ports: WorkflowConversationPorts): NonNullable<WorkflowConversationPorts["continueMainAgentTurn"]> {
  return ports.continueMainAgentTurn ?? (async () => {
    throw new Error("Workflow action requires the Main Agent continuation port.");
  });
}

async function requireReadyProjectRuntime(project: ManagedProject): Promise<ProjectRuntimeResolution> {
  const state = await resolveProjectRuntimeState(project, {
    discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
  });
  if (state.state !== "ready") {
    throw new Error(`Project Harness is not ready for Workflow action: ${state.state}.`);
  }
  return state.resolution;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
