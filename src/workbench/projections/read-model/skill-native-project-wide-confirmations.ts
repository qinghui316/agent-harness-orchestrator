import { projectApplyActionScope, resolveProjectApplyExecutionScope } from "../../../apply/execution-scope.js";
import { integrationCheckActionManifestHash } from "../../../integration-check/apply-discard.js";
import { findSkillNativeIntegrationCheckCandidate } from "../../../integration-check/candidates.js";
import { listIntegrationChecks } from "../../../integration-check/repository.js";
import type { IntegrationCheckRecord } from "../../../integration-check/types.js";
import { listLandingPackages } from "../../../landing/repository.js";
import type { LandingCandidate, LandingReadinessPackage } from "../../../landing/types.js";
import { latestLandingQueueSnapshot } from "../../../landing-queue/repository.js";
import type { ProjectCodeExecutionRuntimePort, ProjectHarnessExecutionPort } from "../../../project-runtime/execution-ports.js";
import type { ManagedProject } from "../../../types/index.js";
import type { WorkbenchConfirmationQueue, WorkbenchConfirmationQueueItem, WorkbenchTopicDetail } from "../../read-model-types.js";
import {
  integrationCandidateQueueItem,
  integrationCheckHistoryItem,
  integrationCheckNeedsActionQueueItem,
  integrationCheckNeedsUserAction,
  integrationCheckQueueItem,
  sameIntegrationTargets,
} from "./confirmation/integration.js";
import {
  landingCandidateQueueItem,
  landingLocalTerminalBlockerQueueItem,
  landingPackageQueueItem,
  landingQueueSnapshotItems,
  prDraftQueueItem,
} from "./confirmation/landing.js";
import { dedupeConfirmationItems, scopeConfirmationQueueItemActions } from "./confirmation/shared.js";

export async function mergeSkillNativeProjectWideConfirmations(input: {
  project: ManagedProject;
  runtime: ProjectCodeExecutionRuntimePort;
  harness: ProjectHarnessExecutionPort;
  topic: WorkbenchTopicDetail;
  base: WorkbenchConfirmationQueue;
}): Promise<WorkbenchConfirmationQueue> {
  const selectedChangeId = input.topic.boundChangeId ?? input.topic.id;
  const [checks, packages, queueSnapshot, candidate] = await Promise.all([
    listIntegrationChecks(input.runtime),
    listLandingPackages(input.runtime),
    latestLandingQueueSnapshot(input.runtime),
    findSkillNativeIntegrationCheckCandidate(input.project, input.runtime, input.harness, selectedChangeId),
  ]);
  const projectItems: WorkbenchConfirmationQueueItem[] = [];
  const selectedChecks = checks.filter((check) =>
    check.resultTargets.some((target) => target.changeId === selectedChangeId));
  const actionable = selectedChecks.find((check) => integrationCheckNeedsUserAction(check.status));
  const passed = selectedChecks.find((check) => check.status === "passed");

  if (actionable) {
    projectItems.push(integrationCheckNeedsActionQueueItem(
      input.project,
      actionable,
      selectedChangeId,
      await actionScopeForCheck(input.project, actionable),
    ));
  } else if (passed) {
    projectItems.push(integrationCheckQueueItem(
      input.project,
      passed,
      selectedChangeId,
      await actionScopeForCheck(input.project, passed),
    ));
  } else if (candidate && !selectedChecks.some((check) => sameIntegrationTargets(candidate.targets, check.resultTargets))) {
    projectItems.push(integrationCandidateQueueItem(input.project, candidate, selectedChangeId));
  } else {
    const otherCheck = checks.find((check) =>
      !selectedChecks.includes(check)
      && (integrationCheckNeedsUserAction(check.status) || check.status === "passed"));
    if (otherCheck) {
      projectItems.push(integrationCheckNeedsUserAction(otherCheck.status)
        ? integrationCheckNeedsActionQueueItem(
          input.project,
          otherCheck,
          selectedChangeId,
          await actionScopeForCheck(input.project, otherCheck),
        )
        : integrationCheckQueueItem(
          input.project,
          otherCheck,
          selectedChangeId,
          await actionScopeForCheck(input.project, otherCheck),
        ));
    }
  }

  const queuedLandingPackageIds = new Set<string>();
  if (queueSnapshot) {
    for (const item of landingQueueSnapshotItems(input.project, queueSnapshot, selectedChangeId)) {
      if (item.landingPackageId) queuedLandingPackageIds.add(item.landingPackageId);
      projectItems.push(item);
    }
  }
  const latestLanding = packages[0];
  if (latestLanding?.reviewedAt && !queuedLandingPackageIds.has(latestLanding.id)) {
    if (latestLanding.review?.verdict === "ready") {
      const prItem = await prDraftQueueItem(input.project, input.runtime, latestLanding, selectedChangeId);
      if (isSelectedLandingPackage(latestLanding, selectedChangeId) && isProviderUnavailablePrDraftItem(prItem)) {
        projectItems.push(landingLocalTerminalBlockerQueueItem(
          input.project,
          latestLanding,
          selectedChangeId,
          input.topic.closeGate?.blockingIssues ?? [],
        ));
        input.base.otherDemands.push({ ...prItem, primary: false });
      } else {
        projectItems.push(prItem);
      }
    } else {
      projectItems.push(landingPackageQueueItem(input.project, latestLanding, selectedChangeId));
    }
  }

  const landingCandidate = findSkillNativeLandingCandidate(checks, packages);
  if (landingCandidate) projectItems.push(landingCandidateQueueItem(input.project, landingCandidate, selectedChangeId));

  const selectedItems: WorkbenchConfirmationQueueItem[] = [];
  const otherItems = [...input.base.otherDemands];
  for (const item of projectItems) {
    const bound = bindSelectedConversation(item, input.topic.id, selectedChangeId);
    if (item.changeId === selectedChangeId || item.conversationId === selectedChangeId) selectedItems.push(bound);
    else otherItems.push({ ...bound, primary: false });
  }
  const current = dedupeConfirmationItems([...selectedItems, ...input.base.current])
    .map(scopeConfirmationQueueItemActions)
    .map((item, index) => ({ ...item, primary: index === 0 }));
  const history = dedupeConfirmationItems([
    ...input.base.history,
    ...checks
      .filter((check) => ["applied", "discarded", "conflict", "failed"].includes(check.status))
      .slice(0, 8)
      .map((check) => integrationCheckHistoryItem(input.project, check)),
  ]).map(scopeConfirmationQueueItemActions);
  return {
    primary: current[0] ?? null,
    current,
    otherDemands: dedupeConfirmationItems(otherItems.map(scopeConfirmationQueueItemActions)),
    maintenance: [],
    history,
  };
}

