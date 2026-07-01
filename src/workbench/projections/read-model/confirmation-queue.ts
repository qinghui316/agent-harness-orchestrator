import { findIntegrationCheckCandidate, listIntegrationChecks } from "../../../integration-check/manager.js";
import { findLandingCandidate, listLandingPackages } from "../../../landing/manager.js";
import { latestLandingQueueSnapshot } from "../../../landing-queue/manager.js";
import type { ManagedProject, ResolvedMemory } from "../../../types/index.js";
import type { WorkbenchConfirmationQueue, WorkbenchDecisionInspector, WorkbenchTopicDetail, WorkbenchWorkpad } from "../../read-model-types.js";
import { decisionContextToConfirmationItems } from "./confirmation/decision-context.js";
import { attachControlledSchedulerAdvanceActions, attachGoalLoopAssistedConcreteGateActions, attachGoalLoopControlledContinuationActions, attachGoalLoopControllerRefreshActions, attachGoalLoopFeedbackActions, attachGoalLoopGateReadinessActions, attachGoalLoopSchedulerEvaluationActions, goalLoopEvaluationQueueItem } from "./confirmation/goal-loop.js";
import { integrationCandidateQueueItem, integrationCheckHistoryItem, integrationCheckNeedsActionQueueItem, integrationCheckNeedsUserAction, integrationCheckQueueItem, sameIntegrationTargets } from "./confirmation/integration.js";
import { landingCandidateQueueItem, landingLocalTerminalBlockerQueueItem, landingPackageQueueItem, landingQueuePrepareItem, landingQueueSnapshotItems, prDraftQueueItem } from "./confirmation/landing.js";
import { maintenanceCanonicalUpdateDecisionQueueItems } from "./confirmation/maintenance.js";
import { mainAgentExecutionForWorkpad } from "./main-agent-execution.js";
import { dedupeConfirmationItems, emptyConfirmationQueue, scopeConfirmationQueueItemActions } from "./confirmation/shared.js";
import { decompositionPlanToConfirmationItems, schedulerNextActionToConfirmationItems, taskQueueProposalToConfirmationItems, workpadNextActionToConfirmationItems } from "./confirmation/typed-workflow.js";

export { emptyConfirmationQueue, scopeConfirmationQueueItemActions } from "./confirmation/shared.js";

