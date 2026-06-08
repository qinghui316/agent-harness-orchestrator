import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { z } from "zod";
import { startAuditRun } from "../audit/manager.js";
import {
  completeAgentTask,
  createAgentTask,
  listAgentTasks,
  recordMainAgentDecision,
} from "../agent-task/manager.js";
import {
  createMainAgentOrchestrationState,
  decideNextMainAgentOrchestration,
  type MainAgentOrchestrationDecision,
  type MainAgentOrchestrationRole,
  type MainAgentOrchestrationState,
} from "../agent-task/orchestration-engine.js";
import { buildCodexReadonlyArgv, buildCodexReadonlyResumeArgv, detectCodexCapabilities } from "../codex/capabilities.js";
import { detectCodexAppServerCapability, getActiveCodexAppServerTurn, runCodexAppServerTurn, type CodexAppServerNotification } from "../codex/app-server.js";
import { createCodexJsonlStreamParser, extractCodexSessionIdFromJsonl, extractFinalMessageFromCodexJsonl, truncateReadablePreview, type CodexJsonlStreamEvent } from "../codex/jsonl.js";
import { createConcurrentChange, getChangeStatusForChange } from "../change/manager.js";
import { acceptPlanProposal, acceptSpecProposal, startPlanProposalRun, startSpecProposalRun } from "../change/proposals.js";
import { getActiveChanges } from "../ecl/index.js";
import { buildAcMap } from "../ecl/anchors.js";
import {
  claimAvailableDemandWorkers,
  claimNextDemandWorker,
  completeDemandWorkerAttempt,
  enqueueDemandWorker,
  getDemandWorkerForChange,
  markDemandWorkerRunning,
  reconcileDemandWorkers,
  recordMainOrchestratorDecision,
  releaseDemandWorker,
} from "../demand-worker/manager.js";
import { readJsonFile, writeJsonFile } from "../fs/json.js";
import { assertWritableMemory, resolveProjectMemory } from "../memory/resolver.js";
import { appendRunEvent, buildContextProjection, buildRunId, listRuns } from "../run/manager.js";
import { isRunStopRequested, requestRunStop } from "../run/control.js";
import { executeProcessStreaming } from "../run/process.js";
import { getEnabledSkillContext } from "../skill/catalog.js";
import { getSpecTestDriftReport } from "../spec-test/drift.js";
import { runIntegrationCheck } from "../integration-check/manager.js";
import { prepareLandingPackage, reviewLandingPackage } from "../landing/manager.js";
import { mergeNextLandingQueueCandidate, prepareLandingQueue, refreshLandingQueue } from "../landing-queue/manager.js";
import { createDraftPr, preparePrDraftPackage, refreshPrDraftStatus } from "../pr-draft/manager.js";
import {
  completePrFeedbackReworkAttempt,
  refreshPrFeedback,
  startPrFeedbackReworkAttempt,
  updatePrDraftFromFeedback,
} from "../pr-feedback/manager.js";
import {
  preparePrReviewReadiness,
  preparePrReviewReplyDraft,
  refreshPrReviewState,
  resolvePrReviewThread,
  submitPrForHumanReview,
  submitPrReviewReply,
} from "../pr-review/manager.js";
import { mergeRemoteLanding, prepareRemoteLandingReadiness, refreshRemoteLanding } from "../remote-landing/manager.js";
import {
  cleanupRemoteBranchAfterMerge,
  prepareLocalSync,
  preparePostMergeHandoff,
  prepareRemoteBranchCleanup,
  syncLocalAfterMerge,
} from "../post-merge/manager.js";
import { reconcileTaskRuns } from "../task-run/manager.js";
import {
  createWorkflowRunForValidatedTaskQueue,
  reconcileWorkflowTaskQueue,
  validateWorkflowTaskQueueProposalStart,
} from "../workflow-runtime/taskqueue.js";
import {
  runCodeValidateAuditSequence,
  runTaskQueueSequence,
  runTaskRunCodeValidateAuditSequence,
  sourceRefreshReworkPrompt,
} from "../workflow-runtime/code-workflow.js";
import {
  buildTaskQueueProposalFromReadiness,
  compileWorkflowGraphPlan,
  displayArtifactPath,
  hashArtifactRefs,
  readLatestDecompositionPlan,
  readLatestDecompositionReadinessManifest,
  readLatestTaskQueueProposal,
  readLatestWorkflowGraphPlan,
  readWorkflowGraphPlan,
  renderTaskQueueProposalMarkdown,
  supersedeExistingTaskQueueProposal,
  writeDecompositionPlan,
  writeDecompositionReadinessManifest,
  writeTaskQueueProposal,
  type DecompositionPlan,
  type DecompositionReadinessGuardrail,
  type DecompositionReadinessManifest,
  type DecompositionReadinessStatus,
  type DecompositionReadinessUnit,
  type DecompositionRecommendation,
  type DecompositionUnit,
  type TaskQueueProposal,
  type WorkflowGraphPlan,
} from "../workflow-artifacts/manager.js";
import { startValidationRun } from "../validation/manager.js";
import { buildAgentSystemPrompt, buildRunAgentRecord, resolveAgentRole } from "../agent/catalog.js";
import type { ManagedProject, ResolvedMemory, RunMetadata, RunStatus } from "../types/index.js";
import { runWorkbenchWorkflowActionService } from "./actions/service.js";
import { artifactForActionResult, extractRunId, labelForAction, summarizeActionResult, workflowFailureMessage } from "./actions/results.js";
import { assertWorkflowActionScope, auditHighImpactWorkflowAction, workflowActionScopePayload, workflowActionTargetId } from "./actions/boundary.js";
import { dispatchWorkbenchWorkflowAction, type WorkbenchActionHandlerMap } from "./actions/dispatcher.js";
import { readLatestPlanningBundle } from "./actions/planning-bundle.js";
import { createAssistantTranscriptCapture } from "./live-transcript.js";
import { WorkbenchStore, type StoredDecisionRecord } from "./store.js";
import { appendTopicThreadLogEntry, collectAllTopicThreadEntries, readTopicThreadLog as readThreadLog } from "./thread-log.js";
import type {
  OrchestrationPlanCard,
  PlanningArtifactBundle,
  SuggestedAction,
  TopicMessageInput,
  TopicMessageResult,
  TopicRoutingDecision,
  TopicRuntimeMetadata,
  TopicThreadEntry,
  WorkbenchAssistantEvent,
  WorkbenchLiveEvent,
  WorkbenchLiveSink,
  WorkbenchWorkflowActionRequest,
  WorkbenchWorkflowActionResult,
  WorkbenchWorkflowActionType,
} from "./types.js";
export type {
  AssistantTurnActivity,
  AssistantTurnBlock,
  AssistantTurnBlockKind,
  OrchestrationPlanCard,
  PlanningArtifactBundle,
  SuggestedAction,
  TopicMessageInput,
  TopicMessageResult,
  TopicRoutingDecision,
  TopicRuntimeMetadata,
  TopicThreadEntry,
  WorkbenchAssistantEvent,
  WorkbenchLiveEvent,
  WorkbenchLiveSink,
  WorkbenchLiveToolEvent,
  WorkbenchMessageMode,
  WorkbenchWorkflowActionRequest,
  WorkbenchWorkflowActionResult,
  WorkbenchWorkflowActionType,
} from "./types.js";

function emitLive(live: WorkbenchLiveSink | undefined, event: WorkbenchLiveEvent): void {
  try {
    live?.emit(event);
  } catch {
    // Live transport is best-effort; persisted thread/run artifacts remain canonical.
  }
}

const runtimeMetadataSchema = z.object({
  version: z.literal("1.0"),
  changeId: z.string(),
  codexSessionId: z.string().nullable(),
  updatedAt: z.string(),
});
const PROJECT_SCOPED_WORKFLOW_ACTIONS = new Set<WorkbenchWorkflowActionType>([
  "demand.worker.start-available",
  "demand.worker.reconcile",
  "orchestrator.pump",
]);

export async function createWorkbenchTopic(project: ManagedProject, input: { title: string; body?: string }): Promise<{ changeId: string; title: string; state: "active" }> {
  const result = await createConcurrentChange(project, { title: input.title, body: input.body });
  await appendTopicThreadEntry(project, result.change.id, {
    type: "user.message",
    text: input.body ?? input.title,
  });
  return { changeId: result.change.id, title: result.change.title, state: "active" };
}

export async function listTopicMessages(project: ManagedProject, changeId: string): Promise<TopicThreadEntry[]> {
  const { memory, changePath } = await resolveTopic(project, changeId);
  return readThreadLog(memory, changePath);
}

export async function readTopicThreadLog(memory: ResolvedMemory, changePath: string): Promise<TopicThreadEntry[]> {
  return readThreadLog(memory, changePath);
}

export async function postTopicMessage(project: ManagedProject, changeId: string, input: string | TopicMessageInput, live?: WorkbenchLiveSink): Promise<TopicMessageResult> {
  const parsed = normalizeTopicMessageInput(input);
  if (parsed.mode === "plan") return postTopicPlanMessage(project, changeId, parsed.message, live);
  const topicState = await getTopicLifecycleState(project, changeId);
  const runningRun = await findRunningRunForChange(project, changeId);
  if (topicState === "archive" && looksLikeImplementationRequest(parsed.message)) {
    const user = await appendTopicThreadEntry(project, changeId, { type: "user.message", text: parsed.message, status: "follow-up-requested" });
    live?.emit({ event: "topic.message", data: user });
    const followUp = await createWorkbenchTopic(project, {
      title: `后续：${parsed.message.split(/\r?\n/)[0].slice(0, 44)}`,
      body: [`Linked follow-up from archived demand ${changeId}.`, "", parsed.message].join("\n"),
    });
    const assistant = await appendTopicThreadEntry(project, changeId, {
      type: "assistant.message",
      text: `这个需求对话已归档，不能继续承载新的实现工作。我已创建 linked follow-up 需求对话：${followUp.changeId}。`,
      status: "follow-up-created",
      artifact: followUp.changeId,
    });
    live?.emit({ event: "assistant.message", data: assistant });
    return { user, assistant, run: null, codexSessionId: null, mode: "chat", routingDecision: "new-topic-required", assistantMessage: assistant.text ?? "" };
  }
  if (runningRun) {
    const activeTurn = getActiveCodexAppServerTurn(changeId);
    if (activeTurn) {
      const user = await appendTopicThreadEntry(project, changeId, { type: "user.message", text: parsed.message, status: "steering-sent", runId: activeTurn.runId });
      live?.emit({ event: "topic.message", data: user });
      await activeTurn.steer(parsed.message);
      const assistant = await appendTopicThreadEntry(project, changeId, {
        type: "assistant.message",
        text: "已发送给当前执行。",
        status: "steering-sent",
        runId: activeTurn.runId,
      });
      live?.emit({ event: "assistant.message", data: assistant });
      emitAssistantEvent(live, {
        runId: activeTurn.runId,
        kind: "status",
        phase: "steered",
        title: "已发送给当前执行",
        summary: "这条输入已通过 Codex app-server 发送给当前运行中的 turn。",
      });
      return { user, assistant, run: null, codexSessionId: null, mode: "chat", routingDecision: "same-topic", assistantMessage: assistant.text ?? "" };
    }
    const user = await appendTopicThreadEntry(project, changeId, { type: "user.message", text: parsed.message, status: "pending-feedback", runId: runningRun.id });
    live?.emit({ event: "topic.message", data: user });
    const assistant = await appendTopicThreadEntry(project, changeId, {
      type: "assistant.message",
      text: "已记录，将在下一轮生效。",
      status: "pending-feedback",
      runId: runningRun.id,
    });
    live?.emit({ event: "assistant.message", data: assistant });
    return { user, assistant, run: null, codexSessionId: null, mode: "chat", routingDecision: "same-topic", assistantMessage: assistant.text ?? "" };
  }
  const user = await appendTopicThreadEntry(project, changeId, { type: "user.message", text: parsed.message });
  live?.emit({ event: "topic.message", data: user });
  const capture = createAssistantTranscriptCapture(live);
  const chat = await runCodexChat(project, changeId, parsed.message, capture.sink);
  const assistantText = chat.message.trim() || capture.text.trim();
  const assistant = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    text: assistantText,
    runId: chat.run.id,
    artifact: chat.run.artifacts.lastMessage,
    activity: capture.activity,
    blocks: capture.blocks,
  });
  live?.emit({ event: "assistant.message", data: assistant });
  return { user, assistant, run: chat.run, codexSessionId: chat.codexSessionId, mode: "chat", routingDecision: "same-topic", assistantMessage: assistantText };
}

async function findRunningRunForChange(project: ManagedProject, changeId: string): Promise<RunMetadata | null> {
  const memory = await resolveProjectMemory(project);
  const runs = await listRuns(memory).catch(() => []);
  return runs.find((run) => run.changeId === changeId && (run.status === "created" || run.status === "running")) ?? null;
}

async function getTopicLifecycleState(project: ManagedProject, changeId: string): Promise<"active" | "archive"> {
  const { changePath } = await resolveTopic(project, changeId);
  if (changePath.includes("/archive/")) return "archive";
  return "active";
}

function looksLikeImplementationRequest(message: string): boolean {
  return /(新增|修改|实现|修复|继续做|继续改|执行|开发|补测试|改代码|apply|merge|implement|fix|code)/i.test(message);
}

