import { join } from "node:path";
import { buildAcMap, parseReviewStatus } from "../ecl/anchors.js";
import { buildChangeIndex, getActiveChanges } from "../ecl/index.js";
import { isGitDirtyIgnoringAhoMemory } from "../project/git.js";
import { getSpecTestStatus } from "../spec-test/manager.js";
import { getLatestAuditSummary } from "../audit/artifacts.js";
import { getLatestValidationSummary } from "../validation/artifacts.js";
import { listWorktreesForChange } from "../worktree/manager.js";
import type { ChangeIndexItem, ChangeStatus, CloseGateResult, ManagedProject, ResolvedMemory, ReviewStatus } from "../types/index.js";
import { resolveChangeMemory } from "./utils.js";
import { evaluateActiveCount, uniqueSorted } from "./close-gate.js";
import { buildPlaceholderFiles, getMissingRequiredFiles, readChangeContents } from "./repository.js";
import { readScopedChangeMetadata } from "./metadata.js";

export async function getChangeStatus(project: ManagedProject | string | ResolvedMemory): Promise<ChangeStatus> {
  const memory = await resolveChangeMemory(project);
  const activeChanges = await getActiveChanges(memory);
  const baseGate = evaluateActiveCount(activeChanges);
  if (activeChanges.length !== 1) {
    return {
      projectPath: memory.projectRoot,
      activeChanges,
      change: null,
      reviewStatus: "missing",
      acMap: null,
      specTest: null,
      latestValidation: null,
      latestAudit: null,
      closeGate: baseGate,
    };
  }

  const active = activeChanges[0];
  return getChangeStatusForActive(memory, active, activeChanges, baseGate);
}

export async function getChangeStatusForChange(project: ManagedProject | string | ResolvedMemory, changeId: string): Promise<ChangeStatus> {
  const memory = await resolveChangeMemory(project);
  const activeChanges = await getActiveChanges(memory);
  const index = await buildChangeIndex(memory);
  const active = index.active.find((item) => item.name === changeId);
  if (!active) {
    return {
      projectPath: memory.projectRoot,
      activeChanges,
      change: null,
      reviewStatus: "missing",
      acMap: null,
      specTest: null,
      latestValidation: null,
      latestAudit: null,
      closeGate: {
        ready: false,
        warnings: [],
        blockingIssues: [`Active demand conversation not found for scoped run: ${changeId}.`],
      },
    };
  }
  return getChangeStatusForActive(memory, active, [active], evaluateActiveCount([active]));
}

async function getChangeStatusForActive(
  memory: ResolvedMemory,
  active: ChangeIndexItem,
  activeChanges: ChangeIndexItem[],
  baseGate: CloseGateResult,
): Promise<ChangeStatus> {
  const changePath = join(memory.memoryRoot, active.path);
  const missingFiles = getMissingRequiredFiles(changePath);
  const warnings: string[] = [];
  const blockingIssues = [...baseGate.blockingIssues];

  for (const file of missingFiles) {
    blockingIssues.push(`Missing required change file: ${file}.`);
  }

  const scoped = await readScopedChangeMetadata(memory, active, "active");
  blockingIssues.push(...scoped.blockingIssues);
  const change = scoped.metadata;

  const contents = await readChangeContents(changePath);
  const reviewStatus = parseReviewStatus(contents["reviews/review.md"]);
  const acMap = contents["spec.md"] !== null && contents["tasks.md"] !== null
    ? buildAcMap({
      changeId: active.name,
      specContent: contents["spec.md"],
      tasksContent: contents["tasks.md"],
      placeholderFiles: buildPlaceholderFiles(contents),
    })
    : null;

  if (acMap) {
    warnings.push(...acMap.warnings);
    blockingIssues.push(...acMap.blockingIssues);
  }

  const specTest = change ? await getSpecTestStatusForMemory(memory, change.id) : null;
  if (specTest) {
    warnings.push(...specTest.warnings);
    blockingIssues.push(...specTest.blockingIssues);
  }

  blockingIssues.push(...reviewBlockingIssues(reviewStatus));
  if (change) {
    const latestValidation = await getLatestValidationSummary(memory, change.id);
    if (!latestValidation) {
      warnings.push("No validation run recorded for this change.");
    } else if (latestValidation.status === "failed") {
      blockingIssues.push(`Latest validation failed: ${latestValidation.id}.`);
    }
    const latestAudit = await getLatestAuditSummary(memory, change.id);
    if (!latestAudit) {
      warnings.push("No audit run recorded for this change.");
    } else if (latestAudit.status === "blocked") {
      blockingIssues.push(`Latest audit blocked close: ${latestAudit.id}.`);
    } else if (latestAudit.status === "failed") {
      warnings.push(`Latest audit failed or could not be parsed: ${latestAudit.id}.`);
    }
    const worktrees = await listWorktreesForChange(memory, change.id);
    const hasAppliedWorktree = worktrees.some((worktree) => worktree.status === "applied");
    if (hasAppliedWorktree && (await isGitDirtyIgnoringAhoMemory(memory.projectRoot)) === true) {
      blockingIssues.push("Source repo has uncommitted changes after apply; commit or clean the source repo before closing the change.");
    }
    for (const worktree of worktrees) {
      if (worktree.status === "applied") {
        warnings.push(`Applied worktree remains available for cleanup: ${worktree.worktreeId}.`);
      } else if (worktree.dirty && hasAppliedWorktree) {
        warnings.push(`Superseded dirty worktree remains available for cleanup: ${worktree.worktreeId} (${worktree.checkoutPath}).`);
      } else if (worktree.dirty) {
        blockingIssues.push(`Dirty worktree blocks close: ${worktree.worktreeId} (${worktree.checkoutPath}).`);
      } else {
        warnings.push(`Active change has AHO-managed worktree: ${worktree.worktreeId}.`);
      }
    }
    return {
      projectPath: memory.projectRoot,
      activeChanges,
      change,
      reviewStatus,
      acMap,
      specTest,
      latestValidation,
      latestAudit,
      closeGate: {
        ready: blockingIssues.length === 0,
        warnings: uniqueSorted(warnings),
        blockingIssues: uniqueSorted(blockingIssues),
      },
    };
  }

  return {
    projectPath: memory.projectRoot,
    activeChanges,
    change,
    reviewStatus,
    acMap,
    specTest,
    latestValidation: null,
    latestAudit: null,
    closeGate: {
      ready: blockingIssues.length === 0,
      warnings: uniqueSorted(warnings),
      blockingIssues: uniqueSorted(blockingIssues),
    },
  };
}

async function getSpecTestStatusForMemory(memory: ResolvedMemory, changeId: string) {
  try {
    return await getSpecTestStatus(memory, { changeId });
  } catch (error) {
    return {
      version: "1.0" as const,
      changeId,
      selectedRoot: memory.projectRoot,
      latestValidation: null,
      mappings: [],
      acceptanceCriteria: [],
      warnings: [],
      blockingIssues: [`Spec-test mapping could not be evaluated: ${(error as Error).message}`],
    };
  }
}

export { evaluateActiveCount };

function reviewBlockingIssues(status: ReviewStatus): string[] {
  if (status === "approved" || status === "approved-with-notes") return [];
  if (status === "pending") return ["Review status is pending."];
  if (status === "blocked") return ["Review status is blocked."];
  if (status === "missing") return ["Review status is missing."];
  return ["Review status is unknown."];
}
