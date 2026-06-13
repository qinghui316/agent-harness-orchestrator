import { findIntegrationCheckCandidate, listIntegrationChecks } from "../../../integration-check/manager.js";
import { findLandingCandidate, listLandingPackages } from "../../../landing/manager.js";
import { latestLandingQueueSnapshot } from "../../../landing-queue/manager.js";
import type { ManagedProject, ResolvedMemory } from "../../../types/index.js";
import type { WorkbenchConfirmationQueue, WorkbenchDecisionInspector, WorkbenchTopicDetail, WorkbenchWorkpad } from "../../read-model-types.js";
import { decisionContextToConfirmationItems } from "./confirmation/decision-context.js";
import { goalLoopEvaluationQueueItem } from "./confirmation/goal-loop.js";
import { integrationCandidateQueueItem, integrationCheckHistoryItem, integrationCheckNeedsActionQueueItem, integrationCheckNeedsUserAction, integrationCheckQueueItem, sameIntegrationTargets } from "./confirmation/integration.js";
import { landingCandidateQueueItem, landingPackageQueueItem, landingQueuePrepareItem, landingQueueSnapshotItems, prDraftQueueItem } from "./confirmation/landing.js";
import { dedupeConfirmationItems, emptyConfirmationQueue, scopeConfirmationQueueItemActions } from "./confirmation/shared.js";
import { decompositionPlanToConfirmationItems, schedulerNextActionToConfirmationItems, taskQueueProposalToConfirmationItems, workpadNextActionToConfirmationItems } from "./confirmation/typed-workflow.js";

export { emptyConfirmationQueue, scopeConfirmationQueueItemActions } from "./confirmation/shared.js";

export async function buildConfirmationQueue(input: {
  project: ManagedProject | null;
  memory: ResolvedMemory;
  selectedTopic: WorkbenchTopicDetail | null;
  workpad: WorkbenchWorkpad;
  decisionInspector: WorkbenchDecisionInspector;
}): Promise<WorkbenchConfirmationQueue> {
  const queue = emptyConfirmationQueue();
  const currentItems = [
    ...workpadNextActionToConfirmationItems(input.project, input.selectedTopic, input.workpad),
    ...decompositionPlanToConfirmationItems(input.project, input.selectedTopic, input.workpad),
    ...taskQueueProposalToConfirmationItems(input.project, input.selectedTopic, input.workpad),
    ...decisionContextToConfirmationItems(input.decisionInspector.primary, true),
    ...input.decisionInspector.related.flatMap((context) => decisionContextToConfirmationItems(context, false)),
  ];
  const nextActionType = input.workpad.nextAction.actionType;
  if (nextActionType?.startsWith("planning.scheduler.") && !currentItems.some((item) => item.actions.some((action) => action.actionType === nextActionType))) {
    currentItems.push(...schedulerNextActionToConfirmationItems(input.project, input.selectedTopic, input.workpad));
  }
  queue.current = currentItems;

  if (input.project) {
    const project = input.project;
    const checks = await listIntegrationChecks(input.memory).catch(() => []);
    const latestActionableCheck = checks.find((check) => integrationCheckNeedsUserAction(check.status));
    if (latestActionableCheck) {
      const item = integrationCheckNeedsActionQueueItem(project, latestActionableCheck, input.selectedTopic?.id);
      if (item.primary) queue.current.unshift(item);
      else queue.otherDemands.push(item);
    }
    const candidate = await findIntegrationCheckCandidate(project).catch(() => null);
    const candidateAlreadyChecked = candidate && latestActionableCheck
      ? sameIntegrationTargets(candidate.targets, latestActionableCheck.resultTargets)
      : false;
    const candidateHandledByScheduler = candidate
      ? schedulerIntegrationCandidateCoversApplyCandidate(input.workpad, candidate.targets.map((target) => target.worktreeId))
      : false;
    if (candidate && !candidateAlreadyChecked && !candidateHandledByScheduler) {
      const item = integrationCandidateQueueItem(project, candidate, input.selectedTopic?.id);
      if (item.primary) queue.current.unshift(item);
      else queue.otherDemands.push(item);
    }
    const latestPassed = checks.find((check) => check.status === "passed");
    if (latestPassed) {
      const item = integrationCheckQueueItem(project, latestPassed, input.selectedTopic?.id);
      if (item.primary) queue.current.unshift(item);
      else queue.otherDemands.push(item);
    }
    const landingPackages = await listLandingPackages(input.memory).catch(() => []);
    const queueSnapshot = await latestLandingQueueSnapshot(input.memory).catch(() => null);
    const queuedLandingPackageIds = new Set<string>();
    if (queueSnapshot) {
      const queueItems = landingQueueSnapshotItems(project, queueSnapshot, input.selectedTopic?.id);
      for (const item of queueItems) {
        if (item.landingPackageId) queuedLandingPackageIds.add(item.landingPackageId);
        if (item.primary) queue.current.unshift(item);
        else queue.otherDemands.push(item);
      }
    } else {
      const prepareItem = await landingQueuePrepareItem(project, input.memory, landingPackages, input.selectedTopic?.id).catch(() => null);
      if (prepareItem) {
        if (prepareItem.primary) queue.current.unshift(prepareItem);
        else queue.otherDemands.push(prepareItem);
      }
    }
    const latestLanding = landingPackages[0];
    if (latestLanding && latestLanding.reviewedAt && !queuedLandingPackageIds.has(latestLanding.id)) {
      const item = latestLanding.review?.verdict === "ready"
        ? await prDraftQueueItem(project, input.memory, latestLanding, input.selectedTopic?.id)
        : landingPackageQueueItem(project, latestLanding, input.selectedTopic?.id);
      if (item.primary) queue.current.unshift(item);
      else queue.otherDemands.push(item);
    }
    const landingCandidate = await findLandingCandidate(project).catch(() => null);
    if (landingCandidate) {
      const item = landingCandidateQueueItem(project, landingCandidate, input.selectedTopic?.id);
      if (item.primary) queue.current.unshift(item);
      else queue.otherDemands.push(item);
    }
    queue.history = checks
      .filter((check) => check.status === "applied" || check.status === "discarded" || check.status === "conflict" || check.status === "failed")
      .slice(0, 8)
      .map((check) => integrationCheckHistoryItem(project, check));
  }

  queue.maintenance = [];
  if (queue.current.length === 0) {
    const goalLoopItem = goalLoopEvaluationQueueItem(input.project, input.selectedTopic);
    if (goalLoopItem) queue.current.push(goalLoopItem);
  }
  queue.current = dedupeConfirmationItems(queue.current.filter((item) => item.kind !== "maintenance").map(scopeConfirmationQueueItemActions));
  queue.otherDemands = dedupeConfirmationItems(queue.otherDemands.map(scopeConfirmationQueueItemActions));
  queue.history = dedupeConfirmationItems(queue.history.map(scopeConfirmationQueueItemActions));
  queue.primary = queue.current.find((item) => item.primary) ?? queue.current[0] ?? null;
  return queue;
}

function schedulerIntegrationCandidateCoversApplyCandidate(workpad: WorkbenchWorkpad, worktreeIds: string[]): boolean {
  const schedulerCandidate = workpad.schedulerIntegrationCandidate;
  if (!schedulerCandidate || schedulerCandidate.status !== "ready" || schedulerCandidate.readyCount < 2) return false;
  const readyIds = schedulerCandidate.readyWorktreeIds;
  if (readyIds.length !== worktreeIds.length) return false;
  const expected = new Set(readyIds);
  return worktreeIds.every((worktreeId) => expected.has(worktreeId));
}