export async function appendTopicThreadEntry(project: ManagedProject, changeId: string, input: Omit<TopicThreadEntry, "id" | "timestamp" | "changeId">): Promise<TopicThreadEntry> {
  const { memory, changePath } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Topic thread update");
  const entry: TopicThreadEntry = {
    id: `msg-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    changeId,
    ...input,
  };
  await appendTopicThreadLogEntry(memory, changePath, entry);
  return entry;
}

export async function runWorkbenchWorkflowAction(project: ManagedProject, request: WorkbenchWorkflowActionRequest, live?: WorkbenchLiveSink): Promise<WorkbenchWorkflowActionResult> {
  return runWorkbenchWorkflowActionService(project, request, live, {
    resolveChangeId: resolveWorkflowActionChangeId,
    createTranscriptCapture: createAssistantTranscriptCapture,
    appendThreadEntry: appendTopicThreadEntry,
    execute: executeWorkflowAction,
    labelForAction,
    extractRunId,
    failureMessage: workflowFailureMessage,
    summarizeResult: summarizeActionResult,
    artifactForResult: artifactForActionResult,
    targetId: workflowActionTargetId,
    scopePayload: workflowActionScopePayload,
    recordDecision: recordWorkbenchDecision,
  });
}

async function resolveWorkflowActionChangeId(project: ManagedProject, request: WorkbenchWorkflowActionRequest): Promise<string> {
  if (request.changeId) return request.changeId;
  if (PROJECT_SCOPED_WORKFLOW_ACTIONS.has(request.actionType)) return getSingleActiveChangeId(project);
  throw new Error(`${request.actionType} requires changeId.`);
}

export async function getWorkbenchActionEvents(project: ManagedProject, actionRunId: string): Promise<TopicThreadEntry[]> {
  const memory = await resolveProjectMemory(project);
  if (!existsSync(join(memory.changesRoot, "active"))) return [];
  const entries = await collectAllTopicThreadEntries(memory);
  return entries.filter((entry) => entry.actionRunId === actionRunId);
}

async function executeWorkflowAction(project: ManagedProject, changeId: string, request: WorkbenchWorkflowActionRequest, live?: WorkbenchLiveSink): Promise<unknown> {
  assertWorkflowActionScope(request);
  await auditHighImpactWorkflowAction(project, changeId, request, live);
  return dispatchWorkbenchWorkflowAction(workflowActionHandlers, project, changeId, request, live);
}

const workflowActionHandlers: WorkbenchActionHandlerMap = {
  "chat.ask": async (project, changeId, request, live) => {
    if (!request.prompt) throw new Error("chat.ask requires prompt.");
    return postTopicMessage(project, changeId, request.prompt, live);
  },
  "change.spec.propose": async (project, _changeId, request) => startSpecProposalRun(project, { prompt: request.prompt }),
  "change.spec.accept": async (project, _changeId, request) => {
    if (!request.proposalId) throw new Error("change.spec.accept requires proposalId.");
    return acceptSpecProposal(project, request.proposalId);
  },
  "change.plan.propose": async (project, _changeId, request) => startPlanProposalRun(project, { prompt: request.prompt }),
  "change.plan.accept": async (project, _changeId, request) => {
    if (!request.proposalId) throw new Error("change.plan.accept requires proposalId.");
    return acceptPlanProposal(project, request.proposalId);
  },
  "planning.generate": async (project, changeId, request, live) => generatePlanningDraft(project, changeId, request.prompt, live, false),
  "planning.revise": async (project, changeId, request, live) => generatePlanningDraft(project, changeId, request.prompt, live, true),
  "planning.confirm-execution": async (project, changeId, request, live) => confirmPlanningAndStartPipeline(project, changeId, request, live),
  "planning.decompose": async (project, changeId, request, live) => generateDecompositionPlan(project, changeId, request.prompt, live),
  "planning.decomposition.confirm": async (project, changeId, request, live) => confirmDecompositionPlan(project, changeId, request, live),
  "planning.decomposition.assess-readiness": async (project, changeId, request, live) => assessDecompositionReadiness(project, changeId, request, live),
  "planning.taskqueue.propose": async (project, changeId, request, live) => proposeTaskQueue(project, changeId, request, live),
  "planning.workflowgraph.compile": async (project, changeId, request, live) => compileTaskQueueWorkflowGraph(project, changeId, request, live),
  "planning.taskqueue.confirm-start": async (project, changeId, request, live) => confirmTaskQueueProposalAndStart(project, changeId, request, live),
  "orchestrator.evaluate": async (project, changeId) => evaluateDemandOrchestrator(project, changeId),
  "orchestrator.pump": async (project, changeId, request, live) => pumpDemandWorkersForAction(project, request.prompt, live, changeId),
  "demand.worker.enqueue": async (project, changeId) => enqueueDemandWorkerForAction(project, changeId),
  "demand.worker.claim": async (project, changeId, request, live) => startNextDemandWorkerForAction(project, changeId, request.prompt, live),
  "demand.worker.start-next": async (project, changeId, request, live) => startNextDemandWorkerForAction(project, changeId, request.prompt, live),
  "demand.worker.start-available": async (project, changeId, request, live) => pumpDemandWorkersForAction(project, request.prompt, live, changeId),
  "demand.worker.reconcile": async (project) => reconcileDemandWorkers(await resolveProjectMemory(project)),
  "demand.worker.release": async (project, changeId, request) => releaseDemandWorkerForAction(project, changeId, request.prompt),
  "role.pipeline.start": async (project, changeId, request, live) => runMainAgentToolOrchestration(project, changeId, request.prompt, live, false),
  "role.pipeline.continue": async (project, changeId, request, live) => runMainAgentToolOrchestration(project, changeId, request.prompt, live, true),
  "role.pipeline.stop": async (project, changeId, request, live) => stopRunningPipeline(project, changeId, request.prompt, live),
  "role.pipeline.reconcile": async (project, changeId, request) => reconcileTaskRuns(project, { changeId, taskRunId: request.taskRunId }),
  "conversation.steer": async (project, changeId, request, live) => steerConversation(project, changeId, request.prompt, live),
  "conversation.interrupt": async (project, changeId, request, live) => interruptConversation(project, changeId, request.prompt, live),
  "conversation.continue": async (project, changeId, request, live) => runMainAgentToolOrchestration(project, changeId, request.prompt, live, true),
  "result.refresh-rework": async (project, changeId, request, live) => {
    if (!request.worktreeId) throw new Error("result.refresh-rework requires worktreeId.");
    return runCodeValidateAuditSequence(project, changeId, sourceRefreshReworkPrompt(request.worktreeId, request.prompt), live, undefined, undefined, "rework-coder");
  },
  "result.revalidate": async (project, changeId, request) => {
    if (!request.worktreeId) throw new Error("result.revalidate requires worktreeId.");
    return startValidationRun(project, { changeId, worktree: request.worktreeId });
  },
  "result.reaudit": async (project, changeId, request) => {
    if (!request.worktreeId) throw new Error("result.reaudit requires worktreeId.");
    return startAuditRun(project, { changeId, worktreeId: request.worktreeId, prompt: request.prompt ?? "Re-run audit for the selected result review evidence." });
  },
  "result.refresh-status": async (_project, changeId, request) => ({ status: "refreshed", changeId, worktreeId: request.worktreeId }),
  "apply-check.run": async (project, _changeId, request) => runIntegrationCheck(project, request.worktreeIds ?? (request.worktreeId ? [request.worktreeId] : undefined)),
  "landing.prepare": async (project, changeId, request, live) => prepareLandingForAction(project, changeId, request, live),
  "landing.review": async (project, changeId, request, live) => reviewLandingForAction(project, changeId, request, live),
  "landing.refresh": async (project, changeId, request, live) => prepareLandingForAction(project, changeId, request, live),
  "landing-queue.prepare": async (project, changeId, _request, live) => prepareLandingQueueForAction(project, changeId, live),
  "landing-queue.refresh": async (project, changeId, _request, live) => refreshLandingQueueForAction(project, changeId, live),
  "landing-queue.merge-next": async (project, changeId, request, live) => mergeNextLandingQueueForAction(project, changeId, request, live),
  "landing-queue.skip": async (project, changeId, _request, live) => refreshLandingQueueForAction(project, changeId, live),
  "landing-queue.remove-stale": async (project, changeId, _request, live) => refreshLandingQueueForAction(project, changeId, live),
  "pr-draft.prepare": async (project, changeId, request, live) => preparePrDraftForAction(project, changeId, request, live),
  "pr-draft.create": async (project, changeId, request, live) => createPrDraftForAction(project, changeId, request, live),
  "pr-draft.refresh": async (project, changeId, request, live) => refreshPrDraftForAction(project, changeId, request, live),
  "pr-feedback.refresh": async (project, changeId, request, live) => refreshPrFeedbackForAction(project, changeId, request, live),
  "pr-feedback.evaluate": async (project, changeId, request, live) => refreshPrFeedbackForAction(project, changeId, request, live),
  "pr-feedback.rework": async (project, changeId, request, live) => reworkPrFeedbackForAction(project, changeId, request, live),
  "pr-feedback.update-draft": async (project, changeId, request, live) => updatePrDraftForAction(project, changeId, request, live),
  "pr-review.prepare": async (project, changeId, request, live) => preparePrReviewForAction(project, changeId, request, live),
  "pr-review.submit": async (project, changeId, request, live) => submitPrReviewForAction(project, changeId, request, live),
  "pr-review.refresh": async (project, changeId, request, live) => refreshPrReviewForAction(project, changeId, request, live),
  "pr-review.feedback-refresh": async (project, changeId, request, live) => refreshPrFeedbackForAction(project, changeId, { ...request, actionType: "pr-feedback.refresh" }, live),
  "pr-review.feedback-evaluate": async (project, changeId, request, live) => refreshPrFeedbackForAction(project, changeId, { ...request, actionType: "pr-feedback.refresh" }, live),
  "pr-review.rework": async (project, changeId, request, live) => reworkPrFeedbackForAction(project, changeId, { ...request, actionType: "pr-feedback.rework" }, live),
  "pr-review.reply-prepare": async (project, changeId, request, live) => preparePrReviewReplyForAction(project, changeId, request, live),
  "pr-review.reply-submit": async (project, changeId, request, live) => submitPrReviewReplyForAction(project, changeId, request, live),
  "pr-review.thread-resolve": async (project, changeId, request, live) => resolvePrReviewThreadForAction(project, changeId, request, live),
  "remote-landing.prepare": async (project, changeId, request, live) => prepareRemoteLandingForAction(project, changeId, request, live),
  "remote-landing.merge": async (project, changeId, request, live) => mergeRemoteLandingForAction(project, changeId, request, live),
  "remote-landing.refresh": async (project, changeId, request, live) => refreshRemoteLandingForAction(project, changeId, request, live),
  "post-merge.prepare": async (project, changeId, request, live) => preparePostMergeForAction(project, changeId, request, live),
  "post-merge.refresh": async (project, changeId, request, live) => preparePostMergeForAction(project, changeId, request, live),
  "post-merge.sync-local.prepare": async (project, changeId, request, live) => prepareLocalSyncForAction(project, changeId, request, live),
  "post-merge.sync-local.run": async (project, changeId, request, live) => syncLocalForAction(project, changeId, request, live),
  "post-merge.cleanup-branch.prepare": async (project, changeId, request, live) => prepareRemoteBranchCleanupForAction(project, changeId, request, live),
  "post-merge.cleanup-branch.run": async (project, changeId, request, live) => cleanupRemoteBranchForAction(project, changeId, request, live),
  "code.run": async (project, changeId, request, live) => runMainAgentToolOrchestration(project, changeId, request.prompt, live, false, request.taskIds, request.readinessManifestId),
  "task.run.start": async (project, changeId, request, live) => runTaskRunCodeValidateAuditSequence(project, changeId, request, live, "start"),
  "task.run.retry": async (project, changeId, request, live) => runTaskRunCodeValidateAuditSequence(project, changeId, request, live, "retry"),
  "task.run.reconcile": async (project, changeId, request) => reconcileTaskRuns(project, { changeId, taskRunId: request.taskRunId }),
  "task.queue.start": async (project, changeId, request, live) => runTaskQueueSequence(project, changeId, request, live),
  "task.queue.reconcile": async (project, changeId, request) => reconcileWorkflowTaskQueue(project, { changeId, queueRunId: request.queueRunId }),
  "validate.run": async (project, changeId, request) => startValidationRun(project, { changeId, worktree: request.worktreeId }),
  "audit.run": async (project, changeId, request) => startAuditRun(project, { changeId, worktreeId: request.worktreeId, prompt: request.prompt }),
  "spec-test.drift": async (project, _changeId, request) => getSpecTestDriftReport(project, { worktreeId: request.worktreeId }),
};

async function generatePlanningDraft(
  project: ManagedProject,
  changeId: string,
  prompt: string | undefined,
  live: WorkbenchLiveSink | undefined,
  revision: boolean,
): Promise<{ bundle: PlanningArtifactBundle }> {
  const { memory, changePath } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Planning draft");
  const task = await createAgentTask(memory, {
    conversationId: changeId,
    changeId,
    roleId: "planning-agent",
    kind: "foreground",
    summary: revision ? "Revise planning artifact bundle from user feedback." : "Generate planning artifact bundle from the demand conversation.",
    inputArtifacts: [changePath],
    initialStatus: "running",
  });
  await recordMainAgentDecision(memory, {
    changeId,
    recommendedAction: revision ? "planning.revise" : "planning.generate",
    userMessage: revision ? "修改方案草案" : "生成方案草案",
    requiresUserDecision: false,
    createTask: {
      roleId: "planning-agent",
      kind: "foreground",
      summary: task.summary,
      inputArtifacts: task.inputArtifacts,
    },
    reason: "The current demand needs a user-reviewable planning draft before canonical artifacts are written.",
  });
  const role = await resolveAgentRole(memory, "planning-agent");
  const thread = await readThreadLog(memory, changePath);
  const latestUserText = prompt?.trim()
    || [...thread].reverse().find((entry) => entry.type === "user.message")?.text
    || changeId;
  const planningRuntime = await runCodexChat(project, changeId, [
    "作为 planning-agent，请基于当前需求对话生成或修订方案草案。",
    "输出目标、约束、验收标准、实现方案、任务清单、风险和待确认点。",
    "不要修改文件；AHO 会在用户确认执行后再写入 canonical artifacts。",
    "",
    latestUserText,
  ].join("\n")).catch((error: unknown) => {
    emitAssistantEvent(live, {
      runId: changeId,
      kind: "status",
      phase: "planning-runtime-fallback",
      title: "方案草案运行时不可用",
      summary: error instanceof Error ? error.message : String(error),
      isError: true,
    });
    return null;
  });
  const previous = await readLatestPlanningBundle(memory, changePath).catch(() => null);
  const bundle = buildDeterministicPlanningBundle(memory, changePath, changeId, latestUserText, previous, revision);
  await writePlanningBundle(memory, changePath, bundle);
  emitAssistantEvent(live, {
    runId: bundle.id,
    kind: "plan-update",
    phase: "draft",
    title: revision ? "Planning draft revised" : "Planning draft generated",
    summary: "planning-agent produced a proposal/spec/design/tasks bundle for user review.",
    artifactRef: bundle.artifact,
  });
  const planCard: OrchestrationPlanCard = {
    title: "方案草案",
    summary: `目标：${bundle.goal}`,
    steps: [
      { label: "验收标准", description: bundle.acceptanceCriteria.join("；") || "等待补充验收标准。" },
      { label: "实现方案", description: bundle.design },
      { label: "任务清单", description: bundle.tasks.map((task) => `${task.id} ${task.title}`).join("；") || "等待拆解任务。" },
    ],
    warnings: bundle.openQuestions,
  };
  const assistant = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "planning-draft",
    text: [planningRuntime?.message.trim(), renderPlanningBundleSummary(bundle)].filter(Boolean).join("\n\n"),
    runId: planningRuntime?.run.id,
    artifact: planningRuntime?.run.artifacts.lastMessage ?? bundle.artifact,
    planCard,
    blocks: [
      {
        id: `${bundle.id}:prose`,
        runId: planningRuntime?.run.id ?? bundle.id,
        sequence: 1,
        kind: "prose",
        timestamp: new Date().toISOString(),
        source: planningRuntime ? "codex" : "aho",
        title: revision ? "方案草案已更新" : "方案草案",
        text: [planningRuntime?.message.trim(), renderPlanningBundleSummary(bundle)].filter(Boolean).join("\n\n"),
      },
      {
        id: `${bundle.id}:plan-card`,
        runId: bundle.id,
        sequence: 2,
        kind: "plan-card",
        timestamp: new Date().toISOString(),
        source: "aho",
        title: "方案草案",
        planCard,
      },
    ],
  });
  live?.emit({ event: "assistant.message", data: assistant });
  await recordWorkbenchDecision(project, {
    id: `planning:${bundle.id}`,
    changeId,
    decisionType: revision ? "planning.revise" : "planning.generate",
    status: "completed",
    label: revision ? "方案草案已更新" : "方案草案已生成",
    summary: "planning-agent generated a draft bundle. It is not canonical until confirmation.",
    targetId: bundle.id,
    runId: null,
    artifact: bundle.artifact,
    actionId: revision ? "planning.revise" : "planning.generate",
    payload: { role: buildRunAgentRecord(role), bundle },
    completedAt: new Date().toISOString(),
  });
  await completeAgentTask(memory, task, {
    status: "completed",
    summary: revision ? "Planning draft revised for user review." : "Planning draft generated for user review.",
    artifactRefs: [bundle.artifact, ...(planningRuntime?.run.artifacts.lastMessage ? [planningRuntime.run.artifacts.lastMessage] : [])],
    nextRecommendation: "Ask the user to confirm execution or request changes.",
  });
  return { bundle };
}

async function confirmPlanningAndStartPipeline(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  const { memory, changePath } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Confirm planning execution");
  const bundle = await readLatestPlanningBundle(memory, changePath);
  if (!request.planningBundleId) throw new Error("planning.confirm-execution requires planningBundleId.");
  if (bundle.id !== request.planningBundleId || bundle.status !== "draft") throw new Error("planning.confirm-execution target is stale or no longer confirmable.");
  const changeDir = join(memory.memoryRoot, changePath);
  await writeFile(join(changeDir, "spec.md"), bundle.specMd, "utf8");
  await writeFile(join(changeDir, "plan.md"), bundle.planMd, "utf8");
  await writeFile(join(changeDir, "tasks.md"), bundle.tasksMd, "utf8");
  const acMap = buildAcMap({
    changeId,
    specContent: bundle.specMd,
    tasksContent: bundle.tasksMd,
    placeholderFiles: [
      { path: "spec.md", content: bundle.specMd },
      { path: "plan.md", content: bundle.planMd },
      { path: "tasks.md", content: bundle.tasksMd },
    ],
  });
  await writeJsonFile(join(changeDir, "ac-map.json"), acMap);
  const confirmed = { ...bundle, status: "confirmed" as const, acMapCandidate: acMap, updatedAt: new Date().toISOString() };
  await writePlanningBundle(memory, changePath, confirmed);
  await recordMainAgentDecision(memory, {
    changeId,
    recommendedAction: "planning.confirm-execution",
    userMessage: "确认执行",
    requiresUserDecision: false,
    createTask: {
      roleId: "main-agent",
      kind: "foreground",
      summary: "Canonical planning artifacts were accepted; execution requires decomposition and readiness gates.",
      inputArtifacts: [confirmed.artifact],
    },
    reason: "The user confirmed the planning artifact bundle; Phase 7J requires typed readiness before code-producing execution.",
  });
  await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "planning-confirmed",
    text: "已确认规划：方案草案已写入内部 spec/plan/tasks/ac-map。下一步需要生成或确认 DecompositionPlan，并通过 readiness gate 后才能启动执行。",
    artifact: confirmed.artifact,
  });
  emitAssistantEvent(live, {
    runId: confirmed.id,
    kind: "status",
    phase: "confirmed",
    title: "Planning confirmed",
    summary: "Canonical planning artifacts were written after user confirmation.",
    artifactRef: confirmed.artifact,
  });
  return { bundle: confirmed, executionStarted: false };
}

async function generateDecompositionPlan(
  project: ManagedProject,
  changeId: string,
  prompt: string | undefined,
  live: WorkbenchLiveSink | undefined,
): Promise<{ plan: DecompositionPlan }> {
  const { memory, changePath } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Generate decomposition plan");
  const bundle = await readLatestPlanningBundle(memory, changePath).catch(() => null);
  const thread = await readThreadLog(memory, changePath);
  const plan = buildDeterministicDecompositionPlan(memory, changePath, changeId, bundle, thread, prompt);
  await writeDecompositionPlan(memory, changePath, plan);
  const planCard: OrchestrationPlanCard = {
    title: "拆分评估",
    summary: decompositionRecommendationLabel(plan.recommendation),
    steps: [
      { label: "建议", description: plan.rationale },
      { label: "执行单元", description: plan.units.map((unit) => `${unit.id} ${unit.title}`).join("；") || "无需拆分。" },
      { label: "恢复边界", description: plan.recoveryKeyInputs.notes.join("；") },
    ],
    warnings: [...plan.openQuestions, plan.riskSummary].filter(Boolean),
  };
  const assistant = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "decomposition-draft",
    text: renderDecompositionPlanSummary(plan),
    artifact: plan.artifact,
    planCard,
    blocks: [
      {
        id: `${plan.id}:plan-card`,
        runId: plan.id,
        sequence: 1,
        kind: "plan-card",
        timestamp: new Date().toISOString(),
        source: "aho",
        title: "拆分评估",
        planCard,
        artifactRef: plan.artifact,
      },
    ],
  });
  live?.emit({ event: "assistant.message", data: assistant });
  emitAssistantEvent(live, {
    runId: plan.id,
    kind: "plan-update",
    phase: "decomposition-draft",
    title: "DecompositionPlan drafted",
    summary: "Main-agent proposal was recorded for user review. It does not start execution.",
    artifactRef: plan.artifact,
  });
  await recordWorkbenchDecision(project, {
    id: `decomposition:${plan.id}`,
    changeId,
    decisionType: "planning.decompose",
    status: "completed",
    label: "拆分评估已生成",
    summary: "Generated a proposal-only DecompositionPlan. No execution artifacts were created.",
    targetId: plan.id,
    runId: null,
    artifact: plan.artifact,
    actionId: "planning.decompose",
    payload: { plan },
    completedAt: new Date().toISOString(),
  });
  return { plan };
}

async function confirmDecompositionPlan(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<{ plan: DecompositionPlan; executionStarted: false }> {
  const { memory, changePath } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Confirm decomposition plan");
  if (!request.decompositionPlanId) throw new Error("planning.decomposition.confirm requires decompositionPlanId.");
  const plan = await readLatestDecompositionPlan(memory, changePath);
  if (plan.id !== request.decompositionPlanId || plan.status !== "draft") {
    throw new Error("planning.decomposition.confirm target is stale or no longer confirmable.");
  }
  const confirmed: DecompositionPlan = { ...plan, status: "confirmed", updatedAt: new Date().toISOString() };
  await writeDecompositionPlan(memory, changePath, confirmed);
  await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "decomposition-confirmed",
    text: "已确认拆分方向：本阶段只记录 DecompositionPlan 接受，不会创建子 Change、TaskRun、AgentTask 或启动执行。",
    artifact: confirmed.artifact,
  });
  emitAssistantEvent(live, {
    runId: confirmed.id,
    kind: "status",
    phase: "decomposition-confirmed",
    title: "DecompositionPlan confirmed",
    summary: "Proposal acceptance was recorded without starting execution.",
    artifactRef: confirmed.artifact,
  });
  return { plan: confirmed, executionStarted: false };
}

async function assessDecompositionReadiness(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<{ manifest: DecompositionReadinessManifest; executionStarted: false }> {
  const { memory, changePath } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Assess decomposition readiness");
  if (!request.decompositionPlanId) throw new Error("planning.decomposition.assess-readiness requires decompositionPlanId.");
  const plan = await readLatestDecompositionPlan(memory, changePath);
  if (plan.id !== request.decompositionPlanId || plan.status !== "confirmed") {
    throw new Error("planning.decomposition.assess-readiness target is stale or no longer assessable.");
  }
  const manifest = await buildDecompositionReadinessManifest(memory, changePath, changeId, plan);
  await writeDecompositionReadinessManifest(memory, changePath, manifest);
  const assistant = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "decomposition-readiness",
    text: renderDecompositionReadinessSummary(manifest),
    artifact: manifest.artifact,
  });
  live?.emit({ event: "assistant.message", data: assistant });
  emitAssistantEvent(live, {
    runId: manifest.id,
    kind: "status",
    phase: "decomposition-readiness",
    title: "Decomposition readiness assessed",
    summary: "Confirmed DecompositionPlan was checked against execution guardrails. No execution artifacts were created.",
    artifactRef: manifest.artifact,
  });
  return { manifest, executionStarted: false };
}

async function proposeTaskQueue(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<{ proposal: TaskQueueProposal; executionStarted: false }> {
  const { memory, changePath } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "TaskQueueProposal generation");
  if (!request.readinessManifestId) throw new Error("planning.taskqueue.propose requires readinessManifestId.");
  const manifest = await readLatestDecompositionReadinessManifest(memory, changePath);
  if (manifest.id !== request.readinessManifestId || manifest.changeId !== changeId) {
    throw new Error("planning.taskqueue.propose target is stale or not scoped to the selected Change.");
  }
  await supersedeExistingTaskQueueProposal(memory, changePath);
  const proposal = await buildTaskQueueProposalFromReadiness(memory, changePath, changeId, manifest);
  await writeTaskQueueProposal(memory, changePath, proposal);
  await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "taskqueue-proposal",
    text: renderTaskQueueProposalMarkdown(proposal),
    artifact: proposal.artifact,
  });
  emitAssistantEvent(live, {
    runId: proposal.id,
    kind: "status",
    phase: "taskqueue-proposal",
    title: "TaskQueue proposal prepared",
    summary: "A typed TaskQueueProposal was generated; no execution records were created.",
    artifactRef: proposal.artifact,
  });
  return { proposal, executionStarted: false };
}

async function compileTaskQueueWorkflowGraph(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<{ graph: WorkflowGraphPlan; executionStarted: false }> {
  const { memory, changePath } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "WorkflowGraphPlan compile");
  if (!request.taskQueueProposalId) throw new Error("planning.workflowgraph.compile requires taskQueueProposalId.");
  if (!request.readinessManifestId) throw new Error("planning.workflowgraph.compile requires readinessManifestId.");
  const proposal = await readLatestTaskQueueProposal(memory, changePath);
  if (proposal.id !== request.taskQueueProposalId || proposal.changeId !== changeId || !["draft", "confirmed"].includes(proposal.status)) {
    throw new Error("planning.workflowgraph.compile target is stale or no longer compilable.");
  }
  const manifest = await readLatestDecompositionReadinessManifest(memory, changePath);
  if (manifest.id !== request.readinessManifestId || manifest.id !== proposal.readinessManifestId || manifest.status !== "ready-for-sequential-taskqueue-proposal") {
    throw new Error("planning.workflowgraph.compile readiness target is stale.");
  }
  const expectedSourceHashes = await hashArtifactRefs(memory, proposal.artifactRefs);
  for (const [artifact, hash] of Object.entries(expectedSourceHashes)) {
    if (proposal.sourceArtifactHashes[artifact] !== hash) {
      throw new Error(`WorkflowGraphPlan compile source artifact hash mismatch: ${artifact}.`);
    }
  }
  const confirmed = proposal.status === "confirmed"
    ? proposal
    : { ...proposal, status: "confirmed" as const, updatedAt: new Date().toISOString() };
  if (proposal.status !== "confirmed") await writeTaskQueueProposal(memory, changePath, confirmed);
  const graph = await compileWorkflowGraphPlan(memory, changePath, confirmed, manifest);
  await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "workflowgraph-compiled",
    text: `WorkflowGraphPlan ${graph.id} compiled from TaskQueueProposal ${confirmed.id}. No execution records were created.`,
    artifact: graph.artifact,
  });
  emitAssistantEvent(live, {
    runId: graph.id,
    kind: "file-change",
    phase: "workflowgraph-compiled",
    title: "WorkflowGraphPlan compiled",
    summary: "A versioned typed workflow graph was generated; no TaskQueue or WorkflowRun was started.",
    artifactRef: graph.artifact,
  });
  return { graph, executionStarted: false };
}

async function confirmTaskQueueProposalAndStart(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  const { memory, changePath } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "TaskQueueProposal start");
  if (!request.taskQueueProposalId) throw new Error("planning.taskqueue.confirm-start requires taskQueueProposalId.");
  if (!request.workflowGraphPlanId) throw new Error("planning.taskqueue.confirm-start requires workflowGraphPlanId.");
  if (!request.readinessManifestId) throw new Error("planning.taskqueue.confirm-start requires readinessManifestId.");
  if (!request.decompositionPlanId) throw new Error("planning.taskqueue.confirm-start requires decompositionPlanId.");
  const proposal = await readLatestTaskQueueProposal(memory, changePath);
  if (proposal.id !== request.taskQueueProposalId || proposal.changeId !== changeId || proposal.status !== "confirmed" || proposal.decompositionPlanId !== request.decompositionPlanId || proposal.readinessManifestId !== request.readinessManifestId) {
    throw new Error("planning.taskqueue.confirm-start target is stale or no longer startable.");
  }
  const manifest = await readLatestDecompositionReadinessManifest(memory, changePath);
  if (manifest.id !== proposal.readinessManifestId || manifest.status !== "ready-for-sequential-taskqueue-proposal") {
    throw new Error("planning.taskqueue.confirm-start readiness target is stale.");
  }
  const graph = await readWorkflowGraphPlan(memory, changePath, request.workflowGraphPlanId);
  if (graph.status !== "compiled" || graph.changeId !== changeId || graph.taskQueueProposalId !== proposal.id || graph.readinessManifestId !== manifest.id) {
    throw new Error("planning.taskqueue.confirm-start graph target is stale.");
  }
  const latestGraph = await readLatestWorkflowGraphPlan(memory, changePath);
  if (latestGraph.id !== graph.id) throw new Error("planning.taskqueue.confirm-start requires the latest matching WorkflowGraphPlan.");
  const validated = await validateWorkflowTaskQueueProposalStart(memory, project, changeId, proposal.id, graph.id);
  const workflow = await createWorkflowRunForValidatedTaskQueue(memory, project, validated);
  await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "taskqueue-starting",
    text: `WorkflowGraphPlan ${graph.id} confirmed for start; starting scoped sequential TaskQueue through WorkflowRun ${workflow.id}.`,
    artifact: graph.artifact,
  });
  const result = await runTaskQueueSequence(project, changeId, {
    ...request,
    actionType: "task.queue.start",
    taskQueueProposalId: proposal.id,
    workflowGraphPlanId: graph.id,
    readinessManifestId: manifest.id,
    decompositionPlanId: proposal.decompositionPlanId,
    workflowRunId: workflow.id,
  }, live);
  return result;
}

async function enqueueDemandWorkerForAction(project: ManagedProject, changeId: string): Promise<unknown> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Demand worker enqueue");
  return enqueueDemandWorker(memory, { changeId, waitingReason: "用户请求加入本地处理队列。" });
}

async function prepareLandingForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  const pkg = await prepareLandingPackage(project, { worktreeId: request.worktreeId, applyCheckId: request.applyCheckId });
  const reviewed = await reviewLandingPackage(project, pkg.id);
  const text = [
    "已完成提交/PR 前检查。",
    reviewed.review?.summary ?? reviewed.summary,
    "",
    reviewed.review?.riskSummary ?? reviewed.riskSummary,
  ].filter(Boolean).join("\n");
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "landing-readiness",
    text,
    artifact: reviewed.artifactRefs[1] ?? reviewed.artifactRefs[0],
    blocks: [
      {
        id: `${reviewed.id}:landing-prose`,
        runId: reviewed.id,
        sequence: 1,
        kind: "prose",
        timestamp: new Date().toISOString(),
        source: "aho",
        title: "提交/PR 前检查",
        text,
      },
      {
        id: `${reviewed.id}:landing-result`,
        runId: reviewed.id,
        sequence: 2,
        kind: "tool-result",
        timestamp: new Date().toISOString(),
        source: "aho",
        title: reviewed.review?.verdict === "ready" ? "落地检查通过" : "落地检查需要处理",
        text: reviewed.review?.suggestedNextAction ?? "请查看证据后决定下一步。",
        artifactRef: reviewed.review ? reviewed.artifactRefs.find((ref) => ref.endsWith("merge-review.md")) : reviewed.artifactRefs[0],
      },
    ],
  });
  live?.emit({ event: "assistant.message", data: entry });
  emitAssistantEvent(live, {
    runId: reviewed.id,
    kind: "tool-result",
    phase: "landing-readiness",
    title: "Landing readiness reviewed",
    summary: reviewed.review?.summary ?? reviewed.summary,
    artifactRef: reviewed.artifactRefs[0],
  });
  return { package: reviewed };
}

async function reviewLandingForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  if (!request.landingPackageId) throw new Error("landing.review requires landingPackageId.");
  const reviewed = await reviewLandingPackage(project, request.landingPackageId);
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "landing-review",
    text: reviewed.review?.summary ?? reviewed.summary,
    artifact: reviewed.artifactRefs.find((ref) => ref.endsWith("merge-review.md")) ?? reviewed.artifactRefs[0],
  });
  live?.emit({ event: "assistant.message", data: entry });
  return { package: reviewed };
}

async function preparePrDraftForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  if (!request.landingPackageId) throw new Error("pr-draft.prepare requires landingPackageId.");
  const pkg = await preparePrDraftPackage(project, request.landingPackageId);
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "pr-draft-prepared",
    text: `PR 草稿材料已准备好。这不会 push、创建 PR 或 merge。\n\n证据：${pkg.bodyArtifact}`,
    artifact: pkg.bodyArtifact,
  });
  live?.emit({ event: "assistant.message", data: entry });
  return { package: pkg };
}

async function createPrDraftForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  if (!request.landingPackageId) throw new Error("pr-draft.create requires landingPackageId.");
  const pkg = await createDraftPr(project, request.landingPackageId);
  const text = [
    "已创建或更新 Draft PR。",
    "",
    `PR: ${pkg.prUrl ?? "unknown"}`,
    `Branch: ${pkg.branchName}`,
    "",
    "这是远端协作草稿，不会自动 merge 或 land。",
  ].join("\n");
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "pr-draft-created",
    text,
    artifact: pkg.bodyArtifact,
  });
  live?.emit({ event: "assistant.message", data: entry });
  return { package: pkg };
}

async function refreshPrDraftForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  if (!request.landingPackageId) throw new Error("pr-draft.refresh requires landingPackageId.");
  const pkg = await refreshPrDraftStatus(project, request.landingPackageId);
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "pr-draft-refreshed",
    text: pkg.prUrl ? `Draft PR 状态已刷新：${pkg.prUrl}` : "Draft PR 状态已刷新；还没有可用 PR URL。",
    artifact: pkg.packageArtifact,
  });
  live?.emit({ event: "assistant.message", data: entry });
  return { package: pkg };
}

async function refreshPrFeedbackForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  if (!request.landingPackageId) throw new Error("pr-feedback.refresh requires landingPackageId.");
  const feedback = await refreshPrFeedback(project, request.landingPackageId);
  const text = [
    "已读取 Draft PR 远端反馈。",
    "",
    feedback.summary.summary,
    "",
    feedback.summary.actionable
      ? "主 agent 判断：这些反馈需要在同一需求中重新处理。"
      : "主 agent 判断：当前没有必须自动修改的远端反馈。",
  ].join("\n");
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "pr-feedback-refreshed",
    text,
    artifact: feedback.summary.evidenceRefs[0],
    blocks: [
      {
        id: `${feedback.snapshot.id}:pr-feedback-prose`,
        runId: feedback.snapshot.id,
        sequence: 1,
        kind: "prose",
        timestamp: new Date().toISOString(),
        source: "aho",
        title: "PR 反馈",
        text,
      },
      {
        id: `${feedback.snapshot.id}:pr-feedback-result`,
        runId: feedback.snapshot.id,
        sequence: 2,
        kind: "tool-result",
        timestamp: new Date().toISOString(),
        source: "aho",
        title: feedback.summary.actionable ? "需要修改" : "暂无必须修改项",
        text: feedback.summary.recommendedAction,
        artifactRef: feedback.summary.evidenceRefs[0],
      },
    ],
  });
  live?.emit({ event: "assistant.message", data: entry });
  return feedback;
}

async function reworkPrFeedbackForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  if (!request.landingPackageId) throw new Error("pr-feedback.rework requires landingPackageId.");
  const memory = await resolveProjectMemory(project);
  const started = await startPrFeedbackReworkAttempt(project, request.landingPackageId, request.prompt);
  const intro = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "pr-feedback-rework-started",
    text: [
      "已根据 PR 反馈创建同一需求的修改任务。",
      "",
      started.feedback.summary.summary,
      "",
      "接下来主 agent 会按证据继续委派 rework-coder、validator、auditor；通过后还需要重新做落地检查，再由你确认是否更新 Draft PR。",
    ].join("\n"),
    artifact: started.feedback.summary.evidenceRefs[0],
  });
  live?.emit({ event: "assistant.message", data: intro });
  const workflow = await runCodeValidateAuditSequence(project, changeId, started.prompt, live, undefined, undefined, "rework-coder");
  const artifactRefs = compactArtifactRefs(
    ...(isRecord(workflow) && isRecord(workflow.code) && isRecord(workflow.code.run) && isRecord(workflow.code.run.artifacts) && typeof workflow.code.run.artifacts.directory === "string"
      ? [workflow.code.run.artifacts.directory]
      : []),
  );
  const failed = isRecord(workflow) && typeof workflow.stoppedAt === "string" && workflow.stoppedAt;
  await completePrFeedbackReworkAttempt(memory, started.attempt, failed ? "failed" : "completed", artifactRefs);
  await completeAgentTask(memory, started.task, {
    status: failed ? "failed" : "completed",
    summary: failed ? "PR feedback rework needs more attention." : "PR feedback rework completed through main-agent role orchestration.",
    artifactRefs: [...started.feedback.summary.evidenceRefs, ...artifactRefs],
    nextRecommendation: failed ? "Return to the main conversation for next instructions." : "Prepare a new landing review before updating the Draft PR.",
    ...(failed ? { failureClassification: "pr-feedback-rework-failed", requiresUserInputReason: "Main-agent role orchestration did not complete after PR feedback rework." } : {}),
  });
  return { attempt: started.attempt, task: started.task, workflow };
}

async function updatePrDraftForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  if (!request.landingPackageId) throw new Error("pr-feedback.update-draft requires landingPackageId.");
  const result = await updatePrDraftFromFeedback(project, request.landingPackageId);
  const text = [
    "已更新同一个 Draft PR 分支。",
    "",
    `PR: ${result.package.prUrl ?? "unknown"}`,
    `Branch: ${result.package.branchName}`,
    "",
    "这只是更新 Draft PR，不会 merge、land、标记 ready for review 或归档需求。",
  ].join("\n");
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "pr-draft-updated",
    text,
    artifact: result.revision.artifactRefs[0],
  });
  live?.emit({ event: "assistant.message", data: entry });
  return result;
}

async function preparePrReviewForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  if (!request.landingPackageId) throw new Error("pr-review.prepare requires landingPackageId.");
  const readiness = await preparePrReviewReadiness(project, request.landingPackageId);
  const text = [
    readiness.summary,
    "",
    readiness.reason,
    "",
    readiness.canSubmit
      ? "右侧可以提交人工评审；这不会 merge、land 或启用自动合并。"
      : "当前不能提交人工评审，请先处理上面的原因。",
    readiness.prUrl ? `\nPR: ${readiness.prUrl}` : "",
  ].filter(Boolean).join("\n");
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "pr-review-readiness",
    text,
    artifact: readiness.summaryArtifact,
  });
  live?.emit({ event: "assistant.message", data: entry });
  return { readiness };
}

async function submitPrReviewForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  if (!request.landingPackageId) throw new Error("pr-review.submit requires landingPackageId.");
  const result = await submitPrForHumanReview(project, request.landingPackageId);
  const text = [
    "Draft PR 已提交人工评审。",
    "",
    result.handoff.prUrl ? `PR: ${result.handoff.prUrl}` : "PR: unknown",
    "",
    "当前需求进入等待远端评审状态。后续反馈仍通过“检查 PR 反馈”回到同一需求对话处理。",
    "这不会 merge、land、push main、启用自动合并或归档需求。",
  ].join("\n");
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "pr-review-submitted",
    text,
    artifact: result.handoff.artifactRefs[0],
  });
  live?.emit({ event: "assistant.message", data: entry });
  return result;
}

async function refreshPrReviewForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  if (!request.landingPackageId) throw new Error("pr-review.refresh requires landingPackageId.");
  const readiness = await refreshPrReviewState(project, request.landingPackageId);
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "pr-review-refreshed",
    text: `${readiness.summary}\n\n${readiness.reason}`,
    artifact: readiness.summaryArtifact,
  });
  live?.emit({ event: "assistant.message", data: entry });
  return { readiness };
}

async function preparePrReviewReplyForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  if (!request.landingPackageId) throw new Error("pr-review.reply-prepare requires landingPackageId.");
  const draft = await preparePrReviewReplyDraft(project, request.landingPackageId, { changeId, message: request.prompt });
  const text = [
    "已准备评审回复草稿。",
    "",
    draft.body,
    "",
    draft.canResolveThread
      ? "右侧可以确认回复评审；如果 provider 支持，也可以标记对应 thread 已处理。"
      : "右侧可以确认回复评审；当前 provider 没有可用的 thread resolve 能力。",
  ].join("\n");
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "pr-review-reply-draft",
    text,
    artifact: draft.artifactRef,
  });
  live?.emit({ event: "assistant.message", data: entry });
  return { draft };
}

async function submitPrReviewReplyForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  if (!request.landingPackageId) throw new Error("pr-review.reply-submit requires landingPackageId.");
  const result = await submitPrReviewReply(project, request.landingPackageId);
  const text = [
    "已回复 PR 评审反馈。",
    "",
    "这只是提交回复，不会 merge、land、push main、归档需求或标记自动合并。",
  ].join("\n");
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "pr-review-reply-submitted",
    text,
    artifact: result.handoff.artifactRefs[0],
  });
  live?.emit({ event: "assistant.message", data: entry });
  return result;
}

async function resolvePrReviewThreadForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  if (!request.landingPackageId) throw new Error("pr-review.thread-resolve requires landingPackageId.");
  const result = await resolvePrReviewThread(project, request.landingPackageId);
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "pr-review-thread-resolved",
    text: "已标记评审 thread 为已处理。此操作不会 merge、land、push main 或归档需求。",
    artifact: result.resolution.artifactRefs[0],
  });
  live?.emit({ event: "assistant.message", data: entry });
  return result;
}

async function prepareLandingQueueForAction(
  project: ManagedProject,
  changeId: string,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  const snapshot = await prepareLandingQueue(project);
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "landing-queue-prepared",
    text: `${snapshot.summary}\n\n右侧会只显示当前需要确认的 PR 合并动作；不会自动合并全部。`,
    artifact: snapshot.summaryArtifact,
  });
  live?.emit({ event: "assistant.message", data: entry });
  return { snapshot };
}

async function refreshLandingQueueForAction(
  project: ManagedProject,
  changeId: string,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  const snapshot = await refreshLandingQueue(project);
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "landing-queue-refreshed",
    text: `${snapshot.summary}\n\n我已经重新检查队列。每次合并前仍会再次刷新选中的 PR。`,
    artifact: snapshot.summaryArtifact,
  });
  live?.emit({ event: "assistant.message", data: entry });
  return { snapshot };
}

async function mergeNextLandingQueueForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  const result = await mergeNextLandingQueueCandidate(project, request.landingPackageId);
  const text = [
    result.result.summary,
    "",
    result.after
      ? `剩余队列已刷新：${result.after.readyCount} 个可合并，${result.after.needsAttentionCount} 个需要先处理。`
      : "当前没有执行远端合并。",
    "",
    "每个 PR 仍需要单独确认；AHO 不会自动合并剩余 PR。",
  ].join("\n");
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: result.result.status === "merged" ? "landing-queue-merged-one" : "landing-queue-not-merged",
    text,
    artifact: result.result.artifactRefs[0],
  });
  live?.emit({ event: "assistant.message", data: entry });
  return result;
}

async function prepareRemoteLandingForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  if (!request.landingPackageId) throw new Error("remote-landing.prepare requires landingPackageId.");
  const readiness = await prepareRemoteLandingReadiness(project, request.landingPackageId);
  const text = [
    readiness.summary,
    "",
    readiness.reason,
    "",
    readiness.canMerge
      ? "右侧可以确认合并 PR。确认后会执行远端 squash merge，但不会同步本地源码。"
      : "当前不能合并 PR；请先处理上面的原因。",
    readiness.prUrl ? `\nPR: ${readiness.prUrl}` : "",
  ].filter(Boolean).join("\n");
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "remote-landing-readiness",
    text,
    artifact: readiness.summaryArtifact,
  });
  live?.emit({ event: "assistant.message", data: entry });
  return { readiness };
}

async function mergeRemoteLandingForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  if (!request.landingPackageId) throw new Error("remote-landing.merge requires landingPackageId.");
  const result = await mergeRemoteLanding(project, request.landingPackageId);
  const text = result.result.status === "merged"
    ? [
      "PR 已在远端合并。",
      "",
      result.result.prUrl ? `PR: ${result.result.prUrl}` : "PR: unknown",
      result.result.mergeCommit ? `Merge commit: ${result.result.mergeCommit}` : "",
      "",
      "远端代码现在是稳定边界；本地项目不会自动同步。后台已记录本次合并的需求记忆 closeout 和维护账本。",
    ].filter(Boolean).join("\n")
    : [
      "PR 远端合并失败。",
      "",
      result.result.failureReason ?? "未提供失败原因。",
      "",
      "AHO 只记录失败证据，不会自动修复、合并或改写稳定记忆。",
    ].join("\n");
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: result.result.status === "merged" ? "remote-landing-merged" : "remote-landing-failed",
    text,
    artifact: result.result.artifactRefs[0],
  });
  live?.emit({ event: "assistant.message", data: entry });
  return result;
}

async function refreshRemoteLandingForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  if (!request.landingPackageId) throw new Error("remote-landing.refresh requires landingPackageId.");
  const readiness = await refreshRemoteLanding(project, request.landingPackageId);
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "remote-landing-refreshed",
    text: `${readiness.summary}\n\n${readiness.reason}`,
    artifact: readiness.summaryArtifact,
  });
  live?.emit({ event: "assistant.message", data: entry });
  return { readiness };
}

async function preparePostMergeForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  if (!request.landingPackageId) throw new Error("post-merge.prepare requires landingPackageId.");
  if (!request.remoteLandingResultId) throw new Error("post-merge.prepare requires remoteLandingResultId.");
  const handoff = await preparePostMergeHandoff(project, request.landingPackageId, request.remoteLandingResultId);
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "post-merge-prepared",
    text: [
      handoff.summary,
      "",
      handoff.localStatusSummary,
      "",
      handoff.cleanupSummary,
      "",
      "本地同步和远端分支清理是合并后的可选维护动作，不影响这个需求已合并的状态。",
    ].join("\n"),
    artifact: handoff.summaryArtifact,
  });
  live?.emit({ event: "assistant.message", data: entry });
  return { handoff };
}

async function prepareLocalSyncForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  if (!request.landingPackageId) throw new Error("post-merge.sync-local.prepare requires landingPackageId.");
  if (!request.remoteLandingResultId) throw new Error("post-merge.sync-local.prepare requires remoteLandingResultId.");
  const readiness = await prepareLocalSync(project, request.landingPackageId, request.remoteLandingResultId);
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "post-merge-local-sync-readiness",
    text: `${readiness.summary}\n\n${readiness.reason}`,
    artifact: readiness.readinessArtifact,
  });
  live?.emit({ event: "assistant.message", data: entry });
  return { readiness };
}

async function syncLocalForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  if (!request.landingPackageId) throw new Error("post-merge.sync-local.run requires landingPackageId.");
  if (!request.remoteLandingResultId) throw new Error("post-merge.sync-local.run requires remoteLandingResultId.");
  const result = await syncLocalAfterMerge(project, request.landingPackageId, request.remoteLandingResultId);
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: result.result.status === "synced" ? "post-merge-local-synced" : "post-merge-local-sync-skipped",
    text: result.result.status === "synced"
      ? "本地项目已通过 fast-forward 同步到远端合并后的 base branch。AHO 没有 checkout、stash、reset、rebase 或创建 merge commit。"
      : `${result.readiness.summary}\n\n${result.result.failureReason ?? result.readiness.reason}`,
    artifact: result.result.artifactRefs[0],
  });
  live?.emit({ event: "assistant.message", data: entry });
  return result;
}

async function prepareRemoteBranchCleanupForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  if (!request.landingPackageId) throw new Error("post-merge.cleanup-branch.prepare requires landingPackageId.");
  if (!request.remoteLandingResultId) throw new Error("post-merge.cleanup-branch.prepare requires remoteLandingResultId.");
  const readiness = await prepareRemoteBranchCleanup(project, request.landingPackageId, request.remoteLandingResultId);
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "post-merge-branch-cleanup-readiness",
    text: `${readiness.summary}\n\n${readiness.reason}`,
    artifact: readiness.readinessArtifact,
  });
  live?.emit({ event: "assistant.message", data: entry });
  return { readiness };
}

async function cleanupRemoteBranchForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  if (!request.landingPackageId) throw new Error("post-merge.cleanup-branch.run requires landingPackageId.");
  if (!request.remoteLandingResultId) throw new Error("post-merge.cleanup-branch.run requires remoteLandingResultId.");
  const result = await cleanupRemoteBranchAfterMerge(project, request.landingPackageId, request.remoteLandingResultId);
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: result.result.status === "deleted" ? "post-merge-branch-cleaned" : "post-merge-branch-cleanup-skipped",
    text: result.result.status === "deleted"
      ? "远端 PR 分支已清理。本地分支没有被删除。"
      : `${result.readiness.summary}\n\n${result.result.failureReason ?? result.readiness.reason}`,
    artifact: result.result.artifactRefs[0],
  });
  live?.emit({ event: "assistant.message", data: entry });
  return result;
}

async function startNextDemandWorkerForAction(
  project: ManagedProject,
  changeId: string,
  prompt: string | undefined,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  return startDemandWorkerForChange(project, changeId, prompt, live);
}

async function pumpDemandWorkersForAction(
  project: ManagedProject,
  prompt: string | undefined,
  live: WorkbenchLiveSink | undefined,
  liveChangeId?: string,
): Promise<unknown> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Demand worker pump");
  const claimed = await claimAvailableDemandWorkers(memory);
  if (claimed.length === 0) {
    if (liveChangeId) {
      const worker = await getDemandWorkerForChange(memory, liveChangeId);
      if (worker && worker.status === "queued") {
        await recordMainOrchestratorDecision(memory, {
          changeId: liveChangeId,
          workerId: worker.id,
          action: "enqueue",
          summary: "Demand is waiting for a local worker slot.",
          reason: "No demand worker slot is currently available.",
          artifactRefs: [],
        });
        return { status: "queued", claimed: 0, worker, results: [] };
      }
    }
    return { status: "idle", claimed: 0, results: [] };
  }
  const liveClaim = liveChangeId ? claimed.find((claim) => claim.worker.changeId === liveChangeId) : undefined;
  const backgroundClaims = claimed.filter((claim) => claim !== liveClaim);
  for (const claim of backgroundClaims) {
    scheduleClaimedDemandWorker(project, memory, claim);
  }
  if (!liveClaim) {
    if (liveChangeId) {
      const worker = await getDemandWorkerForChange(memory, liveChangeId);
      if (worker && worker.status === "queued") {
        await recordMainOrchestratorDecision(memory, {
          changeId: liveChangeId,
          workerId: worker.id,
          action: "enqueue",
          summary: "Demand is waiting for a local worker slot.",
          reason: "Available demand worker slots were assigned to earlier queued demands.",
          artifactRefs: [],
        });
        return { status: "queued", claimed: claimed.length, backgroundStarted: backgroundClaims.length, worker, results: [] };
      }
    }
    return { status: "pumped", claimed: claimed.length, backgroundStarted: backgroundClaims.length, results: [] };
  }
  try {
    const result = await runClaimedDemandWorker(project, memory, liveClaim, prompt, live);
    return { status: "pumped", claimed: claimed.length, backgroundStarted: backgroundClaims.length, results: [result] };
  } catch (error) {
    return {
      status: "pumped",
      claimed: claimed.length,
      backgroundStarted: backgroundClaims.length,
      results: [{
        status: "failed",
        worker: liveClaim.worker,
        attempt: liveClaim.attempt,
        error: error instanceof Error ? error.message : String(error),
      }],
    };
  }
}

async function evaluateDemandOrchestrator(project: ManagedProject, changeId: string): Promise<unknown> {
  const memory = await resolveProjectMemory(project);
  const worker = await getDemandWorkerForChange(memory, changeId);
  const decisions = (await reconcileDemandWorkers(memory)).decisions.filter((decision) => decision.changeId === changeId);
  return { worker, decisions };
}

async function releaseDemandWorkerForAction(project: ManagedProject, changeId: string, reason: string | undefined): Promise<unknown> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Demand worker release");
  return releaseDemandWorker(memory, changeId, reason?.trim() || "Demand worker released by user action.");
}

async function startDemandWorkerForChange(
  project: ManagedProject,
  changeId: string,
  prompt: string | undefined,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Demand worker start");
  const claimed = await claimNextDemandWorker(memory, { changeId });
  if (!claimed) {
    const worker = await getDemandWorkerForChange(memory, changeId);
    await recordMainOrchestratorDecision(memory, {
      changeId,
      workerId: worker?.id,
      action: "enqueue",
      summary: "Demand is waiting for a local worker slot.",
      reason: "No demand worker slot is currently available.",
      artifactRefs: [],
    });
    return { status: "queued", worker };
  }
  return runClaimedDemandWorker(project, memory, claimed, prompt, live);
}

async function runClaimedDemandWorker(
  project: ManagedProject,
  memory: ResolvedMemory,
  claimed: NonNullable<Awaited<ReturnType<typeof claimNextDemandWorker>>>,
  prompt: string | undefined,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  const changeId = claimed.worker.changeId;
  const running = await markDemandWorkerRunning(memory, claimed.worker, claimed.attempt);
  emitAssistantEvent(live, {
    runId: running.worker.id,
    kind: "status",
    phase: "demand-worker-running",
    title: "Demand worker started",
    summary: "本地主 orchestrator 已领取该需求，开始 main-agent tool orchestration。",
  });
  try {
    if (!await hasConfirmedPlanningArtifacts(project, changeId)) {
      const completed = await completeDemandWorkerAttempt(memory, running.worker, running.attempt, {
        status: "needs-user-input",
        resultStatus: "needs-user-input",
        summary: "Demand execution needs confirmed planning artifacts before role agents can run.",
        failureReason: "The demand worker was queued without confirmed spec, plan, tasks, and AC map artifacts.",
      });
      scheduleDemandWorkerPump(project);
      return { status: completed.worker.status, worker: completed.worker, attempt: completed.attempt, decision: completed.decision };
    }
    const beforeTasks = await listAgentTasks(memory, changeId).catch(() => []);
    const result = await runMainAgentToolOrchestration(project, changeId, prompt, live, false);
    const afterTasks = await listAgentTasks(memory, changeId).catch(() => []);
    const beforeTaskIds = new Set(beforeTasks.map((task) => task.id));
    const newAgentTaskIds = afterTasks.filter((task) => !beforeTaskIds.has(task.id)).map((task) => task.id);
    const status = workerStatusFromPipelineResult(result);
    const completed = await completeDemandWorkerAttempt(memory, running.worker, running.attempt, {
      status,
      resultStatus: isRecord(result) && typeof result.status === "string" ? result.status : status,
      summary: summarizePipelineResult(result),
      failureReason: status === "needs-user-input" || status === "failed" ? summarizePipelineResult(result) : undefined,
      agentTaskIds: newAgentTaskIds,
    });
    scheduleDemandWorkerPump(project);
    return { status: completed.worker.status, worker: completed.worker, attempt: completed.attempt, rolePipeline: result, decision: completed.decision };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const completed = await completeDemandWorkerAttempt(memory, running.worker, running.attempt, {
      status: "failed",
      resultStatus: "failed",
      summary: `Main-agent tool orchestration failed: ${message}`,
      failureReason: message,
    });
    scheduleDemandWorkerPump(project);
    throw Object.assign(error instanceof Error ? error : new Error(message), { demandWorker: completed.worker.id });
  }
}

async function hasConfirmedPlanningArtifacts(project: ManagedProject, changeId: string): Promise<boolean> {
  try {
    const { memory, changePath } = await resolveTopic(project, changeId);
    const changeDir = join(memory.memoryRoot, changePath);
    if (!existsSync(join(changeDir, "ac-map.json"))) return false;
    for (const file of ["spec.md", "plan.md", "tasks.md"]) {
      const path = join(changeDir, file);
      if (!existsSync(path)) return false;
      const content = await readFile(path, "utf8");
      if (hasUnresolvedPlanningPlaceholder(content)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function hasUnresolvedPlanningPlaceholder(content: string): boolean {
  return /(^|\n)\s*(?:-\s*)?(?:\[[ xX]\]\s*)?TBD\s*(?=\n|$)/.test(content);
}

function scheduleClaimedDemandWorker(
  project: ManagedProject,
  memory: ResolvedMemory,
  claimed: NonNullable<Awaited<ReturnType<typeof claimNextDemandWorker>>>,
): void {
  setTimeout(() => {
    void runClaimedDemandWorker(project, memory, claimed, undefined, undefined).catch(() => undefined);
  }, 0);
}

function scheduleDemandWorkerPump(project: ManagedProject): void {
  setTimeout(() => {
    void pumpDemandWorkersForAction(project, undefined, undefined).catch(() => undefined);
  }, 0);
}

function workerStatusFromPipelineResult(result: unknown): "result-ready" | "needs-user-input" | "failed" {
  if (!isRecord(result)) return "result-ready";
  if (result.status === "failed") return "failed";
  if (result.status === "needs-user-input" || result.requiresUserInput) return "needs-user-input";
  return "result-ready";
}

function summarizePipelineResult(result: unknown): string {
  if (!isRecord(result)) return "Main-agent tool orchestration completed and produced result review evidence.";
  if (typeof result.status === "string") {
    if (result.status === "completed") return "Main-agent tool orchestration completed and produced result review evidence.";
    if (result.status === "needs-user-input") return `Main-agent tool orchestration needs user input${typeof result.stoppedAt === "string" ? ` after ${result.stoppedAt}` : ""}.`;
    if (result.status === "failed") return "Main-agent tool orchestration failed before result review.";
  }
  return "Main-agent tool orchestration finished with recorded evidence.";
}

async function runMainAgentToolOrchestration(
  project: ManagedProject,
  changeId: string,
  prompt: string | undefined,
  live: WorkbenchLiveSink | undefined,
  continuation: boolean,
  taskIds?: string[],
  readinessManifestId?: string,
): Promise<unknown> {
  emitAssistantEvent(live, {
    runId: changeId,
    kind: "status",
    phase: "main-agent-tool-orchestration",
    title: continuation ? "Main-agent orchestration continued" : "Main-agent orchestration started",
    summary: "主 agent 将按当前证据逐步委派角色任务；每一步都经过 ToolPolicyGate、RoleDispatcher 和 AgentTaskResult。",
  });
  let orchestration = createMainAgentOrchestrationState({ changeId });
  const firstDecision = decideNextMainAgentOrchestration(orchestration);
  assertDelegateDecision(firstDecision, "coder-agent");
  const first = await runCodeValidateAuditSequence(project, changeId, prompt, live, taskIds, undefined, firstDecision.roleId, orchestration, firstDecision, readinessManifestId ? { mode: "single-change-readiness", readinessManifestId } : undefined);
  orchestration = readWorkflowOrchestration(first, orchestration);
  const next = decideNextMainAgentOrchestration(orchestration);
  if (next.kind === "completed") {
    return { status: "completed", attempts: [{ kind: "initial", result: first }], reworkUsed: 0, orchestration };
  }
  if (next.kind === "failed") {
    return { status: "failed", attempts: [{ kind: "initial", result: first }], reworkUsed: 0, requiresUserInput: true, stoppedAt: next.stoppedAt, orchestration };
  }
  if (next.kind === "needs-user-input") {
    return { status: "needs-user-input", attempts: [{ kind: "initial", result: first }], reworkUsed: 0, requiresUserInput: true, stoppedAt: next.stoppedAt, orchestration };
  }
  assertDelegateDecision(next, "rework-coder");
  emitAssistantEvent(live, {
    runId: changeId,
    kind: "status",
    phase: "automatic-rework",
    title: "Automatic rework started",
    summary: `${next.reason} AHO is sending the evidence back to rework-coder once.`,
    isError: true,
  });
  const reworkPrompt = [
    "Use the failed official validation/audit evidence from the previous attempt.",
    "Repair only the accepted demand in the assigned worktree.",
    "Do not change canonical planning artifacts.",
    prompt ?? "",
  ].join("\n\n");
  const second = await runCodeValidateAuditSequence(project, changeId, reworkPrompt, live, undefined, undefined, next.roleId, orchestration, next);
  orchestration = readWorkflowOrchestration(second, orchestration);
  const finalDecision = decideNextMainAgentOrchestration(orchestration);
  return {
    status: finalDecision.kind === "completed" ? "completed" : finalDecision.kind,
    attempts: [
      { kind: "initial", result: first },
      { kind: "automatic-rework", result: second },
    ],
    reworkUsed: 1,
    requiresUserInput: finalDecision.kind !== "completed",
    stoppedAt: finalDecision.kind === "needs-user-input" || finalDecision.kind === "failed" ? finalDecision.stoppedAt : undefined,
    orchestration,
  };
}

function assertDelegateDecision(decision: MainAgentOrchestrationDecision, roleId: MainAgentOrchestrationRole): asserts decision is Extract<MainAgentOrchestrationDecision, { kind: "delegate-role" }> {
  if (decision.kind !== "delegate-role" || decision.roleId !== roleId) {
    throw new Error(`Main-agent decision engine expected ${roleId}, got ${decision.kind}${decision.kind === "delegate-role" ? `:${decision.roleId}` : ""}.`);
  }
}

function readWorkflowOrchestration(result: unknown, fallback: MainAgentOrchestrationState): MainAgentOrchestrationState {
  if (isRecord(result) && isRecord(result.orchestration)) {
    const state = result.orchestration;
    if (typeof state.changeId === "string" && Array.isArray(state.steps) && typeof state.maxReworkAttempts === "number") {
      return state as unknown as MainAgentOrchestrationState;
    }
  }
  return fallback;
}

async function stopRunningPipeline(
  project: ManagedProject,
  changeId: string,
  prompt: string | undefined,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  const runningRun = await findRunningRunForChange(project, changeId);
  if (!runningRun) {
    const message = prompt?.trim()
      ? "当前执行已经结束，这条输入会作为完成后的修改反馈处理。"
      : "当前没有正在执行的本地 run。";
    const assistant = await appendTopicThreadEntry(project, changeId, { type: "assistant.message", status: "stop-not-needed", text: message });
    live?.emit({ event: "assistant.message", data: assistant });
    return { status: "already-completed", message };
  }
  requestRunStop(runningRun.id, prompt?.trim() || "User requested stop from the main conversation.");
  const user = prompt?.trim()
    ? await appendTopicThreadEntry(project, changeId, { type: "user.message", text: prompt.trim(), status: "stop-and-continue", runId: runningRun.id })
    : null;
  if (user) live?.emit({ event: "topic.message", data: user });
  const assistant = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "stop-requested",
    runId: runningRun.id,
    text: "已请求停止当前本地执行。停止证据会保留，随后会基于你的新指令进入下一轮方案或修改。",
  });
  live?.emit({ event: "assistant.message", data: assistant });
  emitAssistantEvent(live, {
    runId: runningRun.id,
    kind: "status",
    phase: "stopping",
    title: "Stop requested",
    summary: "AHO requested local runner termination; this is not Codex app-server resume.",
  });
  return { status: "stop-requested", runId: runningRun.id };
}

async function steerConversation(
  project: ManagedProject,
  changeId: string,
  prompt: string | undefined,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  const message = prompt?.trim();
  if (!message) throw new Error("conversation.steer requires prompt.");
  const activeTurn = getActiveCodexAppServerTurn(changeId);
  if (!activeTurn) {
    const runningRun = await findRunningRunForChange(project, changeId);
    const user = await appendTopicThreadEntry(project, changeId, { type: "user.message", text: message, status: "pending-feedback", runId: runningRun?.id });
    live?.emit({ event: "topic.message", data: user });
    const assistant = await appendTopicThreadEntry(project, changeId, {
      type: "assistant.message",
      status: "pending-feedback",
      runId: runningRun?.id,
      text: "当前运行时不支持实时引导，已记录，将在下一轮生效。",
    });
    live?.emit({ event: "assistant.message", data: assistant });
    return { status: "pending-feedback", realtime: false };
  }
  const user = await appendTopicThreadEntry(project, changeId, { type: "user.message", text: message, status: "steering-sent", runId: activeTurn.runId });
  live?.emit({ event: "topic.message", data: user });
  await activeTurn.steer(message);
  const assistant = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "steering-sent",
    runId: activeTurn.runId,
    text: "已发送给当前执行。",
  });
  live?.emit({ event: "assistant.message", data: assistant });
  emitAssistantEvent(live, {
    runId: activeTurn.runId,
    kind: "status",
    phase: "steered",
    title: "已发送给当前执行",
    summary: "这条输入已通过 Codex app-server 发送给当前运行中的 turn。",
  });
  return { status: "steered", realtime: true, runId: activeTurn.runId, roleId: activeTurn.roleId };
}

async function interruptConversation(
  project: ManagedProject,
  changeId: string,
  prompt: string | undefined,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  const activeTurn = getActiveCodexAppServerTurn(changeId);
  if (!activeTurn) {
    return stopRunningPipeline(project, changeId, prompt, live);
  }
  const message = prompt?.trim();
  if (message) {
    const user = await appendTopicThreadEntry(project, changeId, { type: "user.message", text: message, status: "interrupt-requested", runId: activeTurn.runId });
    live?.emit({ event: "topic.message", data: user });
  }
  await activeTurn.interrupt(message || "User requested interrupt from the main conversation.");
  const assistant = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "interrupt-requested",
    runId: activeTurn.runId,
    text: "已请求停止当前执行。停止证据会保留，你可以继续用自然语言说明下一步。",
  });
  live?.emit({ event: "assistant.message", data: assistant });
  emitAssistantEvent(live, {
    runId: activeTurn.runId,
    kind: "status",
    phase: "interrupt-requested",
    title: "已请求停止当前执行",
    summary: "AHO sent turn/interrupt to the active Codex app-server turn.",
    isError: true,
  });
  return { status: "interrupt-requested", realtime: true, runId: activeTurn.runId, roleId: activeTurn.roleId };
}

async function runOrchestratorPlan(project: ManagedProject, changeId: string, userMessage: string, live?: WorkbenchLiveSink): Promise<{
  run: RunMetadata;
  routingDecision: TopicRoutingDecision;
  assistantMessage: string;
  planCard: OrchestrationPlanCard;
  suggestedActions: SuggestedAction[];
}> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Orchestrator plan");
  const { changePath } = await resolveTopic(project, changeId);
  const role = await resolveAgentRole(memory, "orchestrator");
  const runId = buildRunId(changeId, ["orchestrator", userMessage]);
  const directory = join(memory.runsRoot, runId);
  const relativeDir = displayArtifactPath(memory, directory);
  const paths = {
    run: join(directory, "run.json"),
    context: join(directory, "context.md"),
    prompt: join(directory, "prompt.md"),
    events: join(directory, "events.jsonl"),
    stdout: join(directory, "stdout.log"),
    stderr: join(directory, "stderr.log"),
    codexEvents: join(directory, "codex-events.jsonl"),
    lastMessage: join(directory, "last-message.md"),
    orchestrationPlan: join(directory, "orchestration-plan.json"),
    orchestrationPlanMarkdown: join(directory, "orchestration-plan.md"),
  };
  await mkdir(directory, { recursive: true });
  const now = new Date().toISOString();
  let run: RunMetadata = {
    version: "1.0",
    id: runId,
    changeId,
    projectPath: project.path,
    runtime: "orchestrator",
    executionMode: "direct",
    proposalOnly: true,
    command: ["codex", "exec"],
    status: "created",
    exitCode: null,
    signal: null,
    startedAt: now,
    finishedAt: null,
    artifacts: {
      base: memory.artifactBase,
      directory: relativeDir,
      context: `${relativeDir}/context.md`,
      prompt: `${relativeDir}/prompt.md`,
      events: `${relativeDir}/events.jsonl`,
      stdout: `${relativeDir}/stdout.log`,
      stderr: `${relativeDir}/stderr.log`,
      codexEvents: `${relativeDir}/codex-events.jsonl`,
      lastMessage: `${relativeDir}/last-message.md`,
      orchestrationPlan: `${relativeDir}/orchestration-plan.json`,
      orchestrationPlanMarkdown: `${relativeDir}/orchestration-plan.md`,
    },
    promptStack: ["agent-role", "active-change", "topic-thread", "workflow-status", "user-message"],
    agent: buildRunAgentRecord(role),
  };
  await writeJsonFile(paths.run, run);
  live?.emit({ event: "run.started", data: { runId, changeId, runtime: "orchestrator", actionType: "orchestrator.plan" } });
  await appendRunEvent(paths.events, { timestamp: now, type: "run.created", runId, data: { changeId, runtime: "orchestrator" } });
  await appendRunEvent(paths.events, { timestamp: now, type: "orchestrator.plan.started", runId, data: { changeId } });

  const context = await buildOrchestratorContext(project, memory, changePath, changeId, userMessage);
  await writeFile(paths.context, context, "utf8");
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "context.prepared", runId, data: { path: run.artifacts.context } });
  const prompt = `${buildAgentSystemPrompt(role)}\n\n${context}\n\n## User Message\n\n${userMessage}\n`;
  await writeFile(paths.prompt, prompt, "utf8");

  const capabilities = await detectCodexCapabilities();
  const heuristicDecision = classifyTopicRouting(userMessage, await readThreadLog(memory, changePath));
  if (capabilities.errors.length > 0) {
    const fallback = fallbackOrchestration(userMessage, heuristicDecision, capabilities.errors);
    await writeFile(paths.stdout, "", "utf8");
    await writeFile(paths.stderr, `${capabilities.errors.join("\n")}\n`, "utf8");
    await writeFile(paths.lastMessage, JSON.stringify(fallback, null, 2), "utf8");
    await writeJsonFile(paths.orchestrationPlan, fallback);
    await writeFile(paths.orchestrationPlanMarkdown, renderPlanCardMarkdown(fallback), "utf8");
    run = await finishOrchestratorRun(paths.run, run, "completed", 0, null);
    await appendRunEvent(paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: "orchestrator.plan.completed", runId, data: { routingDecision: fallback.routingDecision } });
    await appendRunEvent(paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: "run.completed", runId });
    return { ...fallback, run };
  }

  const argv = buildCodexReadonlyArgv(capabilities, {
    projectPath: project.path,
    lastMessagePath: paths.lastMessage,
    additionalReadDirs: memory.mode === "external-local" ? [memory.memoryRoot] : [],
  });
  run = { ...run, command: [argv.command, ...argv.args], status: "running" };
  await writeJsonFile(paths.run, run);
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "codex.started", runId, data: { phase: "orchestrator", command: run.command } });
  const parser = createLiveCodexParser(runId, live);
  const processResult = await executeProcessStreaming({
    cwd: project.path,
    command: argv.command,
    args: argv.args,
    stdin: prompt,
    stdoutPath: paths.stdout,
    stderrPath: paths.stderr,
    mirrorStdoutPath: paths.codexEvents,
    onStdoutChunk: (text) => parser.feed(text),
    onCallbackError: (_stream, error) => emitLive(live, { event: "error", data: { message: error instanceof Error ? error.message : String(error), runId } }),
    stopSignal: () => isRunStopRequested(runId),
  });
  parser.flush();
  const lastMessage = existsSync(paths.lastMessage)
    ? await readFile(paths.lastMessage, "utf8")
    : extractFinalMessageFromCodexJsonl(processResult.stdoutSample) ?? "";
  if (!existsSync(paths.lastMessage)) await writeFile(paths.lastMessage, lastMessage || "# Orchestrator Plan Not Captured\n", "utf8");
  const parsed = parseOrchestrationOutput(lastMessage, userMessage, heuristicDecision);
  await writeJsonFile(paths.orchestrationPlan, parsed);
  await writeFile(paths.orchestrationPlanMarkdown, renderPlanCardMarkdown(parsed), "utf8");
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "codex.exited", runId, data: { phase: "orchestrator", exitCode: processResult.exitCode, signal: processResult.signal } });
  const status: RunStatus = processResult.exitCode === 0 ? "completed" : "failed";
  run = await finishOrchestratorRun(paths.run, run, status, processResult.exitCode, processResult.signal);
  await appendRunEvent(paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: status === "completed" ? "orchestrator.plan.completed" : "orchestrator.plan.failed", runId, data: { routingDecision: parsed.routingDecision } });
  await appendRunEvent(paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: status === "completed" ? "run.completed" : "run.failed", runId });
  return { ...parsed, run };
}

