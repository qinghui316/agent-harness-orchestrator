import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Command } from "commander";
import { createProgram } from "../../src/cli/program.js";
import type { MaintenanceLedgerEntry, ManagedProject, RemoteLandingResult, RunMetadata, WorkflowRun } from "../../src/types/index.js";
import { ensureMaintenanceLedgerEntryForStoreArtifact, ensureMaintenancePolicyLedgerEntryForStoreArtifact } from "../../src/agent-task/ledger.js";
import { buildMaintenanceArtifactRefListForStores } from "../../src/agent-task/maintenance-artifact-store.js";
import {
  buildCanonicalPatchApplicationManifestArtifactRefs,
  buildCanonicalPatchApplicationReportArtifactRefs,
  buildCanonicalPatchApplicationResultArtifactRefs,
} from "../../src/agent-task/canonical-patch-application-artifact-refs.js";
import {
  buildCanonicalPatchAppliedOperationFromManifestOperation,
  buildCanonicalPatchApplicationReportOperationFromAppliedOperation,
  buildCanonicalPatchDerivedOperationId,
  copyCanonicalPatchAppliedOperationLineage,
  copyCanonicalPatchManifestOperationLineage,
  copyCanonicalPatchProposalOperationLineage,
} from "../../src/agent-task/canonical-patch-lineage.js";
import {
  renderCanonicalPatchAppliedOperationMarkdownDetails,
  renderCanonicalPatchManifestOperationMarkdownDetails,
  renderCanonicalPatchObservedOperationMarkdownDetails,
  renderCanonicalPatchProposalOperationMarkdownDetails,
} from "../../src/agent-task/canonical-patch-operation-markdown.js";
import { closeChange, createChange, getChangeStatus, getChangeStatusForChange } from "../../src/change/manager.js";
import { appendTopicThreadEntry, runWorkbenchWorkflowAction } from "../../src/workbench/chat.js";
import { getWorkbenchSchedulerClaimReconcilePlanProjection, getWorkbenchSchedulerClaimReservationProjection, getWorkbenchSchedulerContractProjection, getWorkbenchSchedulerDispatchDryRunProjection, getWorkbenchSchedulerRunProjection, getWorkbenchSchedulerWorkerReworkResultProjection, getWorkbenchSchedulerWorkerSessionPlanProjection, getWorkbenchSnapshot, getWorkbenchWorkflowGraphPlanProjection } from "../../src/workbench/manager.js";
import { getCodeStatus, listCodeRuns, showCodeRun, startCodeRun } from "../../src/code/manager.js";
import { applyResultToProject, applyWorktree, classifyApplyReadiness, discardWorktree, previewWorktreeApply } from "../../src/apply/manager.js";
import { applyIntegrationCheck, discardIntegrationCheck, findIntegrationCheckCandidate, listIntegrationChecks, readIntegrationCheck, runIntegrationCheck } from "../../src/integration-check/manager.js";
import { collectReadyTargets } from "../../src/integration-check/candidates.js";
import { runAggregateValidation } from "../../src/integration-check/aggregate-validation.js";
import { runAggregateAudit } from "../../src/integration-check/aggregate-audit.js";
import { runIntegrationFixAttempt } from "../../src/integration-check/fix-attempts.js";
import { prepareIntegrationCheckout } from "../../src/integration-check/patch-workspace.js";
import { prepareRemoteLandingReadiness, mergeRemoteLanding, listRemoteLandingResults } from "../../src/remote-landing/manager.js";
import { refreshRemoteLanding } from "../../src/remote-landing/readiness.js";
import { readRemoteLandingResult } from "../../src/remote-landing/repository.js";
import { preparePostMergeHandoff, syncLocalAfterMerge, listPostMergeHandoffs } from "../../src/post-merge/manager.js";
import { prepareLocalSync } from "../../src/post-merge/handoff.js";
import { cleanupRemoteBranchAfterMerge } from "../../src/post-merge/branch-cleanup.js";
import { refreshPrFeedback, startPrFeedbackReworkAttempt, listPrFeedbackSummaries } from "../../src/pr-feedback/manager.js";
import { classifyPrFeedbackSnapshotData } from "../../src/pr-feedback/snapshot.js";
import { recordReviewFeedbackUserContext } from "../../src/pr-feedback/rework.js";
import { preparePrReviewReadiness, submitPrForHumanReview, listPrReviewReadiness } from "../../src/pr-review/manager.js";
import { refreshPrReviewState } from "../../src/pr-review/readiness.js";
import { preparePrReviewReplyDraft } from "../../src/pr-review/replies.js";
import { findLandingCandidate, listLandingPackages, prepareLandingPackage, readLandingPackage, reviewLandingPackage } from "../../src/landing/manager.js";
import { createDraftPr, detectRemoteProviderCapability, findPrDraftPackageForLanding, listPrDraftPackages, preparePrDraftPackage, refreshPrDraftStatus, updateDraftPrFromLanding } from "../../src/pr-draft/manager.js";
import { latestLandingQueueSnapshot, listLandingQueueSnapshots, mergeNextLandingQueueCandidate, prepareLandingQueue, refreshLandingQueue } from "../../src/landing-queue/manager.js";
import { getSpecTestStatus, linkSpecTest } from "../../src/spec-test/manager.js";
import { getSpecTestDriftReport } from "../../src/spec-test/drift.js";
import { startSpecTestGenerationRun } from "../../src/spec-test/generate.js";
import { startSpecTestProposalRun } from "../../src/spec-test/proposal.js";
import { appendRunEvent, buildContextProjection, buildRunId, listRuns, readRun, startLocalCommandRun } from "../../src/run/manager.js";
import { getValidationStatus, listValidationSummaries, showValidation, startValidationRun } from "../../src/validation/manager.js";
import { getLatestValidationSummary, listValidationResults, readValidationResult } from "../../src/validation/artifacts.js";
import { acceptAudit, getAuditStatus, listAuditSummaries, showAudit, startAuditRun } from "../../src/audit/manager.js";
import { getLatestAuditSummary, listAuditResults, readAuditResult } from "../../src/audit/artifacts.js";
import { createWorktree as createWorktreeFacade, getWorktreeStatus as getWorktreeStatusFacade, listWorktreeStatuses as listWorktreeStatusesFacade, removeWorktree as removeWorktreeFacade } from "../../src/worktree/manager.js";
import { readTopicThreadLog } from "../../src/workbench/thread-log.js";
import { runWorkbenchWorkflowActionService } from "../../src/workbench/actions/service.js";
import { assertLatestWorkbenchActionTarget, assertPreparedWorkbenchActionTarget, assertWorkbenchActionChangeScope } from "../../src/workbench/actions/active-target.js";
import { assertWorkflowActionScope } from "../../src/workbench/actions/boundary.js";
import { assertLatestSchedulerArtifact } from "../../src/workflow-scheduler/guards.js";
import { dispatchWorkbenchWorkflowAction } from "../../src/workbench/actions/dispatcher.js";
import { buildWorkbenchActionHandlers } from "../../src/workbench/actions/handlers/index.js";
import { generatePlanningDraft } from "../../src/workbench/actions/handlers/planning.js";
import { interruptConversation, steerConversation, stopRunningPipeline } from "../../src/workbench/actions/handlers/control.js";
import { mergeRemoteLandingForAction, prepareLandingForAction, preparePrDraftForAction } from "../../src/workbench/actions/handlers/remote-handoff.js";
import { runCodexChat } from "../../src/workbench/codex-chat/bridge.js";
import { runMainAgentToolOrchestration } from "../../src/workbench/demand-workers/orchestration.js";
import { recordWorkbenchDecision } from "../../src/workbench/decisions.js";
import { emitAssistantEvent } from "../../src/workbench/live-events.js";
import { buildDeterministicPlanningBundle } from "../../src/workbench/planning/builders.js";
import { createLiveSink, readWorkbenchActionEvents } from "../../src/server/workbench/live.js";
import { getWorkbenchProjection } from "../../src/server/workbench/projections.js";
import { matchProjectWorkbenchRoute } from "../../src/server/workbench/routes.js";
import { assertCurrentWorkflowAction } from "../../src/server/workbench/action-revalidation.js";
import { executeWorkbenchAction as executeWorkbenchServerAction } from "../../src/server/workbench/actions.js";
import { approvedSchedulerWorkerPathClaimIntentIds, findNextSchedulerReservationIntentForWorkerPaths, schedulerIntegrationCandidateNeedsRefresh } from "../../src/scheduler-runtime/worker-path.js";
import { handleApi } from "../../src/server/workbench/api-router.js";
import { allowedActionIds } from "../../src/server/workbench/approval-actions.js";
import { handleDirectWorkbenchApi } from "../../src/server/workbench/direct-routes.js";
import { sendJson } from "../../src/server/workbench/http.js";
import { sendWorkbenchActionLive } from "../../src/server/workbench/live-actions.js";
import { buildNativeFolderDialogCommand } from "../../src/server/workbench/native-dialog.js";
import { handleProjectWorkbenchApi } from "../../src/server/workbench/project-routes.js";
import { serveStatic } from "../../src/server/workbench/static.js";
import { summarizeRunArtifacts } from "../../src/workbench/projections/artifact-preview.js";
import { findWorkbenchTopicPath } from "../../src/workbench/projections/typed-workflow.js";
import { buildConfirmationQueue, scopeConfirmationQueueItemActions } from "../../src/workbench/projections/read-model/confirmation-queue.js";
import { buildApprovalInbox } from "../../src/workbench/projections/read-model/approval-inbox.js";
import { buildMaintenanceSummary } from "../../src/workbench/projections/read-model/maintenance-summary.js";
import { latestByCreatedAt, latestByTimestamp, projectFields, sortByTimestampDesc } from "../../src/workbench/projections/read-model/projection-summary.js";
import { listWorkbenchTopicsFromMemory } from "../../src/workbench/projections/read-model/topics.js";
import { workpadNextActionToConfirmationItems } from "../../src/workbench/projections/read-model/confirmation/typed-workflow.js";
import { schedulerUserFacingActionLabel } from "../../src/workbench/projections/read-model/confirmation/scheduler-user-surface.js";
import { buildDemandAgentRunGraph, emptyAgentRunGraph } from "../../src/workbench/projections/read-model/run-graph.js";
import { buildThreadStream, isConcreteChangeFile } from "../../src/workbench/projections/read-model/thread-stream.js";
import { buildDecisionInspector } from "../../src/workbench/projections/read-model/decision-inspector.js";
import { readLatestPlanningBundleProjection } from "../../src/workbench/projections/read-model/lazy-projections.js";
import { buildResultReview } from "../../src/workbench/projections/read-model/result-review.js";
import { buildTaskGraph, buildTaskQueueSummary, emptyTaskGraph } from "../../src/workbench/projections/read-model/task-graph.js";
import { buildDiagnosticWorkpad, buildWorkbenchWorkpad } from "../../src/workbench/projections/read-model/workpad.js";
import {
  assertKnownTaskIds,
  requireSingleTaskId,
  requireTaskRunId,
  runCodeValidateAuditSequence,
  runTaskQueueSequence,
  runTaskRunCodeValidateAuditSequence,
  sourceRefreshReworkPrompt,
} from "../../src/workflow-runtime/code-workflow.js";
import { listTaskQueueItems as listTaskQueueItemsFacade, listTaskQueues as listTaskQueuesFacade, reconcileTaskQueues as reconcileTaskQueuesFacade, startOrResumeTaskQueue as startOrResumeTaskQueueFacade } from "../../src/task-queue/manager.js";
import { finishTaskRunFromWorkflowResult, listTaskRuns as listTaskRunsFacade, listWorkerLeases as listWorkerLeasesFacade, markTaskRunStarted, reconcileTaskRuns as reconcileTaskRunsFacade, startTaskRun } from "../../src/task-run/manager.js";
import { appendWorkflowTaskEvent, createWorkflowRunForTaskQueue, getLatestWorkflowRun, listWorkflowRuns, readWorkflowRun, readWorkflowRunEvents, summarizeWorkflowRun, syncWorkflowRunFromQueue, validateTaskQueueProposalStart } from "../../src/workflow-run/manager.js";
import { createTaskQueueRunFromProposal } from "../../src/task-queue/queue-creation.js";
import { readTaskQueueRun } from "../../src/task-queue/repository.js";
import { validateNewTaskQueueStart } from "../../src/task-queue/start-validation.js";
import { markTaskQueueRunning } from "../../src/task-queue/item-transitions.js";
import { claimNextDemandWorker as claimNextDemandWorkerFacade, enqueueDemandWorker as enqueueDemandWorkerFacade, reconcileDemandWorkers as reconcileDemandWorkersFacade } from "../../src/demand-worker/manager.js";
import { listDemandWorkers } from "../../src/demand-worker/repository.js";
import { getDemandWorkerSlot } from "../../src/demand-worker/slot-policy.js";
import { recordMainOrchestratorDecision } from "../../src/demand-worker/decisions.js";
import { compileWorkflowGraphPlan, hashArtifactRefs, readLatestTaskQueueProposal, renderWorkflowGraphPlanMarkdown } from "../../src/workflow-artifacts/manager.js";
import { compileSchedulerClaimReconcilePlan, compileSchedulerContract, compileSchedulerDispatchDryRun, compileSchedulerWorkerSessionPlan, prepareSchedulerRun, renderSchedulerClaimReconcilePlanMarkdown, renderSchedulerContractMarkdown, renderSchedulerDispatchDryRunMarkdown, renderSchedulerRunMarkdown, renderSchedulerWorkerSessionPlanMarkdown } from "../../src/workflow-scheduler/manager.js";
import { closeSchedulerRunBlockedOrExhausted, compileSchedulerIntegrationCandidate } from "../../src/scheduler-runtime/manager.js";
import { shouldAutoReworkTaskRun } from "../../src/workflow-runtime/kernel/bounded-rework.js";
import { emitValidationAssistantEvents } from "../../src/workflow-runtime/kernel/live-events.js";
import { findTaskQueueStageResumeCandidate } from "../../src/workflow-runtime/kernel/stage-resume-runner.js";
import { executeStartedTaskRunWorkflow } from "../../src/workflow-runtime/kernel/task-run-sequence.js";
import { startOrResumeWorkflowTaskQueue, validateWorkflowTaskQueueProposalStart } from "../../src/workflow-runtime/taskqueue.js";
import { fetchJson } from "../../src/web/src/api.js";
import { workflowActionLabel } from "../../src/web/src/action-labels.js";
import { userFacingText } from "../../src/web/src/formatters.js";
import { emptyParentAgentTranscript } from "../../src/web/src/liveTranscript.js";
import { MainConversationView, DecisionInspectorPane, WorkpadView } from "../../src/web/src/panels/WorkbenchPanels.js";
import { RunReplay } from "../../src/web/src/panels/workbench/RunReplayPanel.js";
import {
  ProjectConversationSidebar,
  appendProseBlock,
  blockFromAssistantEvent,
  threadItemFromTopicEntry,
} from "../../src/web/src/shell/WorkbenchShellParts.js";
import { workflowActionPayloadFromTaskAction } from "../../src/web/src/workflow-actions.js";