export async function buildConfirmationQueue(input: {
  project: ManagedProject | null;
  memory: ResolvedMemory;
  selectedTopic: WorkbenchTopicDetail | null;
  workpad: WorkbenchWorkpad;
  decisionInspector: WorkbenchDecisionInspector;
  includeProjectWideActions?: boolean;
  ignoreActiveWorkflowActions?: boolean;
  ignoreActiveWorkflowActionTypes?: string[];
}): Promise<WorkbenchConfirmationQueue> {
  const queue = emptyConfirmationQueue();
  const ignoredActiveWorkflowActionTypes = new Set(input.ignoreActiveWorkflowActionTypes ?? []);
  const selectedTopicBusy = Boolean(input.selectedTopic && (
    hasActiveExecutionRun(input.selectedTopic)
    || (!input.ignoreActiveWorkflowActions && hasActiveWorkflowAction(input.selectedTopic, ignoredActiveWorkflowActionTypes))
    || hasActiveRolePipeline(input.workpad)
  ));
  const selectedTopicInactive = Boolean(input.selectedTopic && input.selectedTopic.state !== "active");
  const enqueueCurrentOrOther = (item: WorkbenchConfirmationQueue["current"][number]): void => {
    if (selectedTopicBusy && isSelectedTopicItem(item, input.selectedTopic?.id)) return;
    if (input.selectedTopic && input.selectedTopic.state !== "active" && isSelectedTopicItem(item, input.selectedTopic.id)) {
      queue.otherDemands.push({ ...item, primary: false });
      return;
    }
    if (item.primary) queue.current.unshift(item);
    else queue.otherDemands.push(item);
  };
  const currentItems = selectedTopicBusy || selectedTopicInactive
    ? []
    : [
      ...workpadNextActionToConfirmationItems(input.project, input.selectedTopic, input.workpad),
      ...decompositionPlanToConfirmationItems(input.project, input.selectedTopic, input.workpad),
      ...taskQueueProposalToConfirmationItems(input.project, input.selectedTopic, input.workpad),
      ...decisionContextToConfirmationItems(input.decisionInspector.primary, true),
      ...input.decisionInspector.related.flatMap((context) => decisionContextToConfirmationItems(context, false)),
    ];
  const nextActionType = input.workpad.nextAction.actionType;
  if (!selectedTopicBusy && !selectedTopicInactive && nextActionType?.startsWith("planning.scheduler.") && !currentItems.some((item) => item.actions.some((action) => action.actionType === nextActionType))) {
    currentItems.push(...schedulerNextActionToConfirmationItems(input.project, input.selectedTopic, input.workpad));
  }
  queue.current = currentItems;

  if (input.project && input.includeProjectWideActions !== false) {
    const project = input.project;
    const checks = await listIntegrationChecks(input.memory).catch(() => []);
    const latestActionableCheck = checks.find((check) => integrationCheckNeedsUserAction(check.status));
    if (latestActionableCheck) {
      const item = integrationCheckNeedsActionQueueItem(project, latestActionableCheck, input.selectedTopic?.id);
      enqueueCurrentOrOther(item);
    }
    const candidate = await findIntegrationCheckCandidate(project, input.selectedTopic?.id).catch(() => null);
    const candidateAlreadyChecked = candidate && latestActionableCheck
      ? sameIntegrationTargets(candidate.targets, latestActionableCheck.resultTargets)
      : false;
    const candidateHandledByScheduler = candidate
      ? schedulerIntegrationCandidateCoversApplyCandidate(input.workpad, candidate.targets.map((target) => target.worktreeId))
      : false;
    if (candidate && !candidateAlreadyChecked && !candidateHandledByScheduler) {
      const item = integrationCandidateQueueItem(project, candidate, input.selectedTopic?.id);
      enqueueCurrentOrOther(item);
    }
    const latestPassed = checks.find((check) => check.status === "passed");
    if (latestPassed) {
      const item = integrationCheckQueueItem(project, latestPassed, input.selectedTopic?.id);
      enqueueCurrentOrOther(item);
    }
    const landingPackages = await listLandingPackages(input.memory).catch(() => []);
    const queueSnapshot = await latestLandingQueueSnapshot(input.memory).catch(() => null);
    const queuedLandingPackageIds = new Set<string>();
    if (queueSnapshot) {
      const queueItems = landingQueueSnapshotItems(project, queueSnapshot, input.selectedTopic?.id);
      for (const item of queueItems) {
        if (item.landingPackageId) queuedLandingPackageIds.add(item.landingPackageId);
        enqueueCurrentOrOther(item);
      }
    } else {
      const prepareItem = await landingQueuePrepareItem(project, input.memory, landingPackages, input.selectedTopic?.id).catch(() => null);
      if (prepareItem) {
        enqueueCurrentOrOther(prepareItem);
      }
    }
    const latestLanding = landingPackages[0];
    if (latestLanding && latestLanding.reviewedAt && !queuedLandingPackageIds.has(latestLanding.id)) {
      if (latestLanding.review?.verdict === "ready") {
        const item = await prDraftQueueItem(project, input.memory, latestLanding, input.selectedTopic?.id);
        const selectedLanding = isSelectedLandingPackage(latestLanding, input.selectedTopic?.id);
        if (selectedLanding && isProviderUnavailablePrDraftItem(item)) {
          if (!selectedTopicHasCloseGate(queue.current, input.selectedTopic?.id)) {
            enqueueCurrentOrOther(landingLocalTerminalBlockerQueueItem(
              project,
              latestLanding,
              input.selectedTopic?.id,
              input.selectedTopic?.closeGate?.blockingIssues ?? [],
            ));
          }
          enqueueCurrentOrOther({ ...item, primary: false });
        } else {
          enqueueCurrentOrOther(item);
        }
      } else {
        enqueueCurrentOrOther(landingPackageQueueItem(project, latestLanding, input.selectedTopic?.id));
      }
    }
    const landingCandidate = await findLandingCandidate(project).catch(() => null);
    if (landingCandidate) {
      const item = landingCandidateQueueItem(project, landingCandidate, input.selectedTopic?.id);
      enqueueCurrentOrOther(item);
    }
    queue.history = checks
      .filter((check) => check.status === "applied" || check.status === "discarded" || check.status === "conflict" || check.status === "failed")
      .slice(0, 8)
      .map((check) => integrationCheckHistoryItem(project, check));
  }

  queue.maintenance = input.includeProjectWideActions === false
    ? []
    : dedupeConfirmationItems((await maintenanceCanonicalUpdateDecisionQueueItems({
      project: input.project,
      memory: input.memory,
    })).map(scopeConfirmationQueueItemActions));
  if (!selectedTopicBusy && !selectedTopicInactive && queue.current.length === 0) {
    const goalLoopItem = goalLoopEvaluationQueueItem(input.project, input.selectedTopic);
    if (goalLoopItem) queue.current.push(goalLoopItem);
  }
  queue.current = attachGoalLoopControlledContinuationActions(attachGoalLoopSchedulerEvaluationActions(attachControlledSchedulerAdvanceActions(attachGoalLoopAssistedConcreteGateActions(attachGoalLoopGateReadinessActions(
    attachGoalLoopControllerRefreshActions(attachGoalLoopFeedbackActions(queue.current, input.workpad), input.workpad),
    input.workpad,
  ), input.workpad), input.workpad), input.project, input.selectedTopic, input.workpad), input.workpad);
  queue.current = dedupeConfirmationItems(queue.current.filter((item) => item.kind !== "maintenance").map(scopeConfirmationQueueItemActions));
  queue.current = promoteSelectedWorkflowNextActionGate(queue.current, input.workpad.nextAction);
  queue.current = promoteSelectedLandingReadinessGate(queue.current, input.selectedTopic?.id);
  queue.current = promoteSelectedCloseGate(queue.current, input.selectedTopic?.id);
  queue.current = promoteSelectedWorkpadApprovalGate(queue.current, input.workpad.nextAction);
  queue.otherDemands = dedupeConfirmationItems(queue.otherDemands.map(scopeConfirmationQueueItemActions));
  queue.history = dedupeConfirmationItems(queue.history.map(scopeConfirmationQueueItemActions));
  queue.primary = queue.current.find((item) => item.primary) ?? queue.current[0] ?? null;
  return queue;
}