async function postTopicPlanMessage(project: ManagedProject, changeId: string, message: string, live?: WorkbenchLiveSink): Promise<TopicMessageResult> {
  const user = await appendTopicThreadEntry(project, changeId, { type: "user.message", text: message });
  live?.emit({ event: "topic.message", data: user });
  const capture = createAssistantTranscriptCapture(live);
  const orchestration = await runOrchestratorPlan(project, changeId, message, capture.sink);
  const assistantText = orchestration.assistantMessage.trim() || capture.text.trim();
  if (orchestration.routingDecision !== "same-topic") {
    const assistant = await appendTopicThreadEntry(project, changeId, {
      type: "assistant.message",
      text: assistantText,
      runId: orchestration.run.id,
      artifact: orchestration.run.artifacts.orchestrationPlanMarkdown,
      activity: capture.activity,
      blocks: capture.blocks,
    });
    live?.emit({ event: "assistant.message", data: assistant });
    return {
      user,
      assistant,
      run: orchestration.run,
      codexSessionId: null,
      mode: "plan",
      routingDecision: orchestration.routingDecision,
      assistantMessage: assistantText,
      planCard: orchestration.planCard,
      suggestedActions: orchestration.suggestedActions,
    };
  }
  const assistant = await appendTopicThreadEntry(project, changeId, {
    type: "orchestrator.plan",
    text: assistantText,
    runId: orchestration.run.id,
    artifact: orchestration.run.artifacts.orchestrationPlanMarkdown,
    planCard: orchestration.planCard,
    activity: capture.activity,
    blocks: capture.blocks,
  });
  live?.emit({ event: "assistant.message", data: assistant });
  return {
    user,
    assistant,
    run: orchestration.run,
    codexSessionId: null,
    mode: "plan",
    routingDecision: orchestration.routingDecision,
    assistantMessage: assistantText,
    planCard: orchestration.planCard,
    suggestedActions: orchestration.suggestedActions,
  };
}