describe("Workbench module boundaries", () => {
  it("keeps legacy facades available while exposing split modules", () => {
    expect(typeof appendTopicThreadEntry).toBe("function");
    expect(typeof runWorkbenchWorkflowAction).toBe("function");
    expect(typeof createChange).toBe("function");
    expect(typeof getChangeStatus).toBe("function");
    expect(typeof getChangeStatusForChange).toBe("function");
    expect(typeof closeChange).toBe("function");
    expect(typeof getWorkbenchSnapshot).toBe("function");
    expect(typeof getWorkbenchWorkflowGraphPlanProjection).toBe("function");
    expect(typeof getWorkbenchSchedulerContractProjection).toBe("function");
    expect(typeof getWorkbenchSchedulerDispatchDryRunProjection).toBe("function");
    expect(typeof getWorkbenchSchedulerWorkerSessionPlanProjection).toBe("function");
    expect(typeof getWorkbenchSchedulerClaimReconcilePlanProjection).toBe("function");
    expect(typeof getWorkbenchSchedulerClaimReservationProjection).toBe("function");
    expect(typeof getWorkbenchSchedulerRunProjection).toBe("function");
    expect(typeof getWorkbenchSchedulerWorkerReworkResultProjection).toBe("function");
    expect(typeof createProgram).toBe("function");
    expect(typeof startCodeRun).toBe("function");
    expect(typeof getCodeStatus).toBe("function");
    expect(typeof listCodeRuns).toBe("function");
    expect(typeof showCodeRun).toBe("function");
    expect(typeof previewWorktreeApply).toBe("function");
    expect(typeof applyResultToProject).toBe("function");
    expect(typeof applyWorktree).toBe("function");
    expect(typeof discardWorktree).toBe("function");
    expect(typeof classifyApplyReadiness).toBe("function");
    expect(typeof findIntegrationCheckCandidate).toBe("function");
    expect(typeof runIntegrationCheck).toBe("function");
    expect(typeof applyIntegrationCheck).toBe("function");
    expect(typeof discardIntegrationCheck).toBe("function");
    expect(typeof listIntegrationChecks).toBe("function");
    expect(typeof readIntegrationCheck).toBe("function");
    expect(typeof collectReadyTargets).toBe("function");
    expect(typeof runAggregateValidation).toBe("function");
    expect(typeof runAggregateAudit).toBe("function");
    expect(typeof runIntegrationFixAttempt).toBe("function");
    expect(typeof prepareIntegrationCheckout).toBe("function");
    expect(typeof prepareRemoteLandingReadiness).toBe("function");
    expect(typeof refreshRemoteLanding).toBe("function");
    expect(typeof mergeRemoteLanding).toBe("function");
    expect(typeof listRemoteLandingResults).toBe("function");
    expect(typeof readRemoteLandingResult).toBe("function");
    expect(typeof preparePostMergeHandoff).toBe("function");
    expect(typeof prepareLocalSync).toBe("function");
    expect(typeof syncLocalAfterMerge).toBe("function");
    expect(typeof cleanupRemoteBranchAfterMerge).toBe("function");
    expect(typeof listPostMergeHandoffs).toBe("function");
    expect(typeof refreshPrFeedback).toBe("function");
    expect(typeof classifyPrFeedbackSnapshotData).toBe("function");
    expect(typeof startPrFeedbackReworkAttempt).toBe("function");
    expect(typeof recordReviewFeedbackUserContext).toBe("function");
    expect(typeof listPrFeedbackSummaries).toBe("function");
    expect(typeof preparePrReviewReadiness).toBe("function");
    expect(typeof refreshPrReviewState).toBe("function");
    expect(typeof submitPrForHumanReview).toBe("function");
    expect(typeof preparePrReviewReplyDraft).toBe("function");
    expect(typeof listPrReviewReadiness).toBe("function");
    expect(typeof findLandingCandidate).toBe("function");
    expect(typeof prepareLandingPackage).toBe("function");
    expect(typeof reviewLandingPackage).toBe("function");
    expect(typeof listLandingPackages).toBe("function");
    expect(typeof readLandingPackage).toBe("function");
    expect(typeof detectRemoteProviderCapability).toBe("function");
    expect(typeof preparePrDraftPackage).toBe("function");
    expect(typeof createDraftPr).toBe("function");
    expect(typeof refreshPrDraftStatus).toBe("function");
    expect(typeof updateDraftPrFromLanding).toBe("function");
    expect(typeof findPrDraftPackageForLanding).toBe("function");
    expect(typeof listPrDraftPackages).toBe("function");
    expect(typeof prepareLandingQueue).toBe("function");
    expect(typeof refreshLandingQueue).toBe("function");
    expect(typeof mergeNextLandingQueueCandidate).toBe("function");
    expect(typeof latestLandingQueueSnapshot).toBe("function");
    expect(typeof listLandingQueueSnapshots).toBe("function");
    expect(typeof getSpecTestStatus).toBe("function");
    expect(typeof linkSpecTest).toBe("function");
    expect(typeof getSpecTestDriftReport).toBe("function");
    expect(typeof startSpecTestProposalRun).toBe("function");
    expect(typeof startSpecTestGenerationRun).toBe("function");
    expect(typeof startLocalCommandRun).toBe("function");
    expect(typeof listRuns).toBe("function");
    expect(typeof readRun).toBe("function");
    expect(typeof appendRunEvent).toBe("function");
    expect(typeof buildRunId).toBe("function");
    expect(typeof buildContextProjection).toBe("function");
    expect(typeof startValidationRun).toBe("function");
    expect(typeof getValidationStatus).toBe("function");
    expect(typeof listValidationSummaries).toBe("function");
    expect(typeof showValidation).toBe("function");
    expect(typeof listValidationResults).toBe("function");
    expect(typeof readValidationResult).toBe("function");
    expect(typeof getLatestValidationSummary).toBe("function");
    expect(typeof startAuditRun).toBe("function");
    expect(typeof getAuditStatus).toBe("function");
    expect(typeof listAuditSummaries).toBe("function");
    expect(typeof showAudit).toBe("function");
    expect(typeof acceptAudit).toBe("function");
    expect(typeof listAuditResults).toBe("function");
    expect(typeof readAuditResult).toBe("function");
    expect(typeof getLatestAuditSummary).toBe("function");
    expect(typeof createWorktreeFacade).toBe("function");
    expect(typeof getWorktreeStatusFacade).toBe("function");
    expect(typeof listWorktreeStatusesFacade).toBe("function");
    expect(typeof removeWorktreeFacade).toBe("function");

    expect(typeof readTopicThreadLog).toBe("function");
    expect(typeof runWorkbenchWorkflowActionService).toBe("function");
    expect(typeof assertWorkbenchActionChangeScope).toBe("function");
    expect(typeof assertLatestWorkbenchActionTarget).toBe("function");
    expect(typeof assertWorkflowActionScope).toBe("function");
    expect(typeof dispatchWorkbenchWorkflowAction).toBe("function");
    expect(typeof buildWorkbenchActionHandlers).toBe("function");
    expect(typeof generatePlanningDraft).toBe("function");
    expect(typeof stopRunningPipeline).toBe("function");
    expect(typeof steerConversation).toBe("function");
    expect(typeof interruptConversation).toBe("function");
    expect(typeof prepareLandingForAction).toBe("function");
    expect(typeof preparePrDraftForAction).toBe("function");
    expect(typeof mergeRemoteLandingForAction).toBe("function");
    expect(typeof runCodexChat).toBe("function");
    expect(typeof runMainAgentToolOrchestration).toBe("function");
    expect(typeof recordWorkbenchDecision).toBe("function");
    expect(typeof emitAssistantEvent).toBe("function");
    expect(typeof buildDeterministicPlanningBundle).toBe("function");
    expect(typeof createLiveSink).toBe("function");
    expect(typeof readWorkbenchActionEvents).toBe("function");
    expect(typeof getWorkbenchProjection).toBe("function");
    expect(typeof matchProjectWorkbenchRoute).toBe("function");
    expect(typeof assertCurrentWorkflowAction).toBe("function");
    expect(typeof executeWorkbenchServerAction).toBe("function");
    expect(typeof handleApi).toBe("function");
    expect(allowedActionIds.has("change.close")).toBe(true);
    expect(typeof handleDirectWorkbenchApi).toBe("function");
    expect(typeof sendJson).toBe("function");
    expect(typeof sendWorkbenchActionLive).toBe("function");
    expect(typeof buildNativeFolderDialogCommand).toBe("function");
    expect(typeof handleProjectWorkbenchApi).toBe("function");
    expect(typeof serveStatic).toBe("function");
    expect(typeof summarizeRunArtifacts).toBe("function");
    expect(typeof buildConfirmationQueue).toBe("function");
    expect(typeof scopeConfirmationQueueItemActions).toBe("function");
    expect(typeof buildApprovalInbox).toBe("function");
    expect(typeof buildMaintenanceSummary).toBe("function");
    expect(typeof latestByCreatedAt).toBe("function");
    expect(typeof latestByTimestamp).toBe("function");
    expect(typeof sortByTimestampDesc).toBe("function");
    expect(typeof projectFields).toBe("function");
    expect(typeof listWorkbenchTopicsFromMemory).toBe("function");
    expect(typeof workpadNextActionToConfirmationItems).toBe("function");
    expect(typeof emptyAgentRunGraph).toBe("function");
    expect(typeof buildDemandAgentRunGraph).toBe("function");
    expect(typeof buildThreadStream).toBe("function");
    expect(typeof isConcreteChangeFile).toBe("function");
    expect(typeof buildDecisionInspector).toBe("function");
    expect(typeof readLatestPlanningBundleProjection).toBe("function");
    expect(typeof buildResultReview).toBe("function");
    expect(typeof emptyTaskGraph).toBe("function");
    expect(typeof buildTaskGraph).toBe("function");
    expect(typeof buildTaskQueueSummary).toBe("function");
    expect(typeof buildDiagnosticWorkpad).toBe("function");
    expect(typeof buildWorkbenchWorkpad).toBe("function");
    expect(typeof startOrResumeTaskQueueFacade).toBe("function");
    expect(typeof listTaskQueuesFacade).toBe("function");
    expect(typeof listTaskQueueItemsFacade).toBe("function");
    expect(typeof reconcileTaskQueuesFacade).toBe("function");
    expect(typeof startTaskRun).toBe("function");
    expect(typeof listTaskRunsFacade).toBe("function");
    expect(typeof listWorkerLeasesFacade).toBe("function");
    expect(typeof reconcileTaskRunsFacade).toBe("function");
    expect(typeof markTaskRunStarted).toBe("function");
    expect(typeof finishTaskRunFromWorkflowResult).toBe("function");
    expect(typeof validateTaskQueueProposalStart).toBe("function");
    expect(typeof createWorkflowRunForTaskQueue).toBe("function");
    expect(typeof readWorkflowRun).toBe("function");
    expect(typeof listWorkflowRuns).toBe("function");
    expect(typeof getLatestWorkflowRun).toBe("function");
    expect(typeof readWorkflowRunEvents).toBe("function");
    expect(typeof appendWorkflowTaskEvent).toBe("function");
    expect(typeof syncWorkflowRunFromQueue).toBe("function");
    expect(typeof summarizeWorkflowRun).toBe("function");
    expect(typeof validateNewTaskQueueStart).toBe("function");
    expect(typeof createTaskQueueRunFromProposal).toBe("function");
    expect(typeof readTaskQueueRun).toBe("function");
    expect(typeof markTaskQueueRunning).toBe("function");
    expect(typeof enqueueDemandWorkerFacade).toBe("function");
    expect(typeof claimNextDemandWorkerFacade).toBe("function");
    expect(typeof reconcileDemandWorkersFacade).toBe("function");
    expect(typeof listDemandWorkers).toBe("function");
    expect(typeof getDemandWorkerSlot).toBe("function");
    expect(typeof recordMainOrchestratorDecision).toBe("function");
    expect(typeof compileWorkflowGraphPlan).toBe("function");
    expect(typeof hashArtifactRefs).toBe("function");
    expect(typeof readLatestTaskQueueProposal).toBe("function");
    expect(typeof renderWorkflowGraphPlanMarkdown).toBe("function");
    expect(typeof compileSchedulerContract).toBe("function");
    expect(typeof renderSchedulerContractMarkdown).toBe("function");
    expect(typeof compileSchedulerDispatchDryRun).toBe("function");
    expect(typeof renderSchedulerDispatchDryRunMarkdown).toBe("function");
    expect(typeof compileSchedulerWorkerSessionPlan).toBe("function");
    expect(typeof renderSchedulerWorkerSessionPlanMarkdown).toBe("function");
    expect(typeof compileSchedulerClaimReconcilePlan).toBe("function");
    expect(typeof renderSchedulerClaimReconcilePlanMarkdown).toBe("function");
    expect(typeof prepareSchedulerRun).toBe("function");
    expect(typeof renderSchedulerRunMarkdown).toBe("function");
    expect(typeof compileSchedulerIntegrationCandidate).toBe("function");
    expect(typeof closeSchedulerRunBlockedOrExhausted).toBe("function");
    expect(typeof startOrResumeWorkflowTaskQueue).toBe("function");
    expect(typeof validateWorkflowTaskQueueProposalStart).toBe("function");
    expect(typeof runTaskQueueSequence).toBe("function");
    expect(typeof runTaskRunCodeValidateAuditSequence).toBe("function");
    expect(typeof runCodeValidateAuditSequence).toBe("function");
    expect(typeof sourceRefreshReworkPrompt).toBe("function");
    expect(typeof requireSingleTaskId).toBe("function");
    expect(typeof requireTaskRunId).toBe("function");
    expect(typeof assertKnownTaskIds).toBe("function");
    expect(typeof shouldAutoReworkTaskRun).toBe("function");
    expect(typeof emitValidationAssistantEvents).toBe("function");
    expect(typeof findTaskQueueStageResumeCandidate).toBe("function");
    expect(typeof executeStartedTaskRunWorkflow).toBe("function");
    expect(typeof fetchJson).toBe("function");
    expect(typeof MainConversationView).toBe("function");
    expect(typeof DecisionInspectorPane).toBe("function");
    expect(typeof WorkpadView).toBe("function");
    expect(typeof RunReplay).toBe("function");
    expect(typeof ProjectConversationSidebar).toBe("function");
    expect(typeof appendProseBlock).toBe("function");
    expect(typeof blockFromAssistantEvent).toBe("function");
    expect(typeof threadItemFromTopicEntry).toBe("function");
    expect(typeof workflowActionPayloadFromTaskAction).toBe("function");
    expect(emptyParentAgentTranscript().title).toBe("需求对话");
    expect(userFacingText("Task queue started")).toBe("本地顺序执行已开始");
    expect(workflowActionLabel("planning.workflowgraph.compile")).toBe("编译执行图");
  });

  it("keeps CLI command modules behind the createProgram facade", () => {
    const program = createProgram();
    expect(program.name()).toBe("aho");

    expect(findCommand(program, ["project", "add"]).description()).toBe("");
    expect(findCommand(program, ["harness", "init"]).opts()).toMatchObject({ memory: "repo-local" });
    expect(findCommand(program, ["workbench", "serve"]).opts()).toMatchObject({ host: "127.0.0.1", port: 4317 });
    expect(findCommand(program, ["change", "spec", "propose"]).options.map((option) => option.long)).toEqual(expect.arrayContaining(["--prompt", "--prompt-file", "--json"]));
    expect(findCommand(program, ["worktree", "apply"]).options.map((option) => option.long)).toEqual(expect.arrayContaining(["--commit", "--message", "--json"]));
    expect(findCommand(program, ["code", "run"]).options.map((option) => option.long)).toEqual(expect.arrayContaining(["--prompt", "--prompt-file", "--task", "--model", "--profile", "--json"]));
    expect(findCommand(program, ["spec-test", "generate"]).options.map((option) => option.long)).toEqual(expect.arrayContaining(["--ac", "--missing", "--prompt", "--json"]));
  });

  it("keeps legacy type barrel imports compile-compatible", () => {
    const compileOnly: {
      project?: ManagedProject;
      run?: RunMetadata;
      workflow?: WorkflowRun;
      remote?: RemoteLandingResult;
      maintenance?: MaintenanceLedgerEntry;
    } = {};
    expect(Object.keys(compileOnly)).toEqual([]);
  });

  it("resolves typed workflow topic paths outside the manager facade", () => {
    expect(findWorkbenchTopicPath([{ id: "change-1", name: "phase-x", path: "harness/changes/active/phase-x" }], "change-1")).toBe("harness/changes/active/phase-x");
    expect(findWorkbenchTopicPath([{ id: "change-1", name: "phase-x", path: "harness/changes/active/phase-x" }], "phase-x")).toBe("harness/changes/active/phase-x");
    expect(findWorkbenchTopicPath([{ id: "change-1", name: "phase-x", path: "harness/changes/active/phase-x" }], "missing")).toBeNull();
  });

  it("keeps split modules from depending on large compatibility facades", () => {
    const checks = [
      {
        roots: ["src/workbench/projections", "src/workbench/actions"],
        forbidden: [/from\s+["']\.\.\/manager\.js["']/, /from\s+["']\.\.\/chat\.js["']/],
      },
      {
        roots: ["src/workbench/actions/handlers"],
        forbidden: [
          /from\s+["'][^"']*\/chat\.js["']/,
          /from\s+["'][^"']*\/server\//,
          /from\s+["'][^"']*\/web\//,
          /from\s+["'][^"']*\/cli\//,
          /from\s+["'][^"']*\/projections\//,
        ],
      },
      {
        roots: ["src/workbench/projections/read-model"],
        forbidden: [
          /from\s+["']\.\.\/\.\.\/manager\.js["']/,
          /from\s+["']\.\.\/\.\.\/chat\.js["']/,
          /from\s+["']\.\.\/\.\.\/\.\.\/server\//,
          /from\s+["']\.\.\/\.\.\/\.\.\/web\//,
        ],
      },
      {
        roots: ["src/workbench/read-model-types.ts", "src/workbench/artifact-types.ts"],
        forbidden: [
          /from\s+["']\.\/projections\//,
          /from\s+["']\.\/manager\.js["']/,
          /from\s+["']\.\/chat\.js["']/,
          /from\s+["']\.\.\/server\//,
          /from\s+["']\.\.\/web\//,
        ],
      },
      {
        roots: ["src/server/workbench"],
        forbidden: [
          /from\s+["']\.\.\/workbench-server\.js["']/,
          /from\s+["']\.\.\/\.\.\/web\//,
          /from\s+["']\.\.\/\.\.\/cli\//,
          /from\s+["']\.\.\/\.\.\/workbench\/projections\/read-model\/implementation\.js["']/,
        ],
      },
      {
        roots: ["src/web/src/panels"],
        forbidden: [/from\s+["']\.\.\/App\.js["']/],
      },
      {
        roots: ["src/web/src/shell", "src/web/src/panels/workbench"],
        forbidden: [/from\s+["']\.\.\/App\.js["']/, /from\s+["']\.\.\/\.\.\/App\.js["']/],
      },
      {
        roots: ["src/workflow-runtime"],
        forbidden: [
          /from\s+["']\.\.\/server\//,
          /from\s+["']\.\.\/web\//,
          /from\s+["']\.\.\/workbench\/chat\.js["']/,
          /from\s+["']\.\.\/workbench\/manager\.js["']/,
        ],
      },
      {
        roots: [
          "src/workbench/codex-chat",
          "src/workbench/demand-workers",
          "src/workbench/planning",
          "src/workbench/topic-resolver.ts",
          "src/workbench/topic-runtime.ts",
          "src/workbench/topic-thread.ts",
          "src/workbench/decisions.ts",
          "src/workbench/live-events.ts",
        ],
        forbidden: [
          /from\s+["']\.\.?\/chat\.js["']/,
          /from\s+["']\.\.\/server\//,
          /from\s+["']\.\.\/web\//,
          /from\s+["']\.\/manager\.js["']/,
          /from\s+["']\.\/projections\//,
        ],
      },
      {
        roots: ["src/cli/commands"],
        forbidden: [/from\s+["']\.\.\/program\.js["']/],
      },
      {
        roots: ["src/agent-task"],
        forbidden: [
          /from\s+["']\.\/manager\.js["']/,
          /from\s+["']\.\.\/server\//,
          /from\s+["']\.\.\/web\//,
          /from\s+["']\.\.\/cli\//,
          /from\s+["']\.\.\/workbench\//,
        ],
      },
      {
        roots: [
          "src/change/close-gate.ts",
          "src/change/creation.ts",
          "src/change/guards.ts",
          "src/change/lifecycle.ts",
          "src/change/metadata.ts",
          "src/change/paths.ts",
          "src/change/repository.ts",
          "src/change/schemas.ts",
          "src/change/status.ts",
          "src/change/templates.ts",
          "src/change/types.ts",
          "src/change/utils.ts",
        ],
        forbidden: [
          /from\s+["']\.\/manager\.js["']/,
          /from\s+["']\.\.\/workbench\//,
          /from\s+["']\.\.\/server\//,
          /from\s+["']\.\.\/web\//,
          /from\s+["']\.\.\/cli\//,
        ],
      },
      {
        roots: ["src/change/proposals"],
        forbidden: [
          /from\s+["']\.\.\/proposals\.js["']/,
          /from\s+["']\.\.\/\.\.\/cli\//,
          /from\s+["']\.\.\/\.\.\/server\//,
          /from\s+["']\.\.\/\.\.\/web\//,
          /from\s+["']\.\.\/\.\.\/workbench\//,
        ],
      },
      {
        roots: ["src/code"],
        forbidden: [
          /from\s+["']\.\/manager\.js["']/,
          /from\s+["']\.\.\/cli\//,
          /from\s+["']\.\.\/workbench\//,
          /from\s+["']\.\.\/server\//,
          /from\s+["']\.\.\/web\//,
        ],
      },
      {
        roots: ["src/integration-check"],
        forbidden: [
          /from\s+["']\.\/manager\.js["']/,
          /from\s+["']\.\.\/workbench\//,
          /from\s+["']\.\.\/server\//,
          /from\s+["']\.\.\/web\//,
          /from\s+["']\.\.\/cli\//,
        ],
      },
      {
        roots: ["src/remote-landing", "src/post-merge", "src/pr-feedback", "src/pr-review"],
        forbidden: [
          /from\s+["']\.\/manager\.js["']/,
          /from\s+["']\.\.\/workbench\//,
          /from\s+["']\.\.\/server\//,
          /from\s+["']\.\.\/web\//,
          /from\s+["']\.\.\/cli\//,
        ],
      },
      {
        roots: ["src/apply", "src/landing", "src/pr-draft", "src/landing-queue"],
        forbidden: [
          /from\s+["']\.\/manager\.js["']/,
          /from\s+["']\.\.\/workbench\//,
          /from\s+["']\.\.\/server\//,
          /from\s+["']\.\.\/web\//,
          /from\s+["']\.\.\/cli\//,
        ],
      },
      {
        roots: ["src/spec-test/core"],
        forbidden: [
          /from\s+["']\.\.\/manager\.js["']/,
          /from\s+["']\.\.\/proposal\.js["']/,
          /from\s+["']\.\.\/generate\.js["']/,
          /from\s+["']\.\.\/drift\.js["']/,
          /from\s+["']\.\.\/\.\.\/cli\//,
          /from\s+["']\.\.\/\.\.\/workbench\//,
          /from\s+["']\.\.\/\.\.\/server\//,
          /from\s+["']\.\.\/\.\.\/web\//,
        ],
      },
      {
        roots: ["src/task-queue"],
        forbidden: [
          /from\s+["']\.\/manager\.js["']/,
          /from\s+["']\.\.\/workbench\//,
          /from\s+["']\.\.\/server\//,
          /from\s+["']\.\.\/web\//,
          /from\s+["']\.\.\/cli\//,
        ],
      },
      {
        roots: ["src/demand-worker"],
        forbidden: [
          /from\s+["']\.\/manager\.js["']/,
          /from\s+["']\.\.\/workbench\//,
          /from\s+["']\.\.\/server\//,
          /from\s+["']\.\.\/web\//,
          /from\s+["']\.\.\/cli\//,
        ],
      },
      {
        roots: ["src/task-run"],
        forbidden: [
          /from\s+["']\.\/manager\.js["']/,
          /from\s+["']\.\.\/workbench\//,
          /from\s+["']\.\.\/server\//,
          /from\s+["']\.\.\/web\//,
          /from\s+["']\.\.\/cli\//,
        ],
      },
      {
        roots: ["src/workflow-artifacts"],
        forbidden: [
          /from\s+["']\.\/manager\.js["']/,
          /from\s+["']\.\.\/workbench\//,
          /from\s+["']\.\.\/server\//,
          /from\s+["']\.\.\/web\//,
          /from\s+["']\.\.\/cli\//,
        ],
      },
      {
        roots: ["src/workflow-run"],
        forbidden: [
          /from\s+["']\.\/manager\.js["']/,
          /from\s+["']\.\.\/workbench\//,
          /from\s+["']\.\.\/server\//,
          /from\s+["']\.\.\/web\//,
          /from\s+["']\.\.\/cli\//,
        ],
      },
      {
        roots: ["src/run"],
        forbidden: [
          /from\s+["']\.\/manager\.js["']/,
          /from\s+["']\.\.\/workbench\//,
          /from\s+["']\.\.\/server\//,
          /from\s+["']\.\.\/web\//,
          /from\s+["']\.\.\/cli\//,
        ],
      },
      {
        roots: ["src/worktree"],
        forbidden: [
          /from\s+["']\.\/manager\.js["']/,
          /from\s+["']\.\.\/workbench\//,
          /from\s+["']\.\.\/server\//,
          /from\s+["']\.\.\/web\//,
          /from\s+["']\.\.\/cli\//,
        ],
      },
      {
        roots: ["src/runtime-continuity"],
        forbidden: [
          /from\s+["'][^"']*\/manager\.js["']/,
          /from\s+["']\.\.\/workbench\//,
          /from\s+["']\.\.\/server\//,
          /from\s+["']\.\.\/web\//,
          /from\s+["']\.\.\/cli\//,
        ],
      },
      {
        roots: ["src/validation", "src/audit"],
        forbidden: [
          /from\s+["'][^"']*manager\.js["']/,
          /from\s+["']\.\.\/workbench\//,
          /from\s+["']\.\.\/server\//,
          /from\s+["']\.\.\/web\//,
          /from\s+["']\.\.\/cli\//,
        ],
      },
      {
        roots: [
          "src/types/change-ecl.ts",
          "src/types/maintenance.ts",
          "src/types/pr-remote-landing.ts",
          "src/types/project-memory.ts",
          "src/types/proposals.ts",
          "src/types/run-worktree.ts",
          "src/types/spec-test.ts",
          "src/types/task-agent-workflow.ts",
        ],
        forbidden: [
          /from\s+["']\.\.\/cli\//,
          /from\s+["']\.\.\/server\//,
          /from\s+["']\.\.\/web\//,
          /from\s+["']\.\.\/workbench\//,
          /from\s+["']\.\.\/workflow-runtime\//,
          /from\s+["']\.\.\/code\//,
          /from\s+["']\.\.\/agent\//,
        ],
      },
    ];
    const offenders = checks.flatMap((check) => listSourceFiles(check.roots)
      .flatMap((file) => check.forbidden.some((pattern) => pattern.test(readFileSync(file, "utf8"))) ? [file] : []));
    expect(offenders).toEqual([]);
  });

  it("keeps workbench chat as a conversation/action facade with owned action handlers", () => {
    const chat = readFileSync("src/workbench/chat.ts", "utf8");
    expect(chat).toContain('from "./actions/handlers/index.js"');
    expect(chat).toContain("buildWorkbenchActionHandlers({");
    expect(chat).not.toMatch(/const workflowActionHandlers:\s*WorkbenchActionHandlerMap/);
    expect(chat).not.toMatch(/async function prepareLandingForAction/);
    expect(chat).not.toMatch(/async function preparePrDraftForAction/);
    expect(chat).not.toMatch(/async function mergeRemoteLandingForAction/);
    expect(chat).not.toMatch(/async function stopRunningPipeline/);
    expect(chat).not.toMatch(/async function steerConversation/);
    expect(chat).not.toMatch(/async function interruptConversation/);

    const handlerIndex = readFileSync("src/workbench/actions/handlers/index.ts", "utf8");
    expect(handlerIndex).toContain("export function buildWorkbenchActionHandlers");
    expect(handlerIndex).toContain('"chat.ask"');
    expect(handlerIndex).toContain("deps.postTopicMessage(project, changeId, request.prompt, live)");
    expect(handlerIndex).toContain('from "./remote-handoff.js"');
    expect(handlerIndex).toContain('from "./control.js"');

    const remoteHandoff = readFileSync("src/workbench/actions/handlers/remote-handoff.ts", "utf8");
    expect(remoteHandoff).toContain("export async function prepareLandingForAction");
    expect(remoteHandoff).toContain("export async function createPrDraftForAction");
    expect(remoteHandoff).toContain("export async function mergeRemoteLandingForAction");

    const control = readFileSync("src/workbench/actions/handlers/control.ts", "utf8");
    expect(control).toContain("export async function stopRunningPipeline");
    expect(control).toContain("export async function steerConversation");
    expect(control).toContain("export async function interruptConversation");
  });

  it("keeps scheduler user surface and handler glue in owned modules", () => {
    const handlerIndex = readFileSync("src/workbench/actions/handlers/index.ts", "utf8");
    const schedulerHandler = readFileSync("src/workbench/actions/handlers/scheduler.ts", "utf8");
    const schedulerSurface = readFileSync("src/workbench/projections/read-model/confirmation/scheduler-user-surface.ts", "utf8");
    const webSchedulerLabels = readFileSync("src/web/src/scheduler-action-labels.ts", "utf8");

    expect(handlerIndex).toContain('from "./scheduler.js"');
    expect(handlerIndex).not.toContain('"planning.scheduler.worker.start-first":');
    expect(handlerIndex).not.toContain('"planning.scheduler.worker.start-next":');
    expect(schedulerHandler).toContain("buildSchedulerActionHandlers");
    for (const source of [schedulerHandler, schedulerSurface, webSchedulerLabels]) {
      expect(source).not.toMatch(/from\s+["'].*chat\.js["']/);
      expect(source).not.toMatch(/from\s+["'].*workbench-server\.js["']/);
      expect(source).not.toMatch(/from\s+["'].*server\/workbench/);
      expect(source).not.toMatch(/from\s+["'].*cli\/program\.js["']/);
    }

    expect(schedulerUserFacingActionLabel("planning.scheduler.worker.start-first")).toBe("继续执行下一个任务");
    expect(schedulerUserFacingActionLabel("planning.scheduler.worker.validate-first")).toBe("检查当前结果");
    expect(schedulerUserFacingActionLabel("planning.scheduler.worker.rework-plan.compile")).toBe("处理当前阻塞");
    expect(schedulerUserFacingActionLabel("planning.scheduler.integration-check.run")).toBe("检查组合结果");
    expect(workflowActionLabel("planning.scheduler.worker.start-next")).toBe("继续执行下一个任务");
    expect(workflowActionLabel("planning.scheduler.run.close-blocked")).toBe("标记无法继续");
  });

  it("keeps goal-loop decision logic in an owned non-executing module", () => {
    const manager = readFileSync("src/goal-loop/manager.ts", "utf8");
    expect(manager).toContain('export * from "./compiler.js";');
    expect(manager).toContain('export * from "./repository.js";');
    expect(manager).toContain('export * from "./main-agent-context.js";');
    expect(manager).toContain('export * from "./controller.js";');

    for (const file of ["compiler.ts", "controller.ts", "repository.ts", "rendering.ts", "schemas.ts", "types.ts", "paths.ts", "main-agent-context.ts"]) {
      const source = readFileSync(`src/goal-loop/${file}`, "utf8");
      expect(source).not.toMatch(/from\s+["'].*workbench/);
      expect(source).not.toMatch(/from\s+["'].*server/);
      expect(source).not.toMatch(/from\s+["'].*web/);
      expect(source).not.toMatch(/from\s+["'].*cli/);
      expect(source).not.toContain("startFirstSchedulerCoderWorker");
      expect(source).not.toContain("startNextSchedulerCoderWorker");
      expect(source).not.toContain("runIntegrationCheck");
      expect(source).not.toContain("applyIntegrationCheck");
      expect(source).not.toContain("closeChange");
      expect(source).not.toContain("startCodeRun");
    }

    const chatBridge = readFileSync("src/workbench/codex-chat/bridge.ts", "utf8");
    const chatContext = readFileSync("src/workbench/codex-chat/context.ts", "utf8");
    const chatGoalLoopContext = readFileSync("src/workbench/codex-chat/goal-loop-context.ts", "utf8");
    const handlerIndex = readFileSync("src/workbench/actions/handlers/index.ts", "utf8");
    const handler = readFileSync("src/workbench/actions/handlers/goal-loop.ts", "utf8");
    const confirmationQueue = readFileSync("src/workbench/projections/read-model/confirmation-queue.ts", "utf8");
    const confirmation = readFileSync("src/workbench/projections/read-model/confirmation/goal-loop.ts", "utf8");
    const assistedConfirmation = readFileSync("src/workbench/actions/goal-loop-gate-confirmation.ts", "utf8");
    const parity = readFileSync("src/workbench/projections/read-model/goal-loop-parity.ts", "utf8");
    const projection = readFileSync("src/workbench/projections/read-model/goal-loop.ts", "utf8");
    expect(handlerIndex).toContain('from "./goal-loop.js"');
    expect(handlerIndex).not.toContain('"planning.goal-loop.evaluate":');
    expect(handler).toContain("buildGoalLoopActionHandlers");
    expect(handler).toContain("compileGoalLoopEvaluation");
    expect(handler).toContain("recordGoalLoopFeedback");
    expect(handler).toContain("compileGoalLoopGateReadinessPreflight");
    expect(handler).toContain("goalLoopContinuationBrief");
    expect(readFileSync("src/goal-loop/types.ts", "utf8")).toContain("GoalLoopContinuationBrief");
    expect(readFileSync("src/goal-loop/types.ts", "utf8")).toContain("GoalLoopNextStepPacket");
    expect(readFileSync("src/goal-loop/types.ts", "utf8")).toContain("GoalLoopFeedback");
    expect(readFileSync("src/goal-loop/types.ts", "utf8")).toContain("GoalLoopControllerPolicy");
    expect(readFileSync("src/goal-loop/types.ts", "utf8")).toContain("GoalLoopGateReadinessPreflight");
    expect(readFileSync("src/goal-loop/repository.ts", "utf8")).toContain("writeGoalLoopContinuationBrief");
    expect(readFileSync("src/goal-loop/repository.ts", "utf8")).toContain("writeGoalLoopNextStepPacket");
    expect(readFileSync("src/goal-loop/repository.ts", "utf8")).toContain("writeGoalLoopFeedback");
    expect(readFileSync("src/goal-loop/repository.ts", "utf8")).toContain("writeGoalLoopControllerPolicy");
    expect(readFileSync("src/goal-loop/repository.ts", "utf8")).toContain("writeGoalLoopGateReadinessPreflight");
    expect(readFileSync("src/goal-loop/rendering.ts", "utf8")).toContain("renderGoalLoopContinuationBriefMarkdown");
    expect(readFileSync("src/goal-loop/rendering.ts", "utf8")).toContain("renderGoalLoopNextStepPacketMarkdown");
    expect(readFileSync("src/goal-loop/rendering.ts", "utf8")).toContain("renderGoalLoopFeedbackMarkdown");
    expect(readFileSync("src/goal-loop/rendering.ts", "utf8")).toContain("renderGoalLoopControllerPolicyMarkdown");
    expect(readFileSync("src/goal-loop/rendering.ts", "utf8")).toContain("renderGoalLoopGateReadinessPreflightMarkdown");
    expect(readFileSync("src/goal-loop/feedback.ts", "utf8")).toContain("recordGoalLoopFeedback");
    expect(readFileSync("src/goal-loop/controller.ts", "utf8")).toContain("compileGoalLoopControllerPolicy");
    expect(readFileSync("src/goal-loop/controller.ts", "utf8")).toContain("non-executing-controller-policy-evidence");
    expect(readFileSync("src/goal-loop/controller.ts", "utf8")).not.toContain("executeWorkbenchAction");
    const gateReadiness = readFileSync("src/goal-loop/gate-readiness.ts", "utf8");
    expect(gateReadiness).toContain("compileGoalLoopGateReadinessPreflight");
    expect(gateReadiness).toContain("non-executing-concrete-gate-readiness-preflight-evidence");
    expect(gateReadiness).not.toContain("executeWorkbenchAction");
    expect(gateReadiness).not.toContain("src/workbench");
    expect(gateReadiness).not.toContain("src/server");
    expect(gateReadiness).not.toContain("src/web");
    expect(readFileSync("src/goal-loop/compiler.ts", "utf8")).toContain("compileGoalLoopContinuationBrief");
    expect(readFileSync("src/goal-loop/compiler.ts", "utf8")).toContain("compileGoalLoopNextStepPacket");
    expect(readFileSync("src/goal-loop/compiler.ts", "utf8")).toContain("readLatestGoalLoopFeedback");
    expect(readFileSync("src/goal-loop/compiler.ts", "utf8")).not.toContain("start_task");
    expect(readFileSync("src/goal-loop/compiler.ts", "utf8")).not.toContain("continuation_lock");
    expect(readFileSync("src/goal-loop/main-agent-context.ts", "utf8")).toContain("buildGoalLoopMainAgentContextSection");
    expect(readFileSync("src/goal-loop/main-agent-context.ts", "utf8")).toContain("Goal Loop Next-Step Packet");
    expect(chatContext).toContain("buildVisibleGoalLoopMainAgentContextSection");
    expect(chatContext).toContain("buildChatContext");
    expect(chatContext).toContain("buildOrchestratorContext");
    expect(chatGoalLoopContext).toContain("buildGoalLoopMainAgentContextSection");
    expect(chatGoalLoopContext).toContain("getWorkbenchWorkpadProjection");
    expect(chatGoalLoopContext).not.toContain("executeWorkbenchAction");
    expect(chatGoalLoopContext).not.toContain("compileGoalLoopDecision");
    expect(chatGoalLoopContext).not.toContain("compileGoalLoopEvaluation");
    expect(chatBridge).toContain("buildChatContext");
    expect(chatBridge).not.toContain("readLatestGoalLoopNextStepPacket");
    expect(chatBridge).not.toContain("compileGoalLoopNextStepPacket");
    expect(confirmationQueue).toContain('from "./confirmation/goal-loop.js"');
    expect(confirmation).toContain("goalLoopEvaluationQueueItem");
    expect(confirmation).toContain('"planning.goal-loop.evaluate"');
    expect(confirmation).not.toContain("compileGoalLoopDecision");
    expect(confirmation).not.toContain("compileGoalLoopEvaluation");
    expect(confirmation).not.toContain("recommendedAction");
    expect(confirmation).not.toContain("GoalLoopNextStepPacket");
    expect(confirmation).not.toContain("planning.scheduler.");
    expect(assistedConfirmation).toContain("assertGoalLoopAssistedConcreteGateConfirmation");
    expect(assistedConfirmation).toContain("readLatestGoalLoopGateReadinessPreflight");
    expect(assistedConfirmation).not.toContain("dispatchWorkbenchWorkflowAction");
    expect(assistedConfirmation).not.toContain("executeWorkbenchAction");
    expect(assistedConfirmation).not.toContain("src/server");
    expect(assistedConfirmation).not.toContain("src/web");
    expect(assistedConfirmation).not.toContain("src/cli");
    expect(parity).toContain("assessGoalLoopSummaryCurrentGateParity");
    expect(parity).not.toContain("compileGoalLoopDecision");
    expect(parity).not.toContain("compileGoalLoopEvaluation");
    expect(parity).not.toContain("executeWorkbenchAction");
    expect(parity).not.toContain("startCodeRun");
    expect(projection).toContain("readLatestGoalLoopContinuationBrief");
    expect(projection).toContain("readLatestGoalLoopNextStepPacket");
    expect(projection).toContain("WorkbenchGoalLoopSummary");
    expect(projection).not.toContain("compileGoalLoopDecision");
    expect(projection).not.toContain("compileGoalLoopEvaluation");
    expect(projection).not.toContain("compileGoalLoopNextStepPacket");
    expect(projection).not.toContain("executeWorkbenchAction");
    expect(projection).not.toContain("startCodeRun");
  });

  it("keeps run manager as a compatibility facade with owned evidence modules", () => {
    const facade = readFileSync("src/run/manager.ts", "utf8");
    expect(facade).toContain('export { startLocalCommandRun } from "./local-command-runner.js";');
    expect(facade).toContain('export { listRuns, readRun } from "./repository.js";');
    expect(facade).toContain('export { appendRunEvent } from "./events.js";');
    expect(facade).toContain('export { buildRunId } from "./run-id.js";');
    expect(facade).toContain('export { buildContextProjection } from "./context-projection.js";');
    expect(facade).not.toMatch(/async function startLocalCommandRun/);
    expect(facade).not.toMatch(/runMetadataSchema\s*=\s*z\.object/);
    expect(facade).not.toMatch(/executeProcessStreaming/);

    const codex = readFileSync("src/run/codex.ts", "utf8");
    expect(codex).not.toContain('from "./manager.js"');
    expect(codex).toContain('from "./context-projection.js"');
    expect(codex).toContain('from "./events.js"');
    expect(codex).toContain('from "./run-id.js"');

    const localCommandRunner = readFileSync("src/run/local-command-runner.ts", "utf8");
    expect(localCommandRunner).toContain('from "./context-projection.js"');
    expect(localCommandRunner).toContain('from "./events.js"');
    expect(localCommandRunner).toContain('from "./paths.js"');
    expect(localCommandRunner).toContain('from "./run-id.js"');
  });

  it("keeps validation and audit managers as compatibility facades with scoped evidence modules", () => {
    const validationFacade = readFileSync("src/validation/manager.ts", "utf8");
    expect(validationFacade).toContain('from "./service.js"');
    expect(validationFacade).not.toMatch(/async function startValidationRun/);
    expect(validationFacade).not.toMatch(/validationResultSchema\s*=\s*z\.object/);
    expect(validationFacade).not.toMatch(/executeProcessStreaming/);

    const validationArtifacts = readFileSync("src/validation/artifacts.ts", "utf8");
    expect(validationArtifacts).toContain('export * from "./schemas.js";');
    expect(validationArtifacts).toContain('export * from "./repository.js";');
    const validationRepository = readFileSync("src/validation/repository.ts", "utf8");
    expect(validationRepository).toContain("assertValidationScope");
    expect(validationRepository).not.toContain('from "./manager.js"');

    const auditFacade = readFileSync("src/audit/manager.ts", "utf8");
    expect(auditFacade).toContain('from "./service.js"');
    expect(auditFacade).toContain('from "./acceptance.js"');
    expect(auditFacade).not.toMatch(/async function startAuditRun/);
    expect(auditFacade).not.toMatch(/auditResultSchema\s*=\s*z\.object/);
    expect(auditFacade).not.toMatch(/executeProcessStreaming/);

    const auditArtifacts = readFileSync("src/audit/artifacts.ts", "utf8");
    expect(auditArtifacts).toContain('export * from "./schemas.js";');
    expect(auditArtifacts).toContain('export * from "./repository.js";');
    const auditRepository = readFileSync("src/audit/repository.ts", "utf8");
    expect(auditRepository).toContain("assertAuditScope");
    expect(auditRepository).not.toContain('from "./manager.js"');
    const auditAcceptance = readFileSync("src/audit/acceptance.ts", "utf8");
    expect(auditAcceptance).toContain("readValidationResult");
    expect(auditAcceptance).not.toContain('from "./manager.js"');
  });

  it("keeps worktree manager as a compatibility facade with scoped metadata modules", () => {
    const facade = readFileSync("src/worktree/manager.ts", "utf8");
    expect(facade).toContain('export { createWorktree } from "./creation.js";');
    expect(facade).toContain('export { listWorktreeMetadata } from "./repository.js";');
    expect(facade).toContain('export { getWorktreeStatus, listWorktreeStatuses, listWorktreesForChange } from "./status.js";');
    expect(facade).toContain('export { markWorktreeApplied, removeWorktree } from "./lifecycle.js";');
    expect(facade).not.toMatch(/worktreeMetadataSchema\s*=\s*z\.object/);
    expect(facade).not.toMatch(/async function createWorktree/);
    expect(facade).not.toMatch(/async function readWorktreeMetadata/);

    const repository = readFileSync("src/worktree/repository.ts", "utf8");
    expect(repository).toContain("assertWorktreeMetadataScope");
    expect(repository).toContain("tryReadWorktreeMetadata");

    const guards = readFileSync("src/worktree/guards.ts", "utf8");
    expect(guards).toContain("Worktree metadata id mismatch");
    expect(guards).toContain("Worktree metadata project mismatch");
    expect(guards).toContain("outside expected root");
  });

  it("keeps change proposals as a compatibility facade", () => {
    const facade = readFileSync("src/change/proposals.ts", "utf8");
    expect(facade).toContain('from "./proposals/service.js"');
    expect(facade).toContain('from "./proposals/acceptance.js"');
    expect(facade).toContain('from "./proposals/parser-renderer.js"');
    expect(facade).not.toMatch(/function startSpecProposalRun/);
    expect(facade).not.toMatch(/function acceptPlanProposal/);
    expect(facade).not.toMatch(/detectCodexCapabilities/);
  });

  it("keeps change manager as a compatibility facade with scoped metadata guards", () => {
    const facade = readFileSync("src/change/manager.ts", "utf8");
    expect(facade).toContain('export * from "./metadata.js";');
    expect(facade).toContain('export * from "./creation.js";');
    expect(facade).toContain('export * from "./status.js";');
    expect(facade).toContain('export * from "./lifecycle.js";');
    expect(facade).not.toMatch(/async function createChange/);
    expect(facade).not.toMatch(/async function getChangeStatus/);
    expect(facade).not.toMatch(/changeMetadataSchema/);

    const metadata = readFileSync("src/change/metadata.ts", "utf8");
    expect(metadata).toContain("Change metadata id mismatch");
    expect(metadata).toContain("archivePath mismatch");

    const status = readFileSync("src/change/status.ts", "utf8");
    expect(status).toContain('readScopedChangeMetadata(memory, active, "active")');
    expect(status).toContain("const change = scoped.metadata");
  });

  it("keeps code manager as a compatibility facade with scoped app-server role metadata", () => {
    const facade = readFileSync("src/code/manager.ts", "utf8");
    expect(facade).toContain('from "./execution-gate.js"');
    expect(facade).toContain('from "./codex-app-server-runner.js"');
    expect(facade).toContain('from "./codex-exec-runner.js"');
    expect(facade).toContain('from "./status.js"');
    expect(facade).not.toMatch(/runCodexAppServerTurn/);
    expect(facade).not.toMatch(/executeProcessStreaming/);
    expect(facade).not.toMatch(/createCodexJsonlStreamParser/);

    const appServerRunner = readFileSync("src/code/codex-app-server-runner.ts", "utf8");
    expect(appServerRunner).toContain("roleId: input.roleId");
    expect(appServerRunner).not.toContain('roleId: "coder-agent"');
  });

  it("keeps integration-check manager as a compatibility facade", () => {
    const facade = readFileSync("src/integration-check/manager.ts", "utf8");
    expect(facade).toContain('from "./service.js"');
    expect(facade).toContain('from "./apply-discard.js"');
    expect(facade).toContain('from "./repository.js"');
    expect(facade).toContain('from "./candidates.js"');
    expect(facade).not.toMatch(/async function runIntegrationCheck/);
    expect(facade).not.toMatch(/async function applyIntegrationCheck/);
    expect(facade).not.toMatch(/async function collectReadyTargets/);
    expect(facade).not.toMatch(/async function runAggregateValidation/);
  });

  it("keeps remote handoff managers as compatibility facades", () => {
    const remoteLanding = readFileSync("src/remote-landing/manager.ts", "utf8");
    expect(remoteLanding).toContain('from "./readiness.js"');
    expect(remoteLanding).toContain('from "./merge.js"');
    expect(remoteLanding).toContain('from "./repository.js"');
    expect(remoteLanding).not.toMatch(/async function prepareRemoteLandingReadiness/);
    expect(remoteLanding).not.toMatch(/async function mergeRemoteLanding/);

    const postMerge = readFileSync("src/post-merge/manager.ts", "utf8");
    expect(postMerge).toContain('from "./handoff.js"');
    expect(postMerge).toContain('from "./local-sync.js"');
    expect(postMerge).toContain('from "./branch-cleanup.js"');
    expect(postMerge).toContain('from "./repository.js"');
    expect(postMerge).not.toMatch(/async function preparePostMergeHandoff/);
    expect(postMerge).not.toMatch(/async function syncLocalAfterMerge/);

    const prFeedback = readFileSync("src/pr-feedback/manager.ts", "utf8");
    expect(prFeedback).toContain('from "./snapshot.js"');
    expect(prFeedback).toContain('from "./rework.js"');
    expect(prFeedback).toContain('from "./draft-update.js"');
    expect(prFeedback).toContain('from "./repository.js"');
    expect(prFeedback).not.toMatch(/async function refreshPrFeedback/);
    expect(prFeedback).not.toMatch(/async function startPrFeedbackReworkAttempt/);

    const prReview = readFileSync("src/pr-review/manager.ts", "utf8");
    expect(prReview).toContain('from "./readiness.js"');
    expect(prReview).toContain('from "./handoff.js"');
    expect(prReview).toContain('from "./replies.js"');
    expect(prReview).toContain('from "./repository.js"');
    expect(prReview).not.toMatch(/async function preparePrReviewReadiness/);
    expect(prReview).not.toMatch(/async function submitPrForHumanReview/);
  });

  it("keeps apply, landing, PR draft, and landing queue managers as compatibility facades", () => {
    const apply = readFileSync("src/apply/manager.ts", "utf8");
    expect(apply).toContain('from "./preview.js"');
    expect(apply).toContain('from "./apply-discard.js"');
    expect(apply).toContain('from "./gate.js"');
    expect(apply).not.toMatch(/async function previewWorktreeApply/);
    expect(apply).not.toMatch(/async function applyWorktree/);

    const landing = readFileSync("src/landing/manager.ts", "utf8");
    expect(landing).toContain('from "./candidates.js"');
    expect(landing).toContain('from "./service.js"');
    expect(landing).toContain('from "./repository.js"');
    expect(landing).not.toMatch(/async function prepareLandingPackage/);
    expect(landing).not.toMatch(/async function reviewLandingPackage/);

    const prDraft = readFileSync("src/pr-draft/manager.ts", "utf8");
    expect(prDraft).toContain('from "./provider.js"');
    expect(prDraft).toContain('from "./repository.js"');
    expect(prDraft).toContain('from "./service.js"');
    expect(prDraft).not.toMatch(/async function createDraftPr/);
    expect(prDraft).not.toMatch(/async function preparePrDraftPackage/);

    const landingQueue = readFileSync("src/landing-queue/manager.ts", "utf8");
    expect(landingQueue).toContain('from "./service.js"');
    expect(landingQueue).toContain('from "./merge-next.js"');
    expect(landingQueue).toContain('from "./repository.js"');
    expect(landingQueue).not.toMatch(/async function prepareLandingQueue/);
    expect(landingQueue).not.toMatch(/async function mergeNextLandingQueueCandidate/);
  });

  it("keeps spec-test facades thin and scoped to the selected demand", () => {
    expect(readFileSync("src/spec-test/manager.ts", "utf8").trim()).toBe('export * from "./core/status.js";');
    expect(readFileSync("src/spec-test/drift.ts", "utf8").trim()).toBe('export * from "./core/drift-report.js";');
    expect(readFileSync("src/spec-test/proposal.ts", "utf8").trim()).toBe('export * from "./core/proposal-runner.js";');
    expect(readFileSync("src/spec-test/generate.ts", "utf8").trim()).toBe('export * from "./core/generation-runner.js";');

    const status = readFileSync("src/spec-test/core/status.ts", "utf8");
    expect(status).toContain('from "./context.js"');
    expect(status).toContain('from "./repository.js"');
    expect(status).not.toContain("specTestsSchema");
    expect(status).not.toMatch(/readRequiredJsonFile/);
    expect(status).not.toMatch(/writeJsonFile/);

    const repository = readFileSync("src/spec-test/core/repository.ts", "utf8");
    expect(repository).toContain('from "./schemas.js"');
    expect(repository).toContain("readOrCreateSpecTests");
    expect(repository).toContain("writeSpecTests");

    const proposalRunner = readFileSync("src/spec-test/core/proposal-runner.ts", "utf8");
    expect(proposalRunner).toContain("resolveRunnableChangeTarget(project, { changeId: options.changeId })");
    expect(proposalRunner).toContain("getSpecTestStatus(project, { changeId, worktreeId: options.worktreeId })");

    const generationRunner = readFileSync("src/spec-test/core/generation-runner.ts", "utf8");
    expect(generationRunner).toContain("resolveRunnableChangeTarget(project, { changeId: options.changeId })");
    expect(generationRunner).toContain("getSpecTestStatus(project, { changeId })");

    const drift = readFileSync("src/spec-test/core/drift-report.ts", "utf8");
    expect(drift).toContain("getSpecTestContextForChange");
    expect(drift).toContain("getSpecTestStatus(context.memory, { changeId: context.changeId, worktreeId: options.worktreeId })");
  });

  it("keeps task-queue manager as a compatibility facade with strict start validation", () => {
    const facade = readFileSync("src/task-queue/manager.ts", "utf8");
    expect(facade).toContain('export * from "./service.js";');
    expect(facade).toContain('export * from "./repository.js";');
    expect(facade).toContain('export * from "./item-transitions.js";');
    expect(facade).toContain('export * from "./reconcile.js";');
    expect(facade).not.toMatch(/async function startOrResumeTaskQueue/);
    expect(facade).not.toMatch(/taskQueueRunSchema/);
    expect(facade).not.toMatch(/appendWorkflowTaskEvent/);

    const startValidation = readFileSync("src/task-queue/start-validation.ts", "utf8");
    expect(startValidation).toContain('if (!options.readinessManifestId) throw new Error("TaskQueue start requires readinessManifestId.");');
    expect(startValidation).toContain('if (!options.decompositionPlanId) throw new Error("TaskQueue start requires decompositionPlanId.");');
    expect(startValidation).toContain("options.decompositionPlanId !== validated.proposal.decompositionPlanId");
    expect(startValidation).toContain("options.readinessManifestId !== validated.proposal.readinessManifestId");
  });

  it("keeps demand-worker manager as a compatibility facade", () => {
    const facade = readFileSync("src/demand-worker/manager.ts", "utf8");
    expect(facade).toContain('export * from "./schemas.js";');
    expect(facade).toContain('export * from "./repository.js";');
    expect(facade).toContain('export * from "./claim-service.js";');
    expect(facade).toContain('export * from "./lifecycle.js";');
    expect(facade).toContain('export * from "./reconcile.js";');
    expect(facade).not.toMatch(/async function enqueueDemandWorker/);
    expect(facade).not.toMatch(/async function claimNextDemandWorker/);
    expect(facade).not.toMatch(/demandWorkerSchema/);
    expect(facade).not.toMatch(/mainOrchestratorDecisionLogPath/);

    const claimService = readFileSync("src/demand-worker/claim-service.ts", "utf8");
    expect(claimService).toContain('from "./repository.js"');
    expect(claimService).toContain('from "./slot-policy.js"');
    expect(claimService).toContain("isActiveDemandWorkerAttemptStatus");

    const lifecycle = readFileSync("src/demand-worker/lifecycle.ts", "utf8");
    expect(lifecycle).toContain('from "./decisions.js"');
    expect(lifecycle).toContain("decisionActionFromWorkerStatus");

    const repository = readFileSync("src/demand-worker/repository.ts", "utf8");
    expect(repository).toContain('from "./queue-projection.js"');
    expect(repository).toContain("writeDemandWorkerQueueProjection");
  });

  it("keeps task-run manager as a compatibility facade with scoped evidence modules", () => {
    const facade = readFileSync("src/task-run/manager.ts", "utf8");
    expect(facade).toContain('export * from "./schemas.js";');
    expect(facade).toContain('export * from "./repository.js";');
    expect(facade).toContain('export * from "./lease-service.js";');
    expect(facade).toContain('export * from "./start-retry.js";');
    expect(facade).toContain('export * from "./reconcile.js";');
    expect(facade).toContain('export * from "./workflow-result.js";');
    expect(facade).not.toMatch(/async function startTaskRun/);
    expect(facade).not.toMatch(/async function reconcileTaskRuns/);
    expect(facade).not.toMatch(/taskRunSchema/);

    const reconcile = readFileSync("src/task-run/reconcile.ts", "utf8");
    expect(reconcile).toContain("run.taskRunId === taskRun.id && run.changeId === options.changeId");

    const workflowResult = readFileSync("src/task-run/workflow-result.ts", "utf8");
    expect(workflowResult).toContain("assertWorkflowResultLinkMatchesTaskRun");
    expect(workflowResult).toContain("link.changeId !== taskRun.changeId");

    const artifacts = readFileSync("src/task-run/artifacts.ts", "utf8");
    expect(artifacts).toContain("assertTaskRunMatchesScope");
  });

  it("keeps workflow-artifacts manager as a compatibility facade with scoped artifact modules", () => {
    const facade = readFileSync("src/workflow-artifacts/manager.ts", "utf8");
    expect(facade).toContain('export * from "./schemas.js";');
    expect(facade).toContain('export * from "./guards.js";');
    expect(facade).toContain('export * from "./taskqueue-proposal.js";');
    expect(facade).toContain('export * from "./workflow-graph-plan.js";');
    expect(facade).not.toMatch(/async function compileWorkflowGraphPlan/);
    expect(facade).not.toMatch(/decompositionPlanSchema/);

    const guards = readFileSync("src/workflow-artifacts/guards.ts", "utf8");
    expect(guards).toContain('join(memory.memoryRoot, changePath, "change.json")');
    expect(guards).toContain("artifact.changeId");

    const proposal = readFileSync("src/workflow-artifacts/taskqueue-proposal.ts", "utf8");
    expect(proposal).toContain("assertChangePathScope");
    expect(proposal).toContain("assertWorkflowArtifactScope");

    const graph = readFileSync("src/workflow-artifacts/workflow-graph-plan.ts", "utf8");
    expect(graph).toContain("assertWorkflowArtifactScope(memory, changePath, proposal");
    expect(graph).toContain("assertWorkflowArtifactScope(memory, changePath, readiness");
  });

  it("keeps workflow-scheduler as an owned module without Workbench/server/web dependencies", () => {
    const manager = readFileSync("src/workflow-scheduler/manager.ts", "utf8");
    expect(manager).toContain('export * from "./claim-reconcile.js";');
    expect(manager).toContain('export * from "./compiler.js";');
    expect(manager).toContain('export * from "./dry-run.js";');
    expect(manager).toContain('export * from "./repository.js";');
    expect(manager).toContain('export * from "./schemas.js";');
    expect(manager).toContain('export * from "./scheduler-run.js";');
    expect(manager).toContain('export * from "./worker-plan.js";');

    const compiler = readFileSync("src/workflow-scheduler/compiler.ts", "utf8");
    expect(compiler).toContain("compileSchedulerContract");
    expect(compiler).toContain("buildWaves");
    expect(compiler).toContain("ready-for-scheduler-contract");
    expect(compiler).toContain("SchedulerContract compile requires explicit ordering for conflict edge");
    expect(compiler).not.toContain("../workflow-artifacts/manager.js");

    const dryRun = readFileSync("src/workflow-scheduler/dry-run.ts", "utf8");
    expect(dryRun).toContain("compileSchedulerDispatchDryRun");
    expect(dryRun).toContain("runtimeContinuityPrerequisites");
    expect(dryRun).toContain("estimatedMaxWaveWidth");

    const workerPlan = readFileSync("src/workflow-scheduler/worker-plan.ts", "utf8");
    expect(workerPlan).toContain("compileSchedulerWorkerSessionPlan");
    expect(workerPlan).toContain("workerPermissionProfileForRole");
    expect(workerPlan).toContain("recoveryKeyInputs");
    expect(workerPlan).toContain("assertLatestSchedulerArtifact(latestDryRun, dryRun, \"SchedulerWorkerSessionPlan\", \"SchedulerDispatchDryRun\")");

    const claimReconcile = readFileSync("src/workflow-scheduler/claim-reconcile.ts", "utf8");
    expect(claimReconcile).toContain("compileSchedulerClaimReconcilePlan");
    expect(claimReconcile).toContain("claimIntentId");
    expect(claimReconcile).toContain("plannedWorkerKey");
    expect(claimReconcile).toContain("assertLatestSchedulerArtifact(latestWorkerPlan, workerPlan, \"SchedulerClaimReconcilePlan\", \"SchedulerWorkerSessionPlan\")");
    expect(claimReconcile).toContain("source lock conflict");

    const schedulerRun = readFileSync("src/workflow-scheduler/scheduler-run.ts", "utf8");
    expect(schedulerRun).toContain("prepareSchedulerRun");
    expect(schedulerRun).toContain("SchedulerRun requires a checked SchedulerLaunchPreflight");
    expect(schedulerRun).toContain("assertLatestSchedulerArtifact(latestPreflight, launchPreflight, \"SchedulerRun\", \"SchedulerLaunchPreflight\")");
    expect(schedulerRun).toContain("appendSchedulerRunJournalEvent");

    const guards = readFileSync("src/workflow-scheduler/guards.ts", "utf8");
    expect(typeof assertLatestSchedulerArtifact).toBe("function");
    expect(() => assertLatestSchedulerArtifact(
      { id: "latest-artifact" },
      { id: "old-artifact" },
      "SchedulerRun",
      "SchedulerLaunchPreflight",
    )).toThrow("SchedulerRun requires the latest SchedulerLaunchPreflight.");
    expect(guards).toContain("assertLatestSchedulerArtifact");
    expect(guards).toContain("requires the latest");
    expect(guards).not.toMatch(/workbench|server|web\/src|cli\/commands|manager/);

    for (const file of listSourceFiles(["src/workflow-scheduler"])) {
      const content = readFileSync(file, "utf8");
      expect(content).not.toMatch(/workbench\/|server\/|web\/src|cli\/commands|workflow-artifacts\/manager/);
    }
  });

  it("keeps runtime-continuity as an owned evidence module", () => {
    const files = listSourceFiles(["src/runtime-continuity"]);
    expect(files.map((file) => file.replace(/\\/g, "/"))).toEqual(expect.arrayContaining([
      "src/runtime-continuity/types.ts",
      "src/runtime-continuity/schemas.ts",
      "src/runtime-continuity/paths.ts",
      "src/runtime-continuity/repository.ts",
      "src/runtime-continuity/guards.ts",
      "src/runtime-continuity/events.ts",
    ]));
    const repository = readFileSync("src/runtime-continuity/repository.ts", "utf8");
    expect(repository).toContain("export async function createRuntimeContinuityArtifacts");
    expect(repository).toContain("export async function appendAgentEventEnvelope");
    expect(repository).toContain("assertEventSourceScope");
    expect(repository).toContain("RuntimeContinuityWorkspaceDescriptor");
    expect(readFileSync("src/runtime-continuity/types.ts", "utf8")).toContain('"validation-command"');
    expect(readFileSync("src/runtime-continuity/types.ts", "utf8")).toContain('"audit-codex-readonly"');
    expect(readFileSync("src/runtime-continuity/types.ts", "utf8")).toContain('"source-root"');
    const events = readFileSync("src/runtime-continuity/events.ts", "utf8");
    expect(events).toContain("permission.profile.attached");
    expect(events).toContain("permission.decision.recorded");
    expect(events).toContain("external-execution.requested");
    expect(events).toContain("stripCanonicalScope");
  });

  it("keeps scheduler-runtime as an owned runtime shell module", () => {
    const files = listSourceFiles(["src/scheduler-runtime"]);
    expect(files.map((file) => file.replace(/\\/g, "/"))).toEqual(expect.arrayContaining([
      "src/scheduler-runtime/types.ts",
      "src/scheduler-runtime/schemas.ts",
      "src/scheduler-runtime/paths.ts",
      "src/scheduler-runtime/repository.ts",
      "src/scheduler-runtime/guards.ts",
      "src/scheduler-runtime/initialize.ts",
      "src/scheduler-runtime/reconcile.ts",
      "src/scheduler-runtime/claim-reservation.ts",
      "src/scheduler-runtime/worker-path.ts",
      "src/scheduler-runtime/worker-start.ts",
      "src/scheduler-runtime/worker-result.ts",
      "src/scheduler-runtime/worker-validation.ts",
      "src/scheduler-runtime/worker-audit.ts",
      "src/scheduler-runtime/worker-rework-plan.ts",
      "src/scheduler-runtime/worker-rework.ts",
      "src/scheduler-runtime/worker-rework-result.ts",
      "src/scheduler-runtime/worker-rework-validation.ts",
      "src/scheduler-runtime/worker-rework-audit.ts",
      "src/scheduler-runtime/integration-candidate.ts",
      "src/scheduler-runtime/integration-check-handoff.ts",
      "src/scheduler-runtime/integration-outcome.ts",
      "src/scheduler-runtime/run-completion.ts",
      "src/scheduler-runtime/run-closeout.ts",
      "src/scheduler-runtime/rendering.ts",
      "src/scheduler-runtime/manager.ts",
    ]));
    const manager = readFileSync("src/scheduler-runtime/manager.ts", "utf8");
    expect(manager).toContain('export * from "./initialize.js";');
    expect(manager).toContain('export * from "./reconcile.js";');
    expect(manager).toContain('export * from "./claim-reservation.js";');
    expect(manager).toContain('export * from "./worker-path.js";');
    expect(manager).toContain('export * from "./worker-start.js";');
    expect(manager).toContain('export * from "./worker-result.js";');
    expect(manager).toContain('export * from "./worker-validation.js";');
    expect(manager).toContain('export * from "./worker-audit.js";');
    expect(manager).toContain('export * from "./worker-rework-audit.js";');
    expect(manager).toContain('export * from "./integration-candidate.js";');
    expect(manager).toContain('export * from "./integration-check-handoff.js";');
    expect(manager).toContain('export * from "./integration-outcome.js";');
    expect(manager).toContain('export * from "./run-completion.js";');
    expect(manager).toContain('export * from "./run-closeout.js";');
    expect(manager).toContain('export * from "./repository.js";');

    const guards = readFileSync("src/scheduler-runtime/guards.ts", "utf8");
    expect(guards).toContain("assertLatestSchedulerRuntimeClaimReservation");
    expect(guards).not.toMatch(/workbench\/|server\/|web\/src|cli\/commands|workflow-scheduler\/manager/);

    const initialize = readFileSync("src/scheduler-runtime/initialize.ts", "utf8");
    expect(initialize).toContain("initializeSchedulerRuntime");
    expect(initialize).toContain("SchedulerRuntimeState");
    expect(initialize).not.toMatch(/task-run\/|worker-lease|startTaskRun|claimWorkerLease/);

    const reconcile = readFileSync("src/scheduler-runtime/reconcile.ts", "utf8");
    expect(reconcile).toContain("reconcileSchedulerRuntime");
    expect(reconcile).toContain("SchedulerReconcileSnapshot");
    expect(reconcile).not.toContain("startCodeRun");

    const claimReservation = readFileSync("src/scheduler-runtime/claim-reservation.ts", "utf8");
    expect(claimReservation).toContain("reserveSchedulerRuntimeClaims");
    expect(claimReservation).toContain("findSchedulerClaimReservationForSnapshot");
    expect(claimReservation).toContain("source lock conflict");
    expect(claimReservation).not.toContain("createWorkerLease");
    expect(claimReservation).not.toContain("startTaskRun");

    const workerPath = readFileSync("src/scheduler-runtime/worker-path.ts", "utf8");
    expect(workerPath).toContain("schedulerIntegrationCandidateNeedsRefresh");
    expect(workerPath).toContain("findNextSchedulerReservationIntentForWorkerPaths");
    expect(workerPath).not.toContain("workbench/");
    expect(workerPath).not.toContain("server/");
    expect(workerPath).not.toContain("src/web");
    expect(workerPath).not.toContain("cli/");

    const workerStart = readFileSync("src/scheduler-runtime/worker-start.ts", "utf8");
    expect(workerStart).toContain("startFirstSchedulerCoderWorker");
    expect(workerStart).toContain("scheduler-claim-reservation");
    expect(workerStart).toContain("startCodeRun");
    expect(workerStart).toContain("startTaskRun");
    expect(workerStart).not.toContain("startValidationRun");
    expect(workerStart).not.toContain("startAuditRun");
    expect(workerStart).not.toContain("runTaskQueueSequence");

    const workerResult = readFileSync("src/scheduler-runtime/worker-result.ts", "utf8");
    expect(workerResult).toContain("reconcileSchedulerFirstWorkerResult");
    expect(workerResult).toContain("assertLatestSchedulerRuntimeClaimReservation");
    expect(workerResult).toContain("scheduler-claim-reservation");
    expect(workerResult).toContain("releaseTaskRunLease");
    expect(workerResult).not.toContain("startCodeRun");
    expect(workerResult).not.toContain("startValidationRun");
    expect(workerResult).not.toContain("startAuditRun");
    expect(workerResult).not.toContain("runTaskQueueSequence");

    const workerValidation = readFileSync("src/scheduler-runtime/worker-validation.ts", "utf8");
    expect(workerValidation).toContain("validateSchedulerFirstWorker");
    expect(workerValidation).toContain("assertLatestSchedulerRuntimeClaimReservation");
    expect(workerValidation).toContain("SchedulerRuntimeWorkerValidation");
    expect(workerValidation).toContain("startValidationRun");
    expect(workerValidation).toContain("scheduler-claim-reservation");
    expect(workerValidation).not.toContain("startCodeRun");
    expect(workerValidation).not.toContain("startAuditRun");
    expect(workerValidation).not.toContain("runTaskQueueSequence");

    const workerAudit = readFileSync("src/scheduler-runtime/worker-audit.ts", "utf8");
    expect(workerAudit).toContain("auditSchedulerFirstWorker");
    expect(workerAudit).toContain("assertLatestSchedulerRuntimeClaimReservation");
    expect(workerAudit).toContain("SchedulerRuntimeWorkerAudit");
    expect(workerAudit).toContain("startAuditRun");
    expect(workerAudit).toContain("validationId");
    expect(workerAudit).toContain("scheduler-claim-reservation");
    expect(workerAudit).not.toContain("startCodeRun");
    expect(workerAudit).not.toContain("startValidationRun");
    expect(workerAudit).not.toContain("runTaskQueueSequence");

    const workerReworkPlan = readFileSync("src/scheduler-runtime/worker-rework-plan.ts", "utf8");
    expect(workerReworkPlan).toContain("compileSchedulerFirstWorkerReworkPlan");
    expect(workerReworkPlan).toContain("assertLatestSchedulerRuntimeClaimReservation");
    expect(workerReworkPlan).toContain("SchedulerRuntimeWorkerReworkPlan");
    expect(workerReworkPlan).toContain("scheduler-claim-reservation");
    expect(workerReworkPlan).not.toContain("startCodeRun");
    expect(workerReworkPlan).not.toContain("startValidationRun");
    expect(workerReworkPlan).not.toContain("startAuditRun");
    expect(workerReworkPlan).not.toContain("runTaskQueueSequence");

    const workerRework = readFileSync("src/scheduler-runtime/worker-rework.ts", "utf8");
    expect(workerRework).toContain("startFirstSchedulerWorkerRework");
    expect(workerRework).toContain("assertLatestSchedulerRuntimeClaimReservation");
    expect(workerRework).toContain("scheduler-claim-rework");
    expect(workerRework).toContain("existingWorktreeId");
    expect(workerRework).toContain("startCodeRun");
    expect(workerRework).toContain("startTaskRun");
    expect(workerRework).not.toContain("startValidationRun");
    expect(workerRework).not.toContain("startAuditRun");
    expect(workerRework).not.toContain("runTaskQueueSequence");

    const workerReworkResult = readFileSync("src/scheduler-runtime/worker-rework-result.ts", "utf8");
    expect(workerReworkResult).toContain("reconcileSchedulerFirstWorkerReworkResult");
    expect(workerReworkResult).toContain("assertLatestSchedulerRuntimeClaimReservation");
    expect(workerReworkResult).toContain("scheduler-claim-rework");
    expect(workerReworkResult).toContain("releaseTaskRunLease");
    expect(workerReworkResult).not.toContain("startCodeRun");
    expect(workerReworkResult).not.toContain("startValidationRun");
    expect(workerReworkResult).not.toContain("startAuditRun");
    expect(workerReworkResult).not.toContain("runTaskQueueSequence");

    const workerReworkValidation = readFileSync("src/scheduler-runtime/worker-rework-validation.ts", "utf8");
    expect(workerReworkValidation).toContain("validateSchedulerFirstWorkerRework");
    expect(workerReworkValidation).toContain("assertLatestSchedulerRuntimeClaimReservation");
    expect(workerReworkValidation).toContain("SchedulerRuntimeWorkerReworkValidation");
    expect(workerReworkValidation).toContain("startValidationRun");
    expect(workerReworkValidation).toContain("scheduler-claim-rework");
    expect(workerReworkValidation).not.toContain("startCodeRun");
    expect(workerReworkValidation).not.toContain("startAuditRun");
    expect(workerReworkValidation).not.toContain("runTaskQueueSequence");

    const workerReworkAudit = readFileSync("src/scheduler-runtime/worker-rework-audit.ts", "utf8");
    expect(workerReworkAudit).toContain("auditSchedulerFirstWorkerRework");
    expect(workerReworkAudit).toContain("assertLatestSchedulerRuntimeClaimReservation");
    expect(workerReworkAudit).toContain("SchedulerRuntimeWorkerReworkAudit");
    expect(workerReworkAudit).toContain("startAuditRun");
    expect(workerReworkAudit).toContain("validationId");
    expect(workerReworkAudit).toContain("scheduler-claim-rework");
    expect(workerReworkAudit).not.toContain("startCodeRun");
    expect(workerReworkAudit).not.toContain("startValidationRun");
    expect(workerReworkAudit).not.toContain("runTaskQueueSequence");

    const integrationCandidate = readFileSync("src/scheduler-runtime/integration-candidate.ts", "utf8");
    expect(integrationCandidate).toContain("compileSchedulerIntegrationCandidate");
    expect(integrationCandidate).toContain("assertLatestSchedulerRuntimeClaimReservation");
    expect(integrationCandidate).toContain("SchedulerIntegrationCandidate");
    expect(integrationCandidate).toContain("previewWorktreeApply");
    expect(integrationCandidate).toContain("classifyApplyReadiness");
    expect(integrationCandidate).not.toContain("runIntegrationCheck");
    expect(integrationCandidate).not.toContain("applyIntegrationCheck");
    expect(integrationCandidate).not.toContain("applyResultToProject");
    expect(integrationCandidate).not.toContain("startCodeRun");
    expect(integrationCandidate).not.toContain("startValidationRun");
    expect(integrationCandidate).not.toContain("startAuditRun");
    expect(integrationCandidate).not.toContain("runTaskQueueSequence");

    const integrationCheckHandoff = readFileSync("src/scheduler-runtime/integration-check-handoff.ts", "utf8");
    expect(integrationCheckHandoff).toContain("runSchedulerIntegrationCheckHandoff");
    expect(integrationCheckHandoff).toContain("assertLatestSchedulerRuntimeClaimReservation");
    expect(integrationCheckHandoff).toContain("SchedulerIntegrationCheckHandoff");
    expect(integrationCheckHandoff).toContain("runIntegrationCheck");
    expect(integrationCheckHandoff).toContain("previewWorktreeApply");
    expect(integrationCheckHandoff).toContain("classifyApplyReadiness");
    expect(integrationCheckHandoff).not.toContain("applyIntegrationCheck");
    expect(integrationCheckHandoff).not.toContain("applyResultToProject");
    expect(integrationCheckHandoff).not.toContain("startCodeRun");
    expect(integrationCheckHandoff).not.toContain("startValidationRun");
    expect(integrationCheckHandoff).not.toContain("startAuditRun");
    expect(integrationCheckHandoff).not.toContain("runTaskQueueSequence");

    const integrationOutcome = readFileSync("src/scheduler-runtime/integration-outcome.ts", "utf8");
    expect(integrationOutcome).toContain("reconcileSchedulerIntegrationOutcome");
    expect(integrationOutcome).toContain("SchedulerIntegrationOutcome");
    expect(integrationOutcome).toContain("readIntegrationCheck");
    expect(integrationOutcome).toContain("getWorktreeStatus");
    expect(integrationOutcome).not.toContain("applyIntegrationCheck");
    expect(integrationOutcome).not.toContain("discardIntegrationCheck");
    expect(integrationOutcome).not.toContain("applyResultToProject");
    expect(integrationOutcome).not.toContain("runIntegrationCheck");
    expect(integrationOutcome).not.toContain("startCodeRun");
    expect(integrationOutcome).not.toContain("startValidationRun");
    expect(integrationOutcome).not.toContain("startAuditRun");
    expect(integrationOutcome).not.toContain("runTaskQueueSequence");

    const runCompletion = readFileSync("src/scheduler-runtime/run-completion.ts", "utf8");
    expect(runCompletion).toContain("completeSchedulerRunFromIntegrationOutcome");
    expect(runCompletion).toContain("SchedulerRunCompletion");
    expect(runCompletion).toContain("completeSchedulerRun");
    expect(runCompletion).toContain("readIntegrationCheck");
    expect(runCompletion).not.toContain("applyIntegrationCheck");
    expect(runCompletion).not.toContain("discardIntegrationCheck");
    expect(runCompletion).not.toContain("applyResultToProject");
    expect(runCompletion).not.toContain("runIntegrationCheck");
    expect(runCompletion).not.toContain("startCodeRun");
    expect(runCompletion).not.toContain("startValidationRun");
    expect(runCompletion).not.toContain("startAuditRun");
    expect(runCompletion).not.toContain("runTaskQueueSequence");

    const runCloseout = readFileSync("src/scheduler-runtime/run-closeout.ts", "utf8");
    expect(runCloseout).toContain("closeSchedulerRunBlockedOrExhausted");
    expect(runCloseout).toContain("assertLatestSchedulerRuntimeClaimReservation");
    expect(runCloseout).toContain("SchedulerRunBlockedCloseout");
    expect(runCloseout).toContain("completeSchedulerRun");
    expect(runCloseout).toContain("findNextSchedulerReservationIntentForWorkerPaths");
    expect(runCloseout).not.toContain("runIntegrationCheck");
    expect(runCloseout).not.toContain("applyIntegrationCheck");
    expect(runCloseout).not.toContain("discardIntegrationCheck");
    expect(runCloseout).not.toContain("applyResultToProject");
    expect(runCloseout).not.toContain("startCodeRun");
    expect(runCloseout).not.toContain("startValidationRun");
    expect(runCloseout).not.toContain("startAuditRun");
    expect(runCloseout).not.toContain("runTaskQueueSequence");

    for (const file of files) {
      const content = readFileSync(file, "utf8");
      expect(content).not.toMatch(/workbench\/|server\/|web\/src|cli\/commands|workflow-scheduler\/manager/);
    }
  });

  it("keeps scheduler worker-path decisions in the scheduler runtime owner module", () => {
    const workerPaths = [
      {
        start: { reservationIntentId: "reservation-intent-1", updatedAt: "2026-06-13T00:00:00.000Z" },
        audit: { status: "approved", claimIntentId: "claim-1" },
        terminal: true,
      },
      {
        start: { reservationIntentId: "reservation-intent-2", updatedAt: "2026-06-13T00:01:00.000Z" },
        reworkAudit: { status: "approved-with-notes", claimIntentId: "claim-2" },
        terminal: true,
      },
    ];
    expect(schedulerIntegrationCandidateNeedsRefresh({
      schedulerClaimReservationId: "reservation-1",
      outputClaimIntentIds: ["claim-1"],
    }, workerPaths)).toBe(true);
    expect(schedulerIntegrationCandidateNeedsRefresh({
      schedulerClaimReservationId: "reservation-1",
      outputClaimIntentIds: ["claim-1", "claim-2"],
    }, workerPaths)).toBe(false);
    expect(schedulerIntegrationCandidateNeedsRefresh({
      schedulerClaimReservationId: "reservation-1",
      outputs: [{ claimIntentId: "claim-1" }, { claimIntentId: "claim-2" }],
    }, workerPaths)).toBe(false);
    expect(schedulerIntegrationCandidateNeedsRefresh(null, workerPaths)).toBe(true);
    expect(approvedSchedulerWorkerPathClaimIntentIds([
      ...workerPaths,
      {
        start: { reservationIntentId: "reservation-intent-3", updatedAt: "2026-06-13T00:02:00.000Z" },
        audit: { status: "blocked", claimIntentId: "claim-3" },
        terminal: true,
      },
    ])).toEqual(["claim-1", "claim-2"]);
    expect(findNextSchedulerReservationIntentForWorkerPaths({
      reservationIntents: [
        { reservationIntentId: "reservation-intent-1", claimIntentId: "claim-1", status: "reserved", waveIndex: 0 },
        { reservationIntentId: "reservation-intent-2", claimIntentId: "claim-2", status: "reserved", waveIndex: 0 },
        { reservationIntentId: "reservation-intent-3", claimIntentId: "claim-3", status: "reserved", waveIndex: 1 },
      ],
    }, workerPaths)).toMatchObject({ reservationIntentId: "reservation-intent-3", claimIntentId: "claim-3" });
    expect(findNextSchedulerReservationIntentForWorkerPaths({
      reservationIntents: [
        { reservationIntentId: "reservation-intent-1", claimIntentId: "claim-1", status: "reserved", waveIndex: 0 },
        { reservationIntentId: "reservation-intent-2", claimIntentId: "claim-2", status: "reserved", waveIndex: 0 },
      ],
    }, [{ ...workerPaths[0], terminal: false }])).toBeNull();

    const threadStream = readFileSync("src/workbench/projections/read-model/thread-stream.ts", "utf8");
    expect(threadStream).toContain("Scheduler current worker result reconcile");
    expect(threadStream).toContain("Scheduler current worker validation");
    expect(threadStream).not.toContain("Scheduler first worker result reconcile");
    expect(threadStream).not.toContain("Scheduler first worker validation");
  });

  it("keeps store-backed maintenance ledger entry reuse in the ledger owner", () => {
    expect(typeof ensureMaintenanceLedgerEntryForStoreArtifact).toBe("function");
    expect(typeof ensureMaintenancePolicyLedgerEntryForStoreArtifact).toBe("function");
    expect(typeof buildMaintenanceArtifactRefListForStores).toBe("function");
    expect(typeof buildCanonicalPatchApplicationManifestArtifactRefs).toBe("function");
    expect(typeof buildCanonicalPatchApplicationResultArtifactRefs).toBe("function");
    expect(typeof buildCanonicalPatchApplicationReportArtifactRefs).toBe("function");
    expect(typeof buildCanonicalPatchDerivedOperationId).toBe("function");
    expect(typeof buildCanonicalPatchAppliedOperationFromManifestOperation).toBe("function");
    expect(typeof buildCanonicalPatchApplicationReportOperationFromAppliedOperation).toBe("function");
    expect(typeof renderCanonicalPatchProposalOperationMarkdownDetails).toBe("function");
    expect(typeof renderCanonicalPatchManifestOperationMarkdownDetails).toBe("function");
    expect(typeof renderCanonicalPatchAppliedOperationMarkdownDetails).toBe("function");
    expect(typeof renderCanonicalPatchObservedOperationMarkdownDetails).toBe("function");
    expect(typeof copyCanonicalPatchProposalOperationLineage).toBe("function");
    expect(typeof copyCanonicalPatchManifestOperationLineage).toBe("function");
    expect(typeof copyCanonicalPatchAppliedOperationLineage).toBe("function");

    const artifactStore = readFileSync("src/agent-task/maintenance-artifact-store.ts", "utf8");
    expect(artifactStore).toContain("function buildMaintenanceArtifactRefListForStores");
    expect(artifactStore).toContain("buildMaintenanceArtifactRefs(memory");
    expect(artifactStore).not.toMatch(/ledger-event-policy|candidates|workbench\/|ToolPolicy|scheduler|goal-loop|manager/);

    const applicationArtifactRefs = readFileSync("src/agent-task/canonical-patch-application-artifact-refs.ts", "utf8");
    expect(applicationArtifactRefs).toContain("function buildCanonicalPatchApplicationManifestArtifactRefs");
    expect(applicationArtifactRefs).toContain("function buildCanonicalPatchApplicationResultArtifactRefs");
    expect(applicationArtifactRefs).toContain("function buildCanonicalPatchApplicationReportArtifactRefs");
    expect(applicationArtifactRefs).toContain("buildMaintenanceArtifactRefListForStores");
    expect(applicationArtifactRefs).toContain("includeMarkdown: false");
    expect(applicationArtifactRefs).not.toMatch(/ledger|ledger-event-policy|candidates|workbench\/|server\/|web\/|ToolPolicy|scheduler|goal-loop|manager/);

    const ledger = readFileSync("src/agent-task/ledger.ts", "utf8");
    expect(ledger).toContain("function ensureMaintenanceLedgerEntryForStoreArtifact");
    expect(ledger).toContain("function ensureMaintenancePolicyLedgerEntryForStoreArtifact");
    expect(ledger).toContain('from "./ledger-event-policy.js"');
    expect(ledger).toContain("buildMaintenanceLedgerEventSummary(input.eventType, input.summary)");
    expect(ledger).toContain('from "./maintenance-artifact-store.js"');
    expect(ledger).toContain("buildMaintenanceArtifactRefsForStore(memory, input.store, input.id)");
    expect(ledger).toContain("ensureMaintenanceLedgerEntryForArtifactRef(memory");
    expect(ledger).not.toMatch(/canonical-patch|candidate|Workbench|ToolPolicy|scheduler|goal-loop|manager/);

    const application = readFileSync("src/agent-task/canonical-patch-application.ts", "utf8");
    expect(application).toContain("buildCanonicalPatchApplicationManifestArtifactRefs");
    expect(application).toContain("buildCanonicalPatchApplicationResultArtifactRefs");
    expect(application).toContain("buildCanonicalPatchAppliedOperationFromManifestOperation");
    expect(application).toContain("renderCanonicalPatchManifestOperationMarkdownDetails");
    expect(application).toContain("renderCanonicalPatchAppliedOperationMarkdownDetails");
    expect(application).toContain("buildCanonicalPatchDerivedOperationId");
    expect(application).toContain("copyCanonicalPatchProposalOperationLineage");
    expect(application).not.toContain("copyCanonicalPatchManifestOperationLineage");
    expect(application).not.toContain("renderMaintenanceMarkdownDetailItem");
    expect(application).not.toContain("blockedReasons: ${operation.blockedReasons.length");
    expect(application).not.toContain("`Applied ${operation.descriptor.patchKind} canonical patch to ${operation.targetPath}.`");
    expect(application).toContain("ensureMaintenancePolicyLedgerEntryForStoreArtifact");
    expect(application).toContain('eventType: "canonical-patch-application-manifest"');
    expect(application).toContain('eventType: "canonical-patch-application-result"');
    expect(application).not.toContain("ensureMaintenanceLedgerEntryForArtifactRef");
    expect(application).not.toContain("ledger-event-policy");

    const report = readFileSync("src/agent-task/canonical-patch-application-report.ts", "utf8");
    expect(report).toContain("buildCanonicalPatchApplicationReportArtifactRefs");
    expect(report).toContain("buildCanonicalPatchApplicationReportOperationFromAppliedOperation");
    expect(report).toContain("renderCanonicalPatchObservedOperationMarkdownDetails");
    expect(report).not.toContain("copyCanonicalPatchAppliedOperationLineage");
    expect(report).not.toContain("renderMaintenanceMarkdownDetailItem");
    expect(report).not.toContain("`Observed applied ${lineage.patchKind} canonical patch on ${lineage.targetPath}.`");
    expect(report).toContain("ensureMaintenancePolicyLedgerEntryForStoreArtifact");
    expect(report).toContain('eventType: "canonical-patch-application-report"');
    expect(report).not.toContain("ensureMaintenanceLedgerEntryForArtifactRef");
    expect(report).not.toContain("ledger-event-policy");

    const updates = readFileSync("src/agent-task/canonical-updates.ts", "utf8");
    expect(updates).toContain("buildMaintenanceArtifactRefListForStores");
    expect(updates).toContain("renderCanonicalPatchProposalOperationMarkdownDetails");
    expect(updates).toContain("ensureMaintenancePolicyLedgerEntryForStoreArtifact");
    expect(updates).toContain('eventType: "canonical-update-proposal"');
    expect(updates).toContain('eventType: "canonical-update-decision"');
    expect(updates).toContain('eventType: "canonical-patch-proposal"');
    expect(updates).toContain('eventType: "canonical-patch-application-gate"');
    expect(updates).not.toContain("ensureMaintenanceLedgerEntryForArtifactRef");
    const updateImports = updates.split(/\r?\n/).filter((line) => line.startsWith("import ")).join("\n");
    expect(updateImports).not.toMatch(/ledger-event-policy|candidates|workbench\/|ToolPolicy|scheduler|goal-loop|manager/);

    const lineage = readFileSync("src/agent-task/canonical-patch-lineage.ts", "utf8");
    expect(lineage).toContain("function buildCanonicalPatchDerivedOperationId");
    expect(lineage).toContain("function buildCanonicalPatchAppliedOperationFromManifestOperation");
    expect(lineage).toContain("function buildCanonicalPatchApplicationReportOperationFromAppliedOperation");
    expect(lineage).toContain("function copyCanonicalPatchProposalOperationLineage");
    expect(lineage).toContain("function copyCanonicalPatchManifestOperationLineage");
    expect(lineage).toContain("function copyCanonicalPatchAppliedOperationLineage");
    expect(lineage).not.toMatch(/maintenance-artifact-store|ledger|paths|workbench\/|server\/|web\/|ToolPolicy|scheduler|goal-loop|manager/);

    const operationMarkdown = readFileSync("src/agent-task/canonical-patch-operation-markdown.ts", "utf8");
    expect(operationMarkdown).toContain("function renderCanonicalPatchProposalOperationMarkdownDetails");
    expect(operationMarkdown).toContain("function renderCanonicalPatchManifestOperationMarkdownDetails");
    expect(operationMarkdown).toContain("function renderCanonicalPatchAppliedOperationMarkdownDetails");
    expect(operationMarkdown).toContain("function renderCanonicalPatchObservedOperationMarkdownDetails");
    expect(operationMarkdown).toContain('from "./maintenance-markdown.js"');
    expect(operationMarkdown).toContain('from "./canonical-patch-target-boundary.js"');
    expect(operationMarkdown).not.toMatch(/maintenance-artifact-store|ledger|paths|canonical-updates|canonical-patch-application|canonical-patch-application-report|workbench\/|server\/|web\/|ToolPolicy|scheduler|goal-loop|manager/);
  });

  it("keeps workflow-run manager as a compatibility facade with scoped recovery modules", () => {
    const facade = readFileSync("src/workflow-run/manager.ts", "utf8");
    expect(facade).toContain('export * from "./schemas.js";');
    expect(facade).toContain('export * from "./repository.js";');
    expect(facade).toContain('export * from "./events.js";');
    expect(facade).toContain('export * from "./lifecycle-sync.js";');
    expect(facade).toContain('export * from "./stage-resume.js";');
    expect(facade).not.toMatch(/async function readWorkflowRun/);
    expect(facade).not.toMatch(/workflowRunSchema/);
    expect(facade).not.toMatch(/appendWorkflowRunEvent/);

    const repository = readFileSync("src/workflow-run/repository.ts", "utf8");
    expect(repository).toContain("assertWorkflowRunChangeScope(run, changeId)");
    expect(repository).toContain("isWorkflowRunScopedToChange(run, changeId)");

    const events = readFileSync("src/workflow-run/events.ts", "utf8");
    expect(events).toContain("assertWorkflowRunEventScope(event, run.changeId, run.id)");
    expect(events).toContain("canonicalWorkflowRunEventInput(input)");

    const lifecycle = readFileSync("src/workflow-run/lifecycle-sync.ts", "utf8");
    expect(lifecycle).toContain("assertWorkflowRunQueueScope(run, queue)");
    expect(lifecycle).toContain("recomputeWorkflowRecoveryKey");
  });

  it("keeps type index as a compatibility re-export barrel", () => {
    const barrel = readFileSync("src/types/index.ts", "utf8");
    expect(barrel).toContain('export * from "./project-memory.js";');
    expect(barrel).toContain('export * from "./change-ecl.js";');
    expect(barrel).toContain('export * from "./spec-test.js";');
    expect(barrel).toContain('export * from "./proposals.js";');
    expect(barrel).toContain('export * from "./run-worktree.js";');
    expect(barrel).toContain('export * from "./task-agent-workflow.js";');
    expect(barrel).toContain('export * from "./pr-remote-landing.js";');
    expect(barrel).toContain('export * from "./maintenance.js";');
    expect(barrel).not.toMatch(/export interface ManagedProject/);
    expect(barrel).not.toMatch(/export interface RunMetadata/);
    expect(barrel).not.toMatch(/export interface WorkflowRun/);
  });

  it("keeps the read-model compatibility facade thin", () => {
    const facade = readFileSync("src/workbench/projections/read-model.ts", "utf8");
    expect(facade.trim()).toBe('export * from "./read-model/implementation.js";');

    const implementation = readFileSync("src/workbench/projections/read-model/implementation.ts", "utf8");
    expect(implementation).toContain('from "./approval-inbox.js"');
    expect(implementation).toContain('from "./maintenance-summary.js"');
    expect(implementation).toContain('from "./topics.js"');
    expect(implementation).toContain('from "./decision-inspector.js"');
    expect(implementation).toContain('from "./workpad.js"');
    const workpad = readFileSync("src/workbench/projections/read-model/workpad.ts", "utf8");
    expect(workpad).toContain('from "./task-graph.js"');
    expect(workpad).toContain('from "./result-review.js"');
    expect(implementation).not.toMatch(/function buildApprovalInbox/);
    expect(implementation).not.toMatch(/function listWorkbenchTopicsFromMemory/);
    expect(implementation).not.toMatch(/function buildMaintenanceSummary/);
    expect(implementation).not.toMatch(/function buildDecisionInspector/);
    expect(implementation).not.toMatch(/function buildTaskGraph/);
    expect(implementation).not.toMatch(/function buildTaskQueueSummary/);
    expect(implementation).not.toMatch(/function buildResultReview/);
    expect(implementation).not.toMatch(/function buildWorkbenchWorkpad/);
    expect(implementation).not.toMatch(/function getWorkbenchDecompositionPlanProjection/);
  });

  it("keeps projection summary helpers pure and owned by read-model projections", () => {
    const records = [
      { id: "older", createdAt: "2026-06-18T00:00:00.000Z", extra: "keep" },
      { id: "newer", createdAt: "2026-06-19T00:00:00.000Z", extra: "drop" },
    ];
    const originalOrder = records.map((record) => record.id);

    expect(latestByCreatedAt(records)?.id).toBe("newer");
    expect(records.map((record) => record.id)).toEqual(originalOrder);
    expect(sortByTimestampDesc(records, (record) => record.createdAt).map((record) => record.id)).toEqual(["newer", "older"]);
    expect(records.map((record) => record.id)).toEqual(originalOrder);
    expect(latestByTimestamp(records, (record) => record.createdAt)?.id).toBe("newer");
    expect(projectFields(records[1], ["id", "createdAt"] as const)).toEqual({
      id: "newer",
      createdAt: "2026-06-19T00:00:00.000Z",
    });

    const optionalTimestampRecords: Array<{ id: string; finishedAt?: string | null }> = [
      { id: "missing" },
      { id: "old", finishedAt: "2026-06-17T00:00:00.000Z" },
      { id: "new", finishedAt: "2026-06-20T00:00:00.000Z" },
      { id: "empty", finishedAt: null },
    ];
    const optionalOriginalOrder = optionalTimestampRecords.map((record) => record.id);
    expect(latestByTimestamp(optionalTimestampRecords, (record) => record.finishedAt)?.id).toBe("new");
    expect(sortByTimestampDesc(optionalTimestampRecords, (record) => record.finishedAt).map((record) => record.id)).toEqual(["new", "old", "missing", "empty"]);
    expect(optionalTimestampRecords.map((record) => record.id)).toEqual(optionalOriginalOrder);

    const helper = readFileSync("src/workbench/projections/read-model/projection-summary.ts", "utf8");
    expect(helper).toContain("latestByTimestamp(items, (item) => item.createdAt)");
    expect(helper).not.toContain("from \"../../manager");
    expect(helper).not.toContain("from \"../../../server");
    expect(helper).not.toContain("from \"../../../agent-task");

    const taskGraph = readFileSync("src/workbench/projections/read-model/task-graph.ts", "utf8");
    const workpad = readFileSync("src/workbench/projections/read-model/workpad.ts", "utf8");
    const resultReview = readFileSync("src/workbench/projections/read-model/result-review.ts", "utf8");
    const decisionInspector = readFileSync("src/workbench/projections/read-model/decision-inspector.ts", "utf8");
    expect(taskGraph).toContain('from "./projection-summary.js"');
    expect(workpad).toContain('from "./projection-summary.js"');
    expect(resultReview).toContain('from "./projection-summary.js"');
    expect(decisionInspector).toContain('from "./projection-summary.js"');
    expect(decisionInspector).toContain("function compareDecisionContexts");
  });

  it("keeps Workbench action target revalidation helpers pure and fail-closed", () => {
    expect(() => assertWorkbenchActionChangeScope("other-change", "current-change", "planning.goal-loop.evaluate"))
      .toThrow("planning.goal-loop.evaluate changeId scope mismatch.");
    expect(() => assertWorkbenchActionChangeScope("current-change", "current-change", "planning.goal-loop.evaluate"))
      .not.toThrow();
    expect(() => assertWorkbenchActionChangeScope(undefined, "current-change", "planning.goal-loop.evaluate"))
      .not.toThrow();

    expect(() => assertLatestWorkbenchActionTarget(
      { id: "older-run" },
      { id: "current-run" },
      "planning.scheduler.plan.prepare",
      "SchedulerRun",
    )).toThrow("planning.scheduler.plan.prepare requires the latest SchedulerRun.");
    expect(() => assertLatestWorkbenchActionTarget(
      { id: "current-run" },
      { id: "current-run" },
      "planning.scheduler.plan.prepare",
      "SchedulerRun",
    )).not.toThrow();

    expect(() => assertPreparedWorkbenchActionTarget(
      { id: "older-run", changeId: "current-change", status: "prepared" },
      "current-run",
      "current-change",
      "planning.scheduler.runtime.initialize",
      "SchedulerRun",
    )).toThrow("planning.scheduler.runtime.initialize SchedulerRun target is stale or not prepared.");
    expect(() => assertPreparedWorkbenchActionTarget(
      { id: "current-run", changeId: "other-change", status: "prepared" },
      "current-run",
      "current-change",
      "planning.scheduler.runtime.initialize",
      "SchedulerRun",
    )).toThrow("planning.scheduler.runtime.initialize SchedulerRun target is stale or not prepared.");
    expect(() => assertPreparedWorkbenchActionTarget(
      { id: "current-run", changeId: "current-change", status: "completed" },
      "current-run",
      "current-change",
      "planning.scheduler.runtime.initialize",
      "SchedulerRun",
    )).toThrow("planning.scheduler.runtime.initialize SchedulerRun target is stale or not prepared.");
    expect(() => assertPreparedWorkbenchActionTarget(
      { id: "current-run", changeId: "current-change", status: "prepared" },
      "current-run",
      "current-change",
      "planning.scheduler.runtime.initialize",
      "SchedulerRun",
    )).not.toThrow();

    const helper = readFileSync("src/workbench/actions/active-target.ts", "utf8");
    expect(helper).toContain("assertWorkbenchActionChangeScope");
    expect(helper).toContain("assertLatestWorkbenchActionTarget");
    expect(helper).toContain("assertPreparedWorkbenchActionTarget");
    expect(helper).not.toMatch(/scheduler-runtime|goal-loop|ToolPolicy|server\/|web\/src|repository/);

    const boundary = readFileSync("src/workbench/actions/boundary.ts", "utf8");
    expect(boundary).toContain('from "./active-target.js"');
    expect(boundary).toContain("assertWorkbenchActionChangeScope(request.changeId, changeId, \"planning.goal-loop.evaluate\")");
    expect(boundary).toContain("assertLatestWorkbenchActionTarget(latestRun, run, \"planning.scheduler.plan.prepare\", \"SchedulerRun\")");
    expect(boundary).toContain("assertPreparedWorkbenchActionTarget(run, request.schedulerRunId, changeId, request.actionType, \"SchedulerRun\")");
    expect(boundary).toContain("assertPreparedWorkbenchActionTarget(run, request.schedulerRunId, changeId, \"planning.scheduler.worker.validate-first\", \"SchedulerRun\")");
    expect(boundary).toContain("assertLatestWorkbenchActionTarget(latestDryRun, dryRun, \"planning.scheduler.worker-plan.compile\", \"SchedulerDispatchDryRun\")");
    expect(boundary).toContain("assertLatestWorkbenchActionTarget(latestClaimPlan, claimPlan, \"planning.scheduler.launch-preflight.check\", \"SchedulerClaimReconcilePlan\")");
    expect(boundary).toContain("assertLatestWorkbenchActionTarget(latestPreflight, preflight, \"planning.scheduler.run.prepare\", \"SchedulerLaunchPreflight\")");
    expect(boundary).toContain("planning.scheduler.plan.prepare requires the latest SchedulerReconcileSnapshot");
    expect(boundary).toContain("planning.scheduler.run.complete SchedulerRun target is not completable");
  });

  it("keeps confirmation queue planning copy non-executing and preserves explicit action scope", () => {
    const typedWorkflow = readFileSync("src/workbench/projections/read-model/confirmation/typed-workflow.ts", "utf8");
    expect(typedWorkflow).toContain("不会启动 coder、validator、auditor、TaskQueue、TaskRun 或 AgentTask");
    expect(typedWorkflow).not.toContain("需要你确认当前方案进入执行");
    expect(typedWorkflow).not.toContain("确认后，主 agent 会通过受控委派启动后续角色执行");

    const item = {
      id: "confirm:scope",
      kind: "planning-confirm",
      changeId: "change-from-item",
      worktreeId: "worktree-from-item",
      applyCheckId: "apply-from-item",
      landingPackageId: "landing-from-item",
      summary: "summary",
      whyNeedsConfirmation: "why",
      confirmEffect: "effect",
      riskSummary: "risk",
      evidenceRefs: [],
      primary: true,
      status: "pending",
      actions: [{
        id: "action:scope",
        label: "Action",
        kind: "workflow-action",
        actionType: "planning.taskqueue.confirm-start",
        changeId: "change-explicit",
        taskQueueProposalId: "proposal-1",
        workflowGraphPlanId: "graph-1",
        readinessManifestId: "readiness-1",
        decompositionPlanId: "decomposition-1",
        workflowRunId: "workflow-1",
        queueRunId: "queue-1",
        taskRunId: "task-run-1",
        taskIds: ["task-1"],
        enabled: true,
        requiresConfirmation: true,
      }],
    } as const;

    const scoped = scopeConfirmationQueueItemActions(item);
    expect(scoped.actions[0]?.changeId).toBe("change-explicit");
    expect(scoped.actions[0]?.worktreeId).toBe("worktree-from-item");
    expect(scoped.actions[0]?.landingPackageId).toBe("landing-from-item");
    expect(scoped.actions[0]?.taskQueueProposalId).toBe("proposal-1");
    expect(scoped.actions[0]?.workflowGraphPlanId).toBe("graph-1");
    expect(scoped.actions[0]?.readinessManifestId).toBe("readiness-1");
    expect(scoped.actions[0]?.decompositionPlanId).toBe("decomposition-1");
    expect(scoped.actions[0]?.workflowRunId).toBe("workflow-1");
    expect(scoped.actions[0]?.queueRunId).toBe("queue-1");
    expect(scoped.actions[0]?.taskRunId).toBe("task-run-1");
    expect(scoped.actions[0]?.taskIds).toEqual(["task-1"]);
  });

  it("keeps frontend surface facades and scoped payload helpers centralized", () => {
    const app = readFileSync("src/web/src/App.tsx", "utf8");
    expect(app).not.toMatch(/function ProjectConversationSidebar/);
    expect(app).not.toMatch(/function TopicComposer/);
    expect(app).not.toMatch(/function AssistantTurnBlocks/);

    const facade = readFileSync("src/web/src/panels/WorkbenchPanels.tsx", "utf8");
    expect(facade).toContain('export { MainConversationView, BottomStatusBar } from "./workbench/ConversationPanel.js";');
    expect(facade).toContain('export { DecisionInspectorPane } from "./workbench/DecisionPanels.js";');
    expect(facade).toContain('export { WorkpadView } from "./workbench/WorkpadPanel.js";');

    const shell = readFileSync("src/web/src/shell/WorkbenchShellParts.tsx", "utf8");
    expect(shell).toContain('from "./assistant-blocks.js"');
    expect(shell).toContain('from "./assistant-rendering.js"');
    expect(shell).toContain('from "./sidebar.js"');
    expect(shell).not.toMatch(/function ProjectConversationSidebar/);
    expect(shell).not.toMatch(/function TopicComposer/);
    expect(shell).not.toMatch(/function AssistantTurnBlocks/);

    const assistantBlocks = readFileSync("src/web/src/shell/assistant-blocks.ts", "utf8");
    expect(assistantBlocks).toContain("function isMainThreadAssistantEvent");
    expect(assistantBlocks).toContain("function hasInternalRunMetadata");
    expect(assistantBlocks).toContain("function dedupeBlocks");

    const assistantRendering = readFileSync("src/web/src/shell/assistant-rendering.tsx", "utf8");
    expect(assistantRendering).toContain("workflowActionPayloadFromScope(confirmingAction)");
    expect(assistantRendering).toContain("workflowActionPayloadFromScope(action)");

    const workpad = readFileSync("src/web/src/panels/workbench/WorkpadPanel.tsx", "utf8");
    expect(workpad).toContain('from "./workpad/WorkpadDetails.js"');
    expect(workpad).toContain('from "./workpad/WorkpadActionButton.js"');
    expect(workpad).not.toMatch(/function PlanningNarrativeCard/);
    expect(workpad).not.toMatch(/function TaskGraphCard/);
    expect(workpad).not.toMatch(/function WorkpadActionButton/);

    const taskGraphCards = readFileSync("src/web/src/panels/workbench/workpad/TaskGraphCards.tsx", "utf8");
    expect(taskGraphCards).toContain("workflowActionPayloadFromTaskAction");
    expect(taskGraphCards).not.toMatch(/taskIds:\s*action\.taskIds/);

    const workpadActionButton = readFileSync("src/web/src/panels/workbench/workpad/WorkpadActionButton.tsx", "utf8");
    expect(workpadActionButton).toContain("workflowActionPayloadFromScope(action)");
  });

  it("keeps workflow runtime code-workflow as a compatibility facade", () => {
    const facade = readFileSync("src/workflow-runtime/code-workflow.ts", "utf8");
    expect(facade).toContain('export { sourceRefreshReworkPrompt } from "./kernel/bounded-rework.js";');
    expect(facade).toContain('export { runCodeValidateAuditSequence } from "./kernel/role-stage-runner.js";');
    expect(facade).toContain('export { runTaskRunCodeValidateAuditSequence } from "./kernel/task-run-sequence.js";');
    expect(facade).toContain('export { runTaskQueueSequence } from "./kernel/task-queue-runner.js";');
    expect(facade).not.toMatch(/startCodeRun\(/);
    expect(facade).not.toMatch(/startValidationRun\(/);
    expect(facade).not.toMatch(/startAuditRun\(/);
  });

  it("keeps workbench-server as a compatibility facade", () => {
    const facade = readFileSync("src/server/workbench-server.ts", "utf8");
    expect(facade).toContain('export { executeWorkbenchAction } from "./workbench/actions.js";');
    expect(facade).toContain('export { buildNativeFolderDialogCommand, openNativeFolderDialog } from "./workbench/native-dialog.js";');
    expect(facade).toContain("startWorkbenchServer");
    expect(facade).not.toMatch(/function handleProjectWorkbenchApi/);
    expect(facade).not.toMatch(/function runAllowlistedAction/);
    expect(facade).not.toMatch(/function assertCurrentWorkflowAction/);
    expect(facade).not.toMatch(/function sendWorkbenchActionLive/);
    expect(facade).not.toMatch(/event: snapshot/);
  });
});

function listSourceFiles(roots: string[]): string[] {
  const files: string[] = [];
  for (const root of roots) collect(root, files);
  return files.filter((file) => file.endsWith(".ts") || file.endsWith(".tsx"));
}

function collect(path: string, files: string[]): void {
  const stats = statSync(path);
  if (stats.isFile()) {
    files.push(path);
    return;
  }
  for (const entry of readdirSync(path)) collect(join(path, entry), files);
}

function findCommand(program: Command, path: string[]): Command {
  let current = program;
  for (const name of path) {
    const next = current.commands.find((command) => command.name() === name);
    if (!next) throw new Error(`Missing command ${path.join(" ")}`);
    current = next;
  }
  return current;
}