function isSelectedLandingPackage(pkg: { target: { changeIds: string[] } }, selectedChangeId: string | undefined): boolean {
  return Boolean(selectedChangeId && pkg.target.changeIds.includes(selectedChangeId));
}

function isProviderUnavailablePrDraftItem(item: WorkbenchConfirmationQueue["current"][number]): boolean {
  return item.kind === "pr-draft" && item.id.startsWith("pr-draft:provider:");
}

function selectedTopicHasCloseGate(items: WorkbenchConfirmationQueue["current"], selectedChangeId: string | undefined): boolean {
  if (!selectedChangeId) return false;
  return items.some((item) =>
    item.changeId === selectedChangeId
    && item.actions.some((action) => action.action?.actionId === "change.close")
  );
}

function isSelectedTopicItem(item: WorkbenchConfirmationQueue["current"][number], selectedChangeId: string | undefined): boolean {
  return Boolean(selectedChangeId && (item.changeId === selectedChangeId || item.conversationId === selectedChangeId));
}

function hasActiveWorkflowAction(topic: WorkbenchTopicDetail, ignoredActionTypes: Set<string>): boolean {
  return topic.threadItems.some((item) =>
    item.source === "workflow"
    && item.kind === "assistant-turn"
    && item.actionRunId
    && item.status === "running"
    && !(("actionType" in item) && typeof item.actionType === "string" && ignoredActionTypes.has(item.actionType))
  );
}