async function runCodexChat(project: ManagedProject, changeId: string, userMessage: string, live?: WorkbenchLiveSink): Promise<{ run: RunMetadata; message: string; codexSessionId: string | null }> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Topic chat");
  const { changePath } = await resolveTopic(project, changeId);
  const runtime = await readTopicRuntime(memory, changePath, changeId);
  const skillContext = await getEnabledSkillContext(project, changeId);
  const runId = buildRunId(changeId, ["codex", "chat"]);
  const directory = join(memory.runsRoot, runId);
  const relativeDir = displayArtifactPath(memory, directory);
  const paths = {
    run: join(directory, "run.json"),
    context: join(directory, "context.md"),
    prompt: join(directory, "prompt.md"),
    events: join(directory, "events.jsonl"),
    stdout: join(directory, "stdout.log"),
    stderr: join(directory, "stderr.log"),
    codexEvents: join(directory, "codex-events.jsonl"),
    appServerEvents: join(directory, "app-server-events.jsonl"),
    appServerStderr: join(directory, "app-server-stderr.log"),
    appServerLastMessage: join(directory, "app-server-last-message.md"),
    agentSession: join(directory, "agent-session.json"),
    lastMessage: join(directory, "last-message.md"),
  };
  await mkdir(directory, { recursive: true });
  const now = new Date().toISOString();
  let run: RunMetadata = {
    version: "1.0",
    id: runId,
    changeId,
    projectPath: project.path,
    runtime: "codex-readonly",
    executionMode: "direct",
    proposalOnly: true,
    command: ["codex", "exec"],
    status: "created",
    exitCode: null,
    signal: null,
    startedAt: now,
    finishedAt: null,
    artifacts: {
      base: memory.artifactBase,
      directory: relativeDir,
      context: `${relativeDir}/context.md`,
      prompt: `${relativeDir}/prompt.md`,
      events: `${relativeDir}/events.jsonl`,
      stdout: `${relativeDir}/stdout.log`,
      stderr: `${relativeDir}/stderr.log`,
      codexEvents: `${relativeDir}/codex-events.jsonl`,
      appServerEvents: `${relativeDir}/app-server-events.jsonl`,
      appServerStderr: `${relativeDir}/app-server-stderr.log`,
      appServerLastMessage: `${relativeDir}/app-server-last-message.md`,
      agentSession: `${relativeDir}/agent-session.json`,
      lastMessage: `${relativeDir}/last-message.md`,
    },
    promptStack: ["active-change", "topic-thread", "aho-skills", "user-message"],
    enabledSkills: skillContext.records,
  };
  await writeJsonFile(paths.run, run);
  live?.emit({ event: "run.started", data: { runId, changeId, runtime: "codex-readonly", actionType: "chat.ask" } });
  await appendRunEvent(paths.events, { timestamp: now, type: "run.created", runId, data: { changeId, runtime: "codex-chat", requestedResume: Boolean(runtime.codexSessionId), skills: skillContext.records.map((item) => item.id) } });
  const context = await buildChatContext(project, memory, changeId, userMessage);
  await writeFile(paths.context, context, "utf8");
  const prompt = `${context}${skillContext.promptSection ? `\n\n${skillContext.promptSection}` : ""}\n\n## User Message\n\n${userMessage}\n`;
  await writeFile(paths.prompt, prompt, "utf8");
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "context.prepared", runId, data: { path: run.artifacts.context } });

  const appServerCapabilities = await detectCodexAppServerCapability();
  if (appServerCapabilities.available) {
    run = { ...run, command: ["codex", "app-server", "--listen", "stdio://"], status: "running" };
    await writeJsonFile(paths.run, run);
    await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "app-server.started", runId, data: { phase: "chat", resumed: Boolean(runtime.codexSessionId) } });
    const result = await runCodexAppServerTurn({
      projectId: project.id,
      changeId,
      roleId: "planning-agent",
      runId,
      cwd: project.path,
      prompt,
      sandboxPolicy: "read-only",
      paths: {
        events: paths.appServerEvents,
        stderr: paths.appServerStderr,
        lastMessage: paths.appServerLastMessage,
        session: paths.agentSession,
      },
      existingThreadId: runtime.codexSessionId,
      onTextDelta: (delta) => emitLive(live, { event: "assistant.delta", data: { delta, runId } }),
      onNotification: (notification) => forwardAppServerNotification(runId, notification, live),
      onError: (error) => emitLive(live, { event: "error", data: { runId, message: error instanceof Error ? error.message : String(error) } }),
    });
    const status: RunStatus = result.status === "completed" ? "completed" : "failed";
    const lastMessage = result.lastMessage.trim() || result.error || "Codex app-server did not return a final message.";
    await writeFile(paths.lastMessage, lastMessage, "utf8");
    await writeTopicRuntime(memory, changePath, { version: "1.0", changeId, codexSessionId: result.threadId ?? runtime.codexSessionId, updatedAt: new Date().toISOString() });
    await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "app-server.exited", runId, data: { phase: "chat", status: result.status, threadId: result.threadId, turnId: result.turnId, error: result.error } });
    run = { ...run, status, exitCode: status === "completed" ? 0 : 1, signal: null, finishedAt: new Date().toISOString() };
    await writeJsonFile(paths.run, run);
    await appendRunEvent(paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: status === "completed" ? "run.completed" : "run.failed", runId });
    live?.emit({ event: "run.status", data: { runId, status } });
    return { run, message: lastMessage, codexSessionId: result.threadId ?? runtime.codexSessionId };
  }
  emitAssistantEvent(live, {
    runId,
    kind: "status",
    phase: "fallback",
    title: "实时引导不可用",
    summary: "Codex app-server 不可用，当前输入会在下一轮生效。",
  });
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "app-server.unavailable", runId, data: { errors: appServerCapabilities.errors } });

  const capabilities = await detectCodexCapabilities();
  const canResume = Boolean(runtime.codexSessionId) && capabilities.supportsSafeResume;
  const argv = canResume
    ? buildCodexReadonlyResumeArgv(capabilities, { projectPath: project.path, lastMessagePath: paths.lastMessage, sessionId: runtime.codexSessionId as string, additionalReadDirs: memory.mode === "external-local" ? [memory.memoryRoot] : [] })
    : buildCodexReadonlyArgv(capabilities, { projectPath: project.path, lastMessagePath: paths.lastMessage, additionalReadDirs: memory.mode === "external-local" ? [memory.memoryRoot] : [] });

  run = { ...run, command: [argv.command, ...argv.args], status: "running" };
  await writeJsonFile(paths.run, run);
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "codex.started", runId, data: { phase: "chat", resumed: canResume, resumeFallback: Boolean(runtime.codexSessionId) && !canResume, skillWarnings: skillContext.warnings } });
  const parser = createLiveCodexParser(runId, live);
  const processResult = await executeProcessStreaming({
    cwd: project.path,
    command: argv.command,
    args: argv.args,
    stdin: prompt,
    stdoutPath: paths.stdout,
    stderrPath: paths.stderr,
    mirrorStdoutPath: paths.codexEvents,
    onStdoutChunk: (text) => parser.feed(text),
    onCallbackError: (_stream, error) => emitLive(live, { event: "error", data: { message: error instanceof Error ? error.message : String(error), runId } }),
    stopSignal: () => isRunStopRequested(runId),
  });
  parser.flush();
  const stdout = processResult.stdoutSample;
  const lastMessage = existsSync(paths.lastMessage)
    ? await readFile(paths.lastMessage, "utf8")
    : extractFinalMessageFromCodexJsonl(stdout) ?? "";
  if (!existsSync(paths.lastMessage)) await writeFile(paths.lastMessage, lastMessage || "# Codex Chat Not Captured\n", "utf8");
  const nextSessionId = extractCodexSessionIdFromJsonl(stdout) ?? runtime.codexSessionId;
  await writeTopicRuntime(memory, changePath, { version: "1.0", changeId, codexSessionId: nextSessionId, updatedAt: new Date().toISOString() });
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "codex.exited", runId, data: { phase: "chat", exitCode: processResult.exitCode, signal: processResult.signal, sessionLinked: Boolean(nextSessionId) } });
  const status: RunStatus = processResult.exitCode === 0 ? "completed" : "failed";
  run = { ...run, status, exitCode: processResult.exitCode, signal: processResult.signal, finishedAt: new Date().toISOString() };
  await writeJsonFile(paths.run, run);
  await appendRunEvent(paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: status === "completed" ? "run.completed" : "run.failed", runId });
  live?.emit({ event: "run.status", data: { runId, status } });
  return { run, message: lastMessage.trim() || processResult.stderrSample || "Codex did not return a final message.", codexSessionId: nextSessionId };
}