async function actionScopeForCheck(project: ManagedProject, check: IntegrationCheckRecord) {
  const target = check.resultTargets[0];
  if (!target) return undefined;
  return resolveProjectApplyExecutionScope(project, target.worktreeId)
    .then((scope) => projectApplyActionScope(scope, integrationCheckActionManifestHash(check)))
    .catch(() => undefined);
}

function findSkillNativeLandingCandidate(
  checks: IntegrationCheckRecord[],
  packages: LandingReadinessPackage[],
): LandingCandidate | null {
  const packagedChecks = new Set(packages.map((pkg) => pkg.target.applyCheckId).filter((id): id is string => Boolean(id)));
  const check = checks.find((item) => item.status === "applied" && !packagedChecks.has(item.id));
  if (!check) return null;
  return {
    kind: "integration-check",
    applyCheckId: check.id,
    changeIds: Array.from(new Set(check.resultTargets.map((target) => target.changeId))),
    summary: "已应用的组合结果可以做提交/PR 前检查。",
    riskSummary: "检查只生成本地落地证据包，不会 commit、push、创建 PR 或 merge。",
  };
}

function bindSelectedConversation(
  item: WorkbenchConfirmationQueueItem,
  conversationId: string,
  changeId: string,
): WorkbenchConfirmationQueueItem {
  if (item.changeId !== changeId && item.conversationId !== changeId) return item;
  return {
    ...item,
    conversationId,
    actions: item.actions.map((action) => ({ ...action, changeId })),
  };
}

function isSelectedLandingPackage(pkg: LandingReadinessPackage, changeId: string): boolean {
  return pkg.target.changeIds.includes(changeId);
}

function isProviderUnavailablePrDraftItem(item: WorkbenchConfirmationQueueItem): boolean {
  return item.kind === "pr-draft" && item.id.startsWith("pr-draft:provider:");
}
