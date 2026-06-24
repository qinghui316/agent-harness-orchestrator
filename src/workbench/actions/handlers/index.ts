import { startAuditRun } from "../../../audit/manager.js";
import { acceptPlanProposal, acceptSpecProposal, startPlanProposalRun, startSpecProposalRun } from "../../../change/proposals.js";
import { runIntegrationCheck } from "../../../integration-check/manager.js";
import { reconcileTaskRuns } from "../../../task-run/manager.js";
import { reconcileWorkflowTaskQueue } from "../../../workflow-runtime/taskqueue.js";
import { runCodeValidateAuditSequence, runTaskQueueSequence, runTaskRunCodeValidateAuditSequence, sourceRefreshReworkPrompt } from "../../../workflow-runtime/code-workflow.js";
import { startValidationRun } from "../../../validation/manager.js";
import { getSpecTestDriftReport } from "../../../spec-test/drift.js";
import type { ManagedProject, RunMetadata } from "../../../types/index.js";
import { enqueueDemandWorkerForAction, evaluateDemandOrchestrator, pumpDemandWorkersForAction, reconcileDemandWorkersForAction, releaseDemandWorkerForAction, runMainAgentToolOrchestration, startNextDemandWorkerForAction } from "../../demand-workers/orchestration.js";
import { assessDecompositionReadiness, compileTaskQueueWorkflowGraph, confirmDecompositionPlan, confirmPlanningAndStartPipeline, confirmTaskQueueProposalAndStart, generateDecompositionPlan, generatePlanningDraft, proposeTaskQueue } from "./planning.js";
import { cleanupRemoteBranchForAction, createPrDraftForAction, mergeNextLandingQueueForAction, mergeRemoteLandingForAction, prepareLandingForAction, prepareLandingQueueForAction, prepareLocalSyncForAction, preparePostMergeForAction, preparePrDraftForAction, preparePrReviewForAction, preparePrReviewReplyForAction, prepareRemoteBranchCleanupForAction, prepareRemoteLandingForAction, refreshLandingQueueForAction, refreshPrDraftForAction, refreshPrFeedbackForAction, refreshPrReviewForAction, refreshRemoteLandingForAction, reworkPrFeedbackForAction, resolvePrReviewThreadForAction, reviewLandingForAction, submitPrReviewForAction, submitPrReviewReplyForAction, syncLocalForAction, updatePrDraftForAction } from "./remote-handoff.js";
import { interruptConversation, steerConversation, stopRunningPipeline } from "./control.js";
import { buildGoalLoopActionHandlers } from "./goal-loop.js";
import { buildGoalLoopRuntimeActionHandlers } from "./goal-loop-runtime.js";
import { runScopedAutomationAction } from "./automation.js";
import { buildSchedulerActionHandlers } from "./scheduler.js";
import type { WorkbenchActionHandlerMap } from "../dispatcher.js";
import type { TopicMessageResult, WorkbenchLiveSink } from "../../types.js";

export interface WorkbenchActionHandlerDeps {
  postTopicMessage(project: ManagedProject, changeId: string, input: string, live?: WorkbenchLiveSink): Promise<TopicMessageResult>;
  findRunningRunForChange(project: ManagedProject, changeId: string): Promise<RunMetadata | null>;
}

export function buildWorkbenchActionHandlers(deps: WorkbenchActionHandlerDeps): WorkbenchActionHandlerMap {
  const handlers: WorkbenchActionHandlerMap = {
  "chat.ask": async (project, changeId, request, live) => {
    if (!request.prompt) throw new Error("chat.ask requires prompt.");
    return deps.postTopicMessage(project, changeId, request.prompt, live);
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
  ...buildGoalLoopActionHandlers(),
  ...buildGoalLoopRuntimeActionHandlers(),
  "planning.automation.scoped-auto.run": async (project, changeId, request, live) => runScopedAutomationAction(project, changeId, request, live, handlers),
  ...buildSchedulerActionHandlers(),
  "maintenance.canonical-update.decision.record": async () => {
    throw new Error("maintenance.canonical-update.decision.record is project-scoped and must not run through the demand topic workflow service.");
  },
  "maintenance.canonical-patch.application-gate.record": async () => {
    throw new Error("maintenance.canonical-patch.application-gate.record is project-scoped and must not run through the demand topic workflow service.");
  },
  "maintenance.canonical-patch.apply": async () => {
    throw new Error("maintenance.canonical-patch.apply is project-scoped and must not run through the demand topic workflow service.");
  },
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
  "role.pipeline.stop": async (project, changeId, request, live) => stopRunningPipeline(project, changeId, request.prompt, live, deps),
  "role.pipeline.reconcile": async (project, changeId, request) => reconcileTaskRuns(project, { changeId, taskRunId: request.taskRunId }),
  "conversation.steer": async (project, changeId, request, live) => steerConversation(project, changeId, request.prompt, live, deps),
  "conversation.interrupt": async (project, changeId, request, live) => interruptConversation(project, changeId, request.prompt, live, deps),
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
  "spec-test.drift": async (project, changeId, request) => getSpecTestDriftReport(project, { changeId, worktreeId: request.worktreeId }),
  };
  return handlers;
}