function compactArtifactRefs(...refs: Array<string | undefined | null>): string[] {
  return refs.filter((ref): ref is string => typeof ref === "string" && ref.trim().length > 0);
}

function createLiveCodexParser(runId: string, live: WorkbenchLiveSink | undefined): ReturnType<typeof createCodexJsonlStreamParser> {
  return createCodexJsonlStreamParser((event: CodexJsonlStreamEvent) => {
    forwardCodexStreamEvent(runId, event, live);
  });
}

function forwardCodexStreamEvent(runId: string, event: CodexJsonlStreamEvent, live: WorkbenchLiveSink | undefined): void {
    if (!live) return;
    if (event.type === "readable_event") {
      emitAssistantEvent(live, { ...event.event, runId });
      return;
    }
    if (event.type === "text_delta") {
      emitLive(live, { event: "assistant.delta", data: { delta: event.delta, runId } });
      return;
    }
    if (event.type === "status") {
      emitLive(live, { event: "run.status", data: { runId, status: event.label } });
      return;
    }
    if (event.type === "usage") {
      emitLive(live, { event: "usage", data: { runId, usage: event.usage } });
      emitAssistantEvent(live, {
        runId,
        kind: "usage",
        phase: "completed",
        title: "Usage recorded",
        summary: formatUsageSummary(event.usage),
      });
      return;
    }
    if (event.type === "error") {
      emitLive(live, { event: "error", data: { runId, message: event.message } });
      emitAssistantEvent(live, { runId, kind: "error", phase: "failed", title: "Codex error", summary: event.message, isError: true });
      return;
    }
    if (event.type === "tool_event") {
      const preview = truncateReadablePreview(event.output);
      emitLive(live, {
        event: "tool.event",
        data: {
          runId,
          itemId: event.id,
          phase: event.phase,
          name: event.name,
          command: event.command,
          outputTail: preview.preview,
          isError: event.isError,
          exitCode: typeof event.raw === "object" && event.raw && "item" in event.raw ? exitCodeFromRaw(event.raw) : undefined,
        },
      });
    }
}

