import { findIntegrationCheckCandidate, listIntegrationChecks } from "../../../integration-check/manager.js";
import { findLandingCandidate, listLandingPackages } from "../../../landing/manager.js";
import { latestLandingQueueSnapshot } from "../../../landing-queue/manager.js";
import type { ProjectWorkbenchArtifactPathPort } from "../../../project-runtime/paths.js";
import type { ManagedProject } from "../../../types/index.js";
import type { WorkbenchConfirmationQueue, WorkbenchDecisionInspector, WorkbenchTopicDetail, WorkbenchWorkpad } from "../../read-model-types.js";
import { decisionContextToConfirmationItems } from "./confirmation/decision-context.js";
import { integrationCandidateQueueItem, integrationCheckHistoryItem, integrationCheckNeedsActionQueueItem, integrationCheckNeedsUserAction, integrationCheckQueueItem, sameIntegrationTargets } from "./confirmation/integration.js";
import { landingCandidateQueueItem, landingLocalTerminalBlockerQueueItem, landingPackageQueueItem, landingQueuePrepareItem, landingQueueSnapshotItems, prDraftQueueItem } from "./confirmation/landing.js";
import { mainAgentExecutionForWorkpad } from "./main-agent-execution.js";
import { dedupeConfirmationItems, emptyConfirmationQueue, scopeConfirmationQueueItemActions } from "./confirmation/shared.js";
import { schedulerNextActionToConfirmationItems, sequentialWorkflowToConfirmationItems } from "./confirmation/typed-workflow.js";

export { emptyConfirmationQueue, scopeConfirmationQueueItemActions } from "./confirmation/shared.js";

