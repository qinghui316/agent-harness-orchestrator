import { existsSync } from "node:fs";
import { join } from "node:path";
import { startAuditRun } from "../audit/manager.js";
import { completeAgentTask } from "../agent-task/manager.js";
import { getActiveCodexAppServerTurn } from "../codex/app-server.js";
import { createConcurrentChange } from "../change/manager.js";
import { acceptPlanProposal, acceptSpecProposal, startPlanProposalRun, startSpecProposalRun } from "../change/proposals.js";
import { resolveProjectMemory } from "../memory/resolver.js";
import { listRuns } from "../run/manager.js";
import { requestRunStop } from "../run/control.js";
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
import { reconcileWorkflowTaskQueue } from "../workflow-runtime/taskqueue.js";
import {
  runCodeValidateAuditSequence,
  runTaskQueueSequence,
  runTaskRunCodeValidateAuditSequence,
  sourceRefreshReworkPrompt,
} from "../workflow-runtime/code-workflow.js";
import { startValidationRun } from "../validation/manager.js";
import type { ManagedProject, ResolvedMemory, RunMetadata } from "../types/index.js";
import { postTopicPlanMessage, runCodexChat } from "./codex-chat/bridge.js";
import {
  enqueueDemandWorkerForAction,
  evaluateDemandOrchestrator,
  pumpDemandWorkersForAction,
  reconcileDemandWorkersForAction,
  releaseDemandWorkerForAction,
  runMainAgentToolOrchestration,
  startNextDemandWorkerForAction,
} from "./demand-workers/orchestration.js";
import { runWorkbenchWorkflowActionService } from "./actions/service.js";
import { artifactForActionResult, extractRunId, labelForAction, summarizeActionResult, workflowFailureMessage } from "./actions/results.js";
import { assertWorkflowActionScope, auditHighImpactWorkflowAction, workflowActionScopePayload, workflowActionTargetId } from "./actions/boundary.js";
import { dispatchWorkbenchWorkflowAction, type WorkbenchActionHandlerMap } from "./actions/dispatcher.js";
import {
  assessDecompositionReadiness,
  compileTaskQueueWorkflowGraph,
  confirmDecompositionPlan,
  confirmPlanningAndStartPipeline,
  confirmTaskQueueProposalAndStart,
  generateDecompositionPlan,
  generatePlanningDraft,
  proposeTaskQueue,
} from "./actions/handlers/planning.js";
import { recordWorkbenchDecision } from "./decisions.js";
import { emitAssistantEvent } from "./live-events.js";
import { createAssistantTranscriptCapture } from "./live-transcript.js";
import { getSingleActiveChangeId, resolveTopic } from "./topic-resolver.js";
import { appendTopicThreadEntry } from "./topic-thread.js";
import { collectAllTopicThreadEntries, readTopicThreadLog as readThreadLog } from "./thread-log.js";
import type {
  TopicMessageInput,
  TopicMessageResult,
  TopicThreadEntry,
  WorkbenchLiveSink,
  WorkbenchWorkflowActionRequest,
  WorkbenchWorkflowActionResult,
  WorkbenchWorkflowActionType,
} from "./types.js";
export { recordWorkbenchDecision } from "./decisions.js";
export { appendTopicThreadEntry } from "./topic-thread.js";export type {
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
  "change.spec.propose": async (project, changeId, request) => startSpecProposalRun(project, { prompt: request.prompt, changeId }),
  "change.spec.accept": async (project, _changeId, request) => {
    if (!request.proposalId) throw new Error("change.spec.accept requires proposalId.");
    return acceptSpecProposal(project, request.proposalId);
  },
  "change.plan.propose": async (project, changeId, request) => startPlanProposalRun(project, { prompt: request.prompt, changeId }),
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
  "demand.worker.reconcile": async (project) => reconcileDemandWorkersForAction(project),
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

function normalizeTopicMessageInput(input: string | TopicMessageInput): Required<Pick<TopicMessageInput, "mode" | "message">> {
  const mode = typeof input === "string" ? "chat" : input.mode ?? "chat";
  const message = typeof input === "string" ? input : input.message ?? input.text ?? "";
  if (mode !== "chat" && mode !== "plan") throw new Error("Message mode must be chat or plan.");
  if (!message.trim()) throw new Error("Message text is required.");
  return { mode, message: message.trim() };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function compactArtifactRefs(...refs: Array<string | undefined | null>): string[] {
  return refs.filter((ref): ref is string => typeof ref === "string" && ref.trim().length > 0);
}