function forwardAppServerNotification(runId: string, notification: CodexAppServerNotification, live: WorkbenchLiveSink | undefined): void {
  if (!live) return;
  const method = notification.method;
  if (method === "turn/completed") {
    emitLive(live, { event: "run.status", data: { runId, status: "completed" } });
    return;
  }
  if (method === "turn/failed") {
    const message = JSON.stringify(notification.params);
    emitLive(live, { event: "error", data: { runId, message } });
    emitAssistantEvent(live, { runId, kind: "error", phase: "failed", title: "Codex app-server turn failed", summary: message, isError: true });
    return;
  }
  if (method.includes("commandExecution")) {
    const command = commandFromAppServerParams(notification.params);
    emitAssistantEvent(live, {
      runId,
      itemId: itemIdFromAppServerParams(notification.params),
      kind: "command",
      phase: method.includes("completed") || method.includes("finished") ? "completed" : "running",
      title: "Command event",
      summary: command ?? method,
      command,
      preview: previewFromAppServerParams(notification.params),
    });
    return;
  }
  if (method.startsWith("item/") || method.startsWith("tool/")) {
    emitAssistantEvent(live, {
      runId,
      itemId: itemIdFromAppServerParams(notification.params),
      kind: "status",
      phase: "running",
      title: "Codex activity",
      summary: method,
    });
  }
}