export async function buildConfirmationQueue(input: {
  project: ManagedProject | null;
  memory?: ProjectWorkbenchArtifactPathPort;
  selectedTopic: WorkbenchTopicDetail | null;
  workpad: WorkbenchWorkpad;
  decisionInspector: WorkbenchDecisionInspector;
  includeProjectWideActions?: boolean;
  ignoreActiveWorkflowActions?: boolean;
  ignoreActiveWorkflowActionTypes?: string[];
}): Promise<WorkbenchConfirmationQueue> {
  const queue = emptyConfirmationQueue();
  const selectedConversationId = input.selectedTopic?.id;
  const selectedChangeId = input.selectedTopic?.boundChangeId ?? selectedConversationId;
  const ignoredActiveWorkflowActionTypes = new Set(input.ignoreActiveWorkflowActionTypes ?? []);
  const selectedTopicBusy = Boolean(input.selectedTopic && (
    hasActiveExecutionRun(input.selectedTopic)
    || (!input.ignoreActiveWorkflowActions && hasActiveWorkflowAction(input.selectedTopic, ignoredActiveWorkflowActionTypes))
    || hasActiveRolePipeline(input.workpad)
  ));
  const selectedTopicInactive = Boolean(input.selectedTopic && input.selectedTopic.state !== "active");
  const enqueueCurrentOrOther = (item: WorkbenchConfirmationQueue["current"][number]): void => {
    if (selectedTopicBusy && isSelectedTopicItem(item, selectedChangeId)) return;
    if (input.selectedTopic && input.selectedTopic.state !== "active" && isSelectedTopicItem(item, selectedChangeId)) {
      queue.otherDemands.push({ ...item, primary: false });
      return;
    }
    if (item.primary) queue.current.unshift(item);
    else queue.otherDemands.push(item);
  };
  const currentItems = (selectedTopicBusy || selectedTopicInactive
    ? []
    : [
      ...sequentialWorkflowToConfirmationItems(input.project, input.selectedTopic, input.workpad),
      ...decisionContextToConfirmationItems(input.decisionInspector.primary, true, selectedConversationId),
      ...input.decisionInspector.related.flatMap((context) => decisionContextToConfirmationItems(
        context,
        false,
        context.changeId === selectedChangeId ? selectedConversationId : undefined,
      )),
    ]);
  const nextActionType = input.workpad.nextAction.actionType;
  if (!selectedTopicBusy && !selectedTopicInactive && nextActionType?.startsWith("planning.scheduler.") && !currentItems.some((item) => item.actions.some((action) => action.actionType === nextActionType))) {
    currentItems.push(...schedulerNextActionToConfirmationItems(input.project, input.selectedTopic, input.workpad));
  }
  queue.current = currentItems;

  if (input.project && input.includeProjectWideActions !== false) {
    const project = input.project;
    if (!input.memory) throw new Error("Project-wide confirmations require an explicit artifact store.");
    const checks = await listIntegrationChecks(input.memory).catch(() => []);
    const latestActionableCheck = checks.find((check) => integrationCheckNeedsUserAction(check.status));
    if (latestActionableCheck) {
      const item = integrationCheckNeedsActionQueueItem(project, latestActionableCheck, selectedChangeId);
      enqueueCurrentOrOther(item);
    }
    const candidate = await findIntegrationCheckCandidate(project, selectedChangeId).catch(() => null);
    const candidateAlreadyChecked = candidate && latestActionableCheck
      ? sameIntegrationTargets(candidate.targets, latestActionableCheck.resultTargets)
      : false;
    const candidateHandledByScheduler = candidate
      ? schedulerIntegrationCandidateCoversApplyCandidate(input.workpad, candidate.targets.map((target) => target.worktreeId))
      : false;
    if (candidate && !candidateAlreadyChecked && !candidateHandledByScheduler) {
      const item = integrationCandidateQueueItem(project, candidate, selectedChangeId);
      enqueueCurrentOrOther(item);
    }
    const latestPassed = checks.find((check) => check.status === "passed");
    if (latestPassed) {
      const item = integrationCheckQueueItem(project, latestPassed, selectedChangeId);
      enqueueCurrentOrOther(item);
    }
    const landingPackages = await listLandingPackages(input.memory).catch(() => []);
    const queueSnapshot = await latestLandingQueueSnapshot(input.memory).catch(() => null);
    const queuedLandingPackageIds = new Set<string>();
    if (queueSnapshot) {
      const queueItems = landingQueueSnapshotItems(project, queueSnapshot, selectedChangeId);
      for (const item of queueItems) {
        if (item.landingPackageId) queuedLandingPackageIds.add(item.landingPackageId);
        enqueueCurrentOrOther(item);
      }
    } else {
      const prepareItem = await landingQueuePrepareItem(project, input.memory, landingPackages, selectedChangeId).catch(() => null);
      if (prepareItem) {
        enqueueCurrentOrOther(prepareItem);
      }
    }
    const latestLanding = landingPackages[0];
    if (latestLanding && latestLanding.reviewedAt && !queuedLandingPackageIds.has(latestLanding.id)) {
      if (latestLanding.review?.verdict === "ready") {
        const item = await prDraftQueueItem(project, input.memory, latestLanding, selectedChangeId);
        const selectedLanding = isSelectedLandingPackage(latestLanding, selectedChangeId);
        if (selectedLanding && isProviderUnavailablePrDraftItem(item)) {
          enqueueCurrentOrOther(landingLocalTerminalBlockerQueueItem(
            project,
            latestLanding,
            selectedChangeId,
            input.selectedTopic?.closeGate?.blockingIssues ?? [],
          ));
          enqueueCurrentOrOther({ ...item, primary: false });
        } else {
          enqueueCurrentOrOther(item);
        }
      } else {
        enqueueCurrentOrOther(landingPackageQueueItem(project, latestLanding, selectedChangeId));
      }
    }
    const landingCandidate = await findLandingCandidate(project).catch(() => null);
    if (landingCandidate) {
      const item = landingCandidateQueueItem(project, landingCandidate, selectedChangeId);
      enqueueCurrentOrOther(item);
    }
    queue.history = checks
      .filter((check) => check.status === "applied" || check.status === "discarded" || check.status === "conflict" || check.status === "failed")
      .slice(0, 8)
      .map((check) => integrationCheckHistoryItem(project, check));
  }

  queue.maintenance = [];
  queue.current = dedupeConfirmationItems(queue.current.filter((item) => item.kind !== "maintenance").map(scopeConfirmationQueueItemActions));
  queue.current = promoteSelectedWorkflowNextActionGate(queue.current, input.workpad.nextAction);
  queue.current = promoteSelectedLandingReadinessGate(queue.current, selectedChangeId);
  queue.current = promoteSelectedWorkpadApprovalGate(queue.current, input.workpad.nextAction);
  queue.otherDemands = dedupeConfirmationItems(queue.otherDemands.map(scopeConfirmationQueueItemActions));
  queue.history = dedupeConfirmationItems(queue.history.map(scopeConfirmationQueueItemActions));
  if (selectedConversationId && selectedChangeId && selectedConversationId !== selectedChangeId) {
    queue.current = queue.current.map((item) => bindSelectedConversation(item, selectedConversationId, selectedChangeId));
    queue.otherDemands = queue.otherDemands.map((item) => bindSelectedConversation(item, selectedConversationId, selectedChangeId));
    queue.history = queue.history.map((item) => bindSelectedConversation(item, selectedConversationId, selectedChangeId));
  }
  queue.primary = queue.current.find((item) => item.primary) ?? queue.current[0] ?? null;
  return queue;
}

function bindSelectedConversation(
  item: WorkbenchConfirmationQueue["current"][number],
  conversationId: string,
  changeId: string,
): WorkbenchConfirmationQueue["current"][number] {
  if (item.changeId !== changeId) return item;
  return {
    ...item,
    conversationId,
    actions: item.actions.map((action) => ({ ...action, changeId })),
  };
}

function isSelectedLandingPackage(pkg: { target: { changeIds: string[] } }, selectedChangeId: string | undefined): boolean {
  return Boolean(selectedChangeId && pkg.target.changeIds.includes(selectedChangeId));
}

function isProviderUnavailablePrDraftItem(item: WorkbenchConfirmationQueue["current"][number]): boolean {
  return item.kind === "pr-draft" && item.id.startsWith("pr-draft:provider:");
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
    && run.runtime !== "provider-readonly"
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

function schedulerIntegrationCandidateCoversApplyCandidate(workpad: WorkbenchWorkpad, worktreeIds: string[]): boolean {
  const schedulerCandidate = workpad.schedulerIntegrationCandidate;
  if (!schedulerCandidate || schedulerCandidate.status !== "ready" || schedulerCandidate.readyCount < 2) return false;
  const readyIds = schedulerCandidate.readyWorktreeIds;
  if (readyIds.length !== worktreeIds.length) return false;
  const expected = new Set(readyIds);
  return worktreeIds.every((worktreeId) => expected.has(worktreeId));
}