function hasActiveExecutionRun(topic: WorkbenchTopicDetail): boolean {
  return topic.runs.some((run) =>
    (run.status === "created" || run.status === "running")
    && run.runtime !== "codex-readonly"
    && run.runtime !== "orchestrator"
    && run.runtime !== "intake-scan"
  );
}

function hasActiveRolePipeline(workpad: WorkbenchWorkpad): boolean {
  const mainAgentExecution = mainAgentExecutionForWorkpad(workpad);
  return mainAgentExecution?.status === "running"
    || Boolean(mainAgentExecution?.agentTasks.some((task) => task.status === "queued" || task.status === "claimed" || task.status === "running"));
}

function promoteSelectedWorkpadApprovalGate(items: WorkbenchConfirmationQueue["current"], nextAction: WorkbenchWorkpad["nextAction"]): WorkbenchConfirmationQueue["current"] {
  if (nextAction.kind !== "approval" || !nextAction.approvalId) return items;
  const index = items.findIndex((item) =>
    item.id === `confirm:approval:${nextAction.approvalId}`
    || item.actions.some((action) => action.approvalId === nextAction.approvalId)
  );
  if (index < 0) return items;
  const next = items.map((item) => ({ ...item, primary: false }));
  const [approvalGate] = next.splice(index, 1);
  if (!approvalGate) return items;
  return [{ ...approvalGate, primary: true }, ...next];
}

function promoteSelectedWorkflowNextActionGate(items: WorkbenchConfirmationQueue["current"], nextAction: WorkbenchWorkpad["nextAction"]): WorkbenchConfirmationQueue["current"] {
  if (nextAction.kind !== "workflow-action" || !nextAction.actionType || !nextAction.enabled || !nextAction.requiresConfirmation) return items;
  if (!nextAction.actionType.startsWith("planning.scheduler.")) return items;
  const index = items.findIndex((item) =>
    item.actions.some((action) =>
      action.actionType === nextAction.actionType
      || action.goalLoopCurrentGateActionType === nextAction.actionType
    )
  );
  if (index < 0) return items;
  const next = items.map((item) => ({ ...item, primary: false }));
  const [gate] = next.splice(index, 1);
  if (gate) next.unshift({ ...gate, primary: true });
  return next;
}

function promoteSelectedLandingReadinessGate(items: WorkbenchConfirmationQueue["current"], selectedChangeId: string | undefined): WorkbenchConfirmationQueue["current"] {
  if (!selectedChangeId) return items;
  const index = items.findIndex((item) =>
    item.changeId === selectedChangeId
    && (
      item.id.startsWith("landing:local-terminal-blocker:")
      || (
        item.kind === "landing-readiness"
        && item.actions.some((action) => (action.actionType === "landing.prepare" || action.actionType === "landing.refresh") && action.enabled)
      )
    )
  );
  if (index < 0) return items;
  const next = items.map((item) => ({ ...item, primary: false }));
  const [landingGate] = next.splice(index, 1);
  if (landingGate) next.unshift({ ...landingGate, primary: true });
  return next;
}

function promoteSelectedCloseGate(items: WorkbenchConfirmationQueue["current"], selectedChangeId: string | undefined): WorkbenchConfirmationQueue["current"] {
  if (!selectedChangeId) return items;
  const index = items.findIndex((item) =>
    item.changeId === selectedChangeId
    && item.actions.some((action) => action.action?.actionId === "change.close")
  );
  if (index < 0) return items;
  const next = items.map((item) => ({ ...item, primary: false }));
  const [closeGate] = next.splice(index, 1);
  if (closeGate) next.unshift({ ...closeGate, primary: true });
  return next;
}

function schedulerIntegrationCandidateCoversApplyCandidate(workpad: WorkbenchWorkpad, worktreeIds: string[]): boolean {
  const schedulerCandidate = workpad.schedulerIntegrationCandidate;
  if (!schedulerCandidate || schedulerCandidate.status !== "ready" || schedulerCandidate.readyCount < 2) return false;
  const readyIds = schedulerCandidate.readyWorktreeIds;
  if (readyIds.length !== worktreeIds.length) return false;
  const expected = new Set(readyIds);
  return worktreeIds.every((worktreeId) => expected.has(worktreeId));
}