function emitAssistantEvent(live: WorkbenchLiveSink | undefined, event: WorkbenchAssistantEvent): void {
  emitLive(live, { event: "assistant.event", data: { ...event, timestamp: event.timestamp ?? new Date().toISOString() } });
}

function formatUsageSummary(usage: Record<string, unknown>): string {
  const input = typeof usage.input_tokens === "number" ? usage.input_tokens : undefined;
  const output = typeof usage.output_tokens === "number" ? usage.output_tokens : undefined;
  const pieces = [
    input === undefined ? null : `${input} input tokens`,
    output === undefined ? null : `${output} output tokens`,
  ].filter((item): item is string => Boolean(item));
  return pieces.length > 0 ? pieces.join(" · ") : "Usage recorded.";
}

function exitCodeFromRaw(raw: unknown): number | undefined {
  if (!raw || typeof raw !== "object" || !("item" in raw)) return undefined;
  const item = (raw as { item?: unknown }).item;
  if (!item || typeof item !== "object" || !("exit_code" in item)) return undefined;
  const exitCode = (item as { exit_code?: unknown }).exit_code;
  return typeof exitCode === "number" ? exitCode : undefined;
}

function itemIdFromAppServerParams(params: Record<string, unknown>): string | undefined {
  if (typeof params.itemId === "string") return params.itemId;
  if (typeof params.id === "string") return params.id;
  if (isRecord(params.item) && typeof params.item.id === "string") return params.item.id;
  return undefined;
}

function commandFromAppServerParams(params: Record<string, unknown>): string | undefined {
  if (typeof params.command === "string") return params.command;
  if (Array.isArray(params.command)) return params.command.filter((part): part is string => typeof part === "string").join(" ");
  if (isRecord(params.item) && typeof params.item.command === "string") return params.item.command;
  if (isRecord(params.item) && Array.isArray(params.item.command)) return params.item.command.filter((part): part is string => typeof part === "string").join(" ");
  return undefined;
}

function previewFromAppServerParams(params: Record<string, unknown>): string | undefined {
  if (typeof params.output === "string") return truncateReadablePreview(params.output).preview;
  if (typeof params.text === "string") return truncateReadablePreview(params.text).preview;
  if (isRecord(params.item) && typeof params.item.output === "string") return truncateReadablePreview(params.item.output).preview;
  return undefined;
}

async function buildChatContext(project: ManagedProject, memory: ResolvedMemory, changeId: string, userMessage: string): Promise<string> {
  const status = await getChangeStatusForChange(project, changeId);
  const { changePath } = await resolveTopic(project, changeId);
  const recentMessages = (await readThreadLog(memory, changePath)).slice(-12);
  return [
    "# AHO Topic Chat",
    "",
    "You are answering inside the AHO Workbench Topic chat.",
    "This is ordinary read-only conversation. Do not edit files, create worktrees, apply changes, close changes, or claim approval.",
    "Use AHO artifacts as source of truth. Codex session memory is only runtime continuity.",
    "",
    buildContextProjection(status),
    "## Recent Topic Messages",
    "",
    ...recentMessages.map((entry) => `- ${entry.type}: ${entry.text ?? entry.actionType ?? entry.status ?? ""}`),
    "",
    "## Current User Message",
    "",
    userMessage,
  ].join("\n");
}

async function buildOrchestratorContext(project: ManagedProject, memory: ResolvedMemory, changePath: string, changeId: string, userMessage: string): Promise<string> {
  const status = await getChangeStatusForChange(project, changeId);
  const recentMessages = (await readThreadLog(memory, changePath)).slice(-16);
  return [
    "# AHO Workbench Orchestrator Context",
    "",
    "You are planning inside a single AHO Topic.",
    "The Orchestrator plan card is an interaction projection. It is not canonical workflow truth.",
    "Do not mutate files or claim acceptance.",
    "",
    buildContextProjection(status),
    "## Current Topic",
    "",
    `- Change ID: ${changeId}`,
    `- Active Changes: ${status.activeChanges.map((item) => item.name).join(", ") || "none"}`,
    "",
    "## Recent Topic Messages",
    "",
    ...recentMessages.map((entry) => `- ${entry.type}: ${entry.text ?? entry.actionType ?? entry.status ?? ""}`),
    "",
    "## Routing Policy",
    "",
    "- If the request is unrelated to this Topic, return routingDecision new-topic-required.",
    "- If routing is uncertain, return routingDecision clarify.",
    "- Otherwise return same-topic and suggest the next safe workflow action.",
    "",
    "## Current User Message",
    "",
    userMessage,
  ].join("\n");
}

function normalizeTopicMessageInput(input: string | TopicMessageInput): Required<Pick<TopicMessageInput, "mode" | "message">> {
  const mode = typeof input === "string" ? "chat" : input.mode ?? "chat";
  const message = typeof input === "string" ? input : input.message ?? input.text ?? "";
  if (mode !== "chat" && mode !== "plan") throw new Error("Message mode must be chat or plan.");
  if (!message.trim()) throw new Error("Message text is required.");
  return { mode, message: message.trim() };
}

function parseOrchestrationOutput(message: string, userMessage: string, fallbackDecision: TopicRoutingDecision): {
  routingDecision: TopicRoutingDecision;
  assistantMessage: string;
  planCard: OrchestrationPlanCard;
  suggestedActions: SuggestedAction[];
} {
  const json = extractJsonObject(message);
  if (!json) return fallbackOrchestration(userMessage, fallbackDecision, ["Orchestrator output did not include parseable JSON."]);
  try {
    const parsed = orchestrationOutputSchema.parse(JSON.parse(json));
    return {
      routingDecision: parsed.routingDecision,
      assistantMessage: parsed.assistantMessage,
      planCard: {
        title: parsed.planCard.title,
        summary: parsed.planCard.summary,
        steps: parsed.planCard.steps,
        warnings: parsed.planCard.warnings,
      },
      suggestedActions: parsed.suggestedActions.filter(isAllowedSuggestedAction),
    };
  } catch (cause) {
    return fallbackOrchestration(userMessage, fallbackDecision, [`Orchestrator JSON was invalid: ${cause instanceof Error ? cause.message : String(cause)}`]);
  }
}

const orchestrationOutputSchema = z.object({
  routingDecision: z.enum(["same-topic", "new-topic-required", "clarify"]).default("same-topic"),
  assistantMessage: z.string().default("I prepared a workflow plan."),
  planCard: z.object({
    title: z.string().default("Plan mode"),
    summary: z.string().default("Review the suggested action before advancing the workflow."),
    steps: z.array(z.object({
      label: z.string(),
      description: z.string(),
      actionId: z.string().optional(),
      requiresConfirmation: z.boolean().optional(),
    })).default([]),
    warnings: z.array(z.string()).default([]),
  }).default({ title: "Plan mode", summary: "Review the suggested action before advancing the workflow.", steps: [], warnings: [] }),
  suggestedActions: z.array(z.object({
    actionType: z.enum(["change.spec.propose", "change.plan.propose", "code.run", "spec-test.drift"]),
    label: z.string(),
    requiresConfirmation: z.boolean().default(true),
    prompt: z.string().optional(),
  })).default([]),
});

function fallbackOrchestration(userMessage: string, routingDecision: TopicRoutingDecision, warnings: string[]): {
  routingDecision: TopicRoutingDecision;
  assistantMessage: string;
  planCard: OrchestrationPlanCard;
  suggestedActions: SuggestedAction[];
} {
  const actionType: SuggestedAction["actionType"] = routingDecision === "same-topic" ? "change.spec.propose" : "spec-test.drift";
  const assistantMessage = routingDecision === "same-topic"
    ? "I prepared a controlled plan. Start with a Spec proposal so the request is anchored before coding."
    : routingDecision === "new-topic-required"
      ? "This looks like a different request. Create or switch Topic before continuing so the current Change stays clean."
      : "I need a routing decision before attaching this request to the current Topic.";
  return {
    routingDecision,
    assistantMessage,
    planCard: {
      title: routingDecision === "same-topic" ? "Controlled implementation plan" : "Topic routing required",
      summary: routingDecision === "same-topic"
        ? `Convert the request into a Spec proposal, then proceed through Plan, Coder, Validation, Audit, and explicit Apply/Close gates. Request: ${userMessage}`
        : "AHO will not mix unrelated or uncertain work into the current Topic.",
      steps: routingDecision === "same-topic"
        ? [
            { label: "Draft Spec", description: "Generate a proposal only; user acceptance writes canonical spec.md.", actionId: "change.spec.propose", requiresConfirmation: true },
            { label: "Draft Plan", description: "After Spec acceptance, generate plan.md and tasks.md proposal.", actionId: "change.plan.propose", requiresConfirmation: true },
            { label: "Code and verify", description: "After explicit Code confirmation, run Coder, validation, and audit on the same worktree.", actionId: "code.run", requiresConfirmation: true },
          ]
        : [{ label: "Resolve routing", description: "Create/switch/park/close a Topic before continuing.", requiresConfirmation: true }],
      warnings,
    },
    suggestedActions: routingDecision === "same-topic"
      ? [{ actionType, label: "Generate Spec proposal", requiresConfirmation: true, prompt: userMessage }]
      : [],
  };
}

function classifyTopicRouting(userMessage: string, recentMessages: TopicThreadEntry[]): TopicRoutingDecision {
  const normalized = userMessage.trim().toLowerCase();
  if (/新(topic|主题)|另一个|无关|换个需求|new topic/.test(normalized)) return "new-topic-required";
  if (/这个需求|继续|补充|修改上面|刚才|current|same topic/.test(normalized)) return "same-topic";
  if (recentMessages.length === 0) return "same-topic";
  if (normalized.length < 8) return "clarify";
  return "same-topic";
}

function extractJsonObject(text: string): string | null {
  const fenced = /```json\s*([\s\S]*?)```/i.exec(text);
  if (fenced?.[1]) return fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return null;
}

function isAllowedSuggestedAction(action: SuggestedAction): boolean {
  return action.actionType === "change.spec.propose" || action.actionType === "change.plan.propose" || action.actionType === "code.run" || action.actionType === "spec-test.drift";
}

function renderPlanCardMarkdown(plan: { routingDecision: TopicRoutingDecision; assistantMessage: string; planCard: OrchestrationPlanCard; suggestedActions: SuggestedAction[] }): string {
  return [
    `# ${plan.planCard.title}`,
    "",
    `Routing: ${plan.routingDecision}`,
    "",
    plan.assistantMessage,
    "",
    "## Summary",
    "",
    plan.planCard.summary,
    "",
    "## Steps",
    "",
    ...plan.planCard.steps.map((step) => `- ${step.label}: ${step.description}`),
    "",
    "## Suggested Actions",
    "",
    ...(plan.suggestedActions.length > 0 ? plan.suggestedActions.map((action) => `- ${action.actionType}: ${action.label}`) : ["- None"]),
    "",
    "## Warnings",
    "",
    ...(plan.planCard.warnings.length > 0 ? plan.planCard.warnings.map((warning) => `- ${warning}`) : ["- None"]),
    "",
  ].join("\n");
}

function buildDeterministicPlanningBundle(
  memory: ResolvedMemory,
  changePath: string,
  changeId: string,
  prompt: string,
  previous: PlanningArtifactBundle | null,
  revision: boolean,
): PlanningArtifactBundle {
  const now = new Date().toISOString();
  const id = `planning-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const goal = revision && previous ? `${previous.goal}\n\nRevision request: ${prompt}` : prompt;
  const constraints = uniqueStrings([
    ...(previous?.constraints ?? []),
    ...extractConstraintCandidates(prompt),
  ]);
  const acceptanceCriteria = buildAcceptanceCriteria(goal, constraints);
  const tasks = [
    { id: "T-001", title: "Implement the accepted demand and update tests.", acIds: acceptanceCriteria.map((_item, index) => `AC-${String(index + 1).padStart(3, "0")}`) },
  ];
  const specMd = renderSpecMarkdown(changeId, goal, constraints, acceptanceCriteria);
  const planMd = renderImplementationPlanMarkdown(goal, tasks);
  const tasksMd = renderTasksMarkdown(tasks);
  const changeDir = join(memory.memoryRoot, changePath);
  const artifact = displayArtifactPath(memory, join(changeDir, "planning", "latest-bundle.md"));
  return {
    id,
    status: "draft",
    goal,
    constraints,
    acceptanceCriteria,
    design: "Use the smallest focused implementation in an AHO-owned worktree, add or update tests for the pricing rule, then run independent validation and audit.",
    tasks,
    risks: ["Validation or audit may require one bounded rework cycle.", "User confirmation is still required before applying/merging source changes."],
    openQuestions: constraints.length > 0 ? [] : ["Confirm rounding, membership eligibility, and test coverage expectations if they are not already stated."],
    specMd,
    planMd,
    tasksMd,
    acMapCandidate: buildAcMap({ changeId, specContent: specMd, tasksContent: tasksMd, placeholderFiles: [] }),
    artifact,
    updatedAt: now,
  };
}

async function writePlanningBundle(memory: ResolvedMemory, changePath: string, bundle: PlanningArtifactBundle): Promise<void> {
  const dir = join(memory.memoryRoot, changePath, "planning");
  await mkdir(dir, { recursive: true });
  await writeJsonFile(join(dir, "latest-bundle.json"), bundle);
  await writeFile(join(dir, "latest-bundle.md"), renderPlanningBundleMarkdown(bundle), "utf8");
}

function buildDeterministicDecompositionPlan(
  memory: ResolvedMemory,
  changePath: string,
  changeId: string,
  bundle: PlanningArtifactBundle | null,
  thread: TopicThreadEntry[],
  prompt: string | undefined,
): DecompositionPlan {
  const now = new Date().toISOString();
  const id = `decomposition-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const threadText = thread.map((entry) => entry.text ?? "").join("\n");
  const signalText = [bundle?.goal, bundle?.design, prompt, threadText].filter(Boolean).join("\n");
  const tasks = bundle?.tasks.length ? bundle.tasks : [{ id: "T-001", title: bundle?.goal ?? "Clarify and implement the accepted demand.", acIds: [] }];
  const asksClarification = (bundle?.openQuestions.length ?? 0) > 0 || /不明确|澄清|clarify/i.test(signalText);
  const parallelSignal = /并行|parallel|多个模块|多模块|independent|独立/.test(signalText);
  const multiChangeSignal = /多个 change|multi-change|多个需求|拆成多个/.test(signalText);
  const recommendation: DecompositionRecommendation = asksClarification
    ? "needs-clarification"
    : multiChangeSignal
      ? "multi-change-candidate"
      : tasks.length > 1
        ? parallelSignal ? "taskgraph-parallel-candidate" : "taskgraph-sequential"
        : "single-change";
  const units: DecompositionUnit[] = tasks.map((task, index) => ({
    id: `DU-${String(index + 1).padStart(3, "0")}`,
    title: task.title,
    summary: recommendation === "single-change" ? "Keep this demand as one Coding Work Package." : "Candidate scoped execution unit from accepted planning tasks.",
    taskIds: [task.id],
    acIds: task.acIds,
    scopeHints: ["selected-demand", "AHO-owned worktree only"],
    dependsOn: index === 0 ? [] : [`DU-${String(index).padStart(3, "0")}`],
    recommendedRoleId: "coder-agent",
  }));
  const dependencies = units.slice(1).map((unit, index) => ({ from: units[index]?.id ?? units[0]?.id ?? unit.id, to: unit.id, kind: "blocks" as const }));
  const changeDir = join(memory.memoryRoot, changePath);
  const artifact = displayArtifactPath(memory, join(changeDir, "planning", "decomposition-plan.json"));
  const markdownArtifact = displayArtifactPath(memory, join(changeDir, "planning", "decomposition-plan.md"));
  return {
    id,
    changeId,
    status: "draft",
    recommendation,
    rationale: rationaleForRecommendation(recommendation, units.length),
    units,
    dependencies,
    conflictScopes: recommendation === "single-change" ? [] : ["source overlap must be checked before parallel execution"],
    riskSummary: "This is a proposal only. User confirmation does not start execution, create child Changes, or trust recovered work.",
    openQuestions: bundle?.openQuestions ?? [],
    artifactRefs: [bundle?.artifact].filter((item): item is string => Boolean(item)),
    recoveryKeyInputs: {
      changeId,
      planningBundleId: bundle?.id,
      acceptedArtifactRefs: [bundle?.artifact].filter((item): item is string => Boolean(item)),
      contextScope: "selected-demand",
      rolePolicyProfile: "main-agent proposal; worker roles remain leaves",
      notes: [
        "Recovery may reuse only scoped execution progress in later phases.",
        "Change, context, source, policy, and accepted artifact hashes must still match.",
      ],
    },
    artifact,
    markdownArtifact,
    createdAt: now,
    updatedAt: now,
  };
}

async function buildDecompositionReadinessManifest(
  memory: ResolvedMemory,
  changePath: string,
  changeId: string,
  plan: DecompositionPlan,
): Promise<DecompositionReadinessManifest> {
  const status = await getChangeStatusForChange(memory, changeId);
  if (!status.change) throw new Error(`planning.decomposition.assess-readiness target is stale or missing active Change: ${changeId}.`);
  if (plan.changeId !== changeId) throw new Error("DecompositionPlan is not scoped to the selected Change.");
  const knownTasks = new Set((status.acMap?.tasks ?? []).map((task) => task.id));
  const knownAcs = new Set((status.acMap?.acceptanceCriteria ?? []).map((ac) => ac.id));
  const unitIds = new Set(plan.units.map((unit) => unit.id));
  const taskIds = unique(plan.units.flatMap((unit) => unit.taskIds));
  const acIds = unique(plan.units.flatMap((unit) => unit.acIds));
  const guardrails: DecompositionReadinessGuardrail[] = [];
  const addGuardrail = (id: string, passed: boolean, summary: string, refs: string[] = []): void => {
    guardrails.push({ id, status: passed ? "passed" : "failed", summary, refs });
  };
  addGuardrail("change-scope", status.acMap?.changeId === changeId, "Plan and accepted AC map must belong to the selected demand.", [changeId]);
  addGuardrail("plan-confirmed", plan.status === "confirmed", "Only a confirmed DecompositionPlan can be assessed.", [plan.id]);
  addGuardrail("task-ids-known", taskIds.every((id) => knownTasks.has(id)), "Every referenced task id must exist in accepted tasks.", taskIds);
  addGuardrail("ac-ids-known", acIds.every((id) => knownAcs.has(id)), "Every referenced AC id must exist in accepted acceptance criteria.", acIds);
  addGuardrail(
    "dependency-units-known",
    plan.units.every((unit) => unit.dependsOn.every((id) => unitIds.has(id))) && plan.dependencies.every((dep) => unitIds.has(dep.from) && unitIds.has(dep.to)),
    "Every dependency must reference a known DecompositionUnit.",
    plan.dependencies.flatMap((dep) => [dep.from, dep.to]),
  );
  const integrityFailure = guardrails.some((item) => item.status === "failed");
  if (integrityFailure) {
    throw new Error(`DecompositionReadiness guardrail failed: ${guardrails.filter((item) => item.status === "failed").map((item) => item.id).join(", ")}.`);
  }

  const sourceScopesSpecific = plan.units.every((unit) => unit.scopeHints.some((hint) => isSpecificSourceScope(hint)));
  const conflictScopesSpecific = plan.conflictScopes.length > 0 && plan.conflictScopes.every((scope) => isSpecificSourceScope(scope));
  const parallelReady = sourceScopesSpecific && conflictScopesSpecific;
  const recommendationGuardrail: DecompositionReadinessGuardrail = plan.recommendation === "taskgraph-parallel-candidate"
    ? {
        id: "parallel-conflict-scopes",
        status: parallelReady ? "passed" : "blocked",
        summary: parallelReady
          ? "Parallel candidate has explicit source and conflict scopes."
          : "Parallel candidate is blocked until source/task scopes and conflict scopes are concrete.",
        refs: [...plan.conflictScopes, ...plan.units.flatMap((unit) => unit.scopeHints)],
      }
    : {
        id: "recommendation-boundary",
        status: "passed",
        summary: "Recommendation maps to a non-executing readiness verdict in this phase.",
        refs: [plan.recommendation],
      };
  guardrails.push(recommendationGuardrail);

  const readinessStatus = readinessStatusForRecommendation(plan.recommendation, parallelReady);
  const now = new Date().toISOString();
  const dir = join(memory.memoryRoot, changePath, "planning");
  const artifact = displayArtifactPath(memory, join(dir, "decomposition-readiness.json"));
  const markdownArtifact = displayArtifactPath(memory, join(dir, "decomposition-readiness.md"));
  const units: DecompositionReadinessUnit[] = plan.units.map((unit) => ({
    id: unit.id,
    title: unit.title,
    taskIds: unit.taskIds,
    acIds: unit.acIds,
    dependsOn: unit.dependsOn,
    guardrailStatus: recommendationGuardrail.status === "failed" ? "failed" : recommendationGuardrail.status === "blocked" ? "blocked" : "passed",
    sourceScopes: unit.scopeHints,
  }));
  return {
    id: `readiness-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    changeId,
    decompositionPlanId: plan.id,
    status: readinessStatus,
    recommendation: plan.recommendation,
    executable: false,
    schedulerEligible: readinessStatus === "ready-for-sequential-taskqueue-proposal",
    nextAllowedAction: nextAllowedActionForReadiness(readinessStatus),
    units,
    dependencies: plan.dependencies,
    conflictScopes: plan.conflictScopes,
    guardrails,
    recoveryKeyMaterial: {
      ...plan.recoveryKeyInputs,
      decompositionPlanId: plan.id,
      taskIds,
      acIds,
    },
    artifactRefs: unique([...plan.artifactRefs, plan.artifact, plan.markdownArtifact, ...plan.recoveryKeyInputs.acceptedArtifactRefs]),
    artifact,
    markdownArtifact,
    createdAt: now,
    updatedAt: now,
  };
}

function readinessStatusForRecommendation(recommendation: DecompositionRecommendation, parallelReady: boolean): DecompositionReadinessStatus {
  switch (recommendation) {
    case "single-change": return "ready-for-single-change";
    case "taskgraph-sequential": return "ready-for-sequential-taskqueue-proposal";
    case "taskgraph-parallel-candidate": return parallelReady ? "ready-for-sequential-taskqueue-proposal" : "blocked-parallel-guardrails";
    case "multi-change-candidate": return "blocked-multi-change-boundary";
    case "needs-clarification": return "blocked-needs-clarification";
  }
}

function nextAllowedActionForReadiness(status: DecompositionReadinessStatus): DecompositionReadinessManifest["nextAllowedAction"] {
  switch (status) {
    case "ready-for-single-change": return "code.run";
    case "ready-for-sequential-taskqueue-proposal": return "taskqueue.proposal";
    case "blocked-needs-clarification": return "clarification.answer";
    case "blocked-parallel-guardrails":
    case "blocked-multi-change-boundary":
    case "invalid":
      return "none";
  }
}

function isSpecificSourceScope(scope: string): boolean {
  const normalized = scope.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === "selected-demand") return false;
  if (normalized === "aho-owned worktree only") return false;
  if (normalized.includes("must be checked")) return false;
  if (normalized.includes("source overlap")) return false;
  return /[/.\\]/.test(normalized) || /\bsrc\b|\btest\b|\bdocs\b|\bmodule\b|\bpackage\b/.test(normalized);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function rationaleForRecommendation(recommendation: DecompositionRecommendation, unitCount: number): string {
  switch (recommendation) {
    case "needs-clarification": return "The current demand still has open questions, so execution should wait for user clarification.";
    case "multi-change-candidate": return "The demand appears broad enough to consider multiple child Changes, but this phase records only the proposal.";
    case "taskgraph-parallel-candidate": return "Multiple execution units may be independent, but conflict scopes and synthesis still need Harness checks.";
    case "taskgraph-sequential": return `The demand maps to ${unitCount} ordered TaskGraph candidate units.`;
    case "single-change": return "The accepted scope fits one Change and one Coding Work Package.";
  }
}

function decompositionRecommendationLabel(recommendation: DecompositionRecommendation): string {
  switch (recommendation) {
    case "needs-clarification": return "需要先澄清";
    case "multi-change-candidate": return "可考虑拆成多个 Change";
    case "taskgraph-parallel-candidate": return "可考虑 TaskGraph 并行候选";
    case "taskgraph-sequential": return "建议 TaskGraph 顺序执行";
    case "single-change": return "建议保持单 Change";
  }
}

function renderDecompositionPlanSummary(plan: DecompositionPlan): string {
  return [
    `拆分建议：${decompositionRecommendationLabel(plan.recommendation)}`,
    "",
    plan.rationale,
    "",
    `执行单元：${plan.units.map((unit) => `${unit.id} ${unit.title}`).join("；") || "无需拆分"}`,
    "",
    "确认这个拆分方向只会记录 proposal 接受，不会启动执行。",
  ].join("\n");
}

function renderDecompositionReadinessSummary(manifest: DecompositionReadinessManifest): string {
  return [
    `执行边界检查：${manifest.status}`,
    "",
    `建议：${decompositionRecommendationLabel(manifest.recommendation)}`,
    `下一步允许动作：${manifest.nextAllowedAction}`,
    "",
    `调度资格：${manifest.schedulerEligible ? "可进入后续 TaskQueue proposal" : "不可直接调度"}`,
    "本检查不会启动执行、创建子 Change、TaskRun、AgentTask、worktree 或恢复重放。",
  ].join("\n");
}

function extractConstraintCandidates(prompt: string): string[] {
  const candidates: string[] = [];
  if (/四舍五入|分/.test(prompt)) candidates.push("金额按分处理，涉及折扣时需要明确舍入规则。");
  if (/会员/.test(prompt)) candidates.push("只有会员订单参与会员折扣规则。");
  if (/非会员/.test(prompt)) candidates.push("非会员不打折。");
  if (/100/.test(prompt)) candidates.push("会员订单满 100 元才触发折扣。");
  if (/测试|test/i.test(prompt)) candidates.push("需要补充或更新测试覆盖核心规则。");
  return candidates;
}

function buildAcceptanceCriteria(goal: string, constraints: string[]): string[] {
  const criteria = constraints.length > 0 ? constraints : [goal];
  return criteria.slice(0, 5).map((criterion, index) => `AC-${String(index + 1).padStart(3, "0")}: ${criterion}`);
}

function renderSpecMarkdown(changeId: string, goal: string, constraints: string[], acceptanceCriteria: string[]): string {
  return [
    `# Spec: ${changeId}`,
    "",
    "## Goal",
    "",
    goal,
    "",
    "## Constraints",
    "",
    ...(constraints.length > 0 ? constraints.map((item) => `- ${item}`) : ["- No extra constraints confirmed yet."]),
    "",
    "## Acceptance Criteria",
    "",
    ...acceptanceCriteria.map((item) => `- ${item}`),
    "",
  ].join("\n");
}

function renderImplementationPlanMarkdown(goal: string, tasks: PlanningArtifactBundle["tasks"]): string {
  return [
    "# Plan",
    "",
    "## Approach",
    "",
    `Implement the accepted demand in one Coding Work Package: ${goal}`,
    "",
    "## Tasks",
    "",
    ...tasks.map((task) => `- ${task.id}: ${task.title} (${task.acIds.join(", ")})`),
    "",
    "## Verification",
    "",
    "- Run targeted tests, then independent validation and audit.",
    "",
  ].join("\n");
}

function renderTasksMarkdown(tasks: PlanningArtifactBundle["tasks"]): string {
  return [
    "# Tasks",
    "",
    ...tasks.map((task) => `- [ ] ${task.id}: ${task.title} Covers: ${task.acIds.join(", ")}`),
    "",
  ].join("\n");
}

function renderPlanningBundleSummary(bundle: PlanningArtifactBundle): string {
  return [
    `我准备了方案草案：${bundle.goal}`,
    "",
    `验收标准：${bundle.acceptanceCriteria.join("；")}`,
    `实现方案：${bundle.design}`,
    `任务：${bundle.tasks.map((task) => `${task.id} ${task.title}`).join("；")}`,
    bundle.openQuestions.length > 0 ? `待确认：${bundle.openQuestions.join("；")}` : "如果认可，可以确认执行；如果不认可，可以直接在主对话里要求修改。",
  ].join("\n");
}

function renderPlanningBundleMarkdown(bundle: PlanningArtifactBundle): string {
  return [
    `# Planning Draft ${bundle.id}`,
    "",
    `Status: ${bundle.status}`,
    "",
    "## Goal",
    "",
    bundle.goal,
    "",
    "## Constraints",
    "",
    ...(bundle.constraints.length > 0 ? bundle.constraints.map((item) => `- ${item}`) : ["- None confirmed."]),
    "",
    "## Acceptance Criteria",
    "",
    ...bundle.acceptanceCriteria.map((item) => `- ${item}`),
    "",
    "## Design",
    "",
    bundle.design,
    "",
    "## Tasks",
    "",
    ...bundle.tasks.map((task) => `- ${task.id}: ${task.title} (${task.acIds.join(", ")})`),
    "",
    "## Risks",
    "",
    ...bundle.risks.map((item) => `- ${item}`),
    "",
    "## Open Questions",
    "",
    ...(bundle.openQuestions.length > 0 ? bundle.openQuestions.map((item) => `- ${item}`) : ["- None."]),
    "",
  ].join("\n");
}

function uniqueStrings(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

async function finishOrchestratorRun(path: string, run: RunMetadata, status: RunStatus, exitCode: number | null, signal: NodeJS.Signals | null): Promise<RunMetadata> {
  const next = { ...run, status, exitCode, signal, finishedAt: new Date().toISOString() };
  await writeJsonFile(path, next);
  return next;
}

async function resolveTopic(project: ManagedProject, changeId: string): Promise<{ memory: ResolvedMemory; changePath: string }> {
  const memory = await resolveProjectMemory(project);
  const roots = [join(memory.changesRoot, "active"), join(memory.changesRoot, "archive")];
  for (const root of roots) {
    const candidate = join(root, changeId);
    if (existsSync(candidate)) {
      return { memory, changePath: relative(memory.memoryRoot, candidate).replace(/\\/g, "/") };
    }
    if (root.endsWith("archive")) {
      const archived = await readdir(root, { withFileTypes: true }).catch(() => []);
      for (const entry of archived) {
        if (!entry.isDirectory()) continue;
        const archivedCandidate = join(root, entry.name);
        const metadata = await readJsonFile(join(archivedCandidate, "change.json"), z.object({ id: z.string().optional() }), { id: undefined }).catch(() => ({ id: undefined }));
        if (metadata.id === changeId) {
          return { memory, changePath: relative(memory.memoryRoot, archivedCandidate).replace(/\\/g, "/") };
        }
      }
    }
  }
  throw new Error(`Topic not found: ${changeId}.`);
}

async function getSingleActiveChangeId(project: ManagedProject): Promise<string> {
  const memory = await resolveProjectMemory(project);
  const active = await getActiveChanges(memory);
  if (active.length !== 1) throw new Error(`Expected exactly one active Topic; found ${active.length}.`);
  return active[0].name;
}

async function readTopicRuntime(memory: ResolvedMemory, changePath: string, changeId: string): Promise<TopicRuntimeMetadata> {
  const projectId = memory.projectId ?? "unregistered";
  const store = await WorkbenchStore.open(memory);
  try {
    const link = store.readCodexSession(projectId, changeId);
    if (link) return { version: "1.0", changeId, codexSessionId: link.codexSessionId, updatedAt: link.updatedAt };
  } finally {
    store.close();
  }
  return readJsonFile(join(memory.memoryRoot, changePath, "topic-runtime.json"), runtimeMetadataSchema, {
    version: "1.0",
    changeId,
    codexSessionId: null,
    updatedAt: new Date(0).toISOString(),
  });
}

async function writeTopicRuntime(memory: ResolvedMemory, changePath: string, metadata: TopicRuntimeMetadata): Promise<void> {
  const store = await WorkbenchStore.open(memory);
  try {
    store.writeCodexSession({
      projectId: memory.projectId ?? "unregistered",
      changeId: metadata.changeId,
      codexSessionId: metadata.codexSessionId,
      updatedAt: metadata.updatedAt,
    });
  } finally {
    store.close();
  }
  await writeJsonFile(join(memory.memoryRoot, changePath, "topic-runtime.json"), metadata);
}

export async function recordWorkbenchDecision(project: ManagedProject, input: {
  id: string;
  changeId: string | null;
  decisionType: string;
  status: StoredDecisionRecord["status"];
  label: string;
  summary: string;
  targetId: string | null;
  runId: string | null;
  artifact: string | null;
  actionId: string | null;
  feedback?: string | null;
  payload: unknown;
  completedAt?: string | null;
}): Promise<void> {
  const memory = await resolveProjectMemory(project);
  const now = new Date().toISOString();
  const store = await WorkbenchStore.open(memory);
  try {
    store.upsertDecision({
      id: input.id,
      projectId: memory.projectId ?? "unregistered",
      changeId: input.changeId,
      decisionType: input.decisionType,
      status: input.status,
      label: input.label,
      summary: input.summary,
      targetId: input.targetId,
      runId: input.runId,
      artifact: input.artifact,
      actionId: input.actionId,
      feedback: input.feedback ?? null,
      payloadJson: JSON.stringify(input.payload),
      createdAt: now,
      updatedAt: now,
      completedAt: input.completedAt ?? null,
    });
  } finally {
    store.close();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}


