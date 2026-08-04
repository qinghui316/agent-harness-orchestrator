import { stat } from "node:fs/promises";
import { join } from "node:path";
import type {
  ManagedProject,
  SpecTestAcStatus,
  SpecTestDriftAcStatus,
  SpecTestDriftReport,
  SpecTestDriftStatus,
} from "../../types/index.js";
import { getActiveSpecTestContext, getSpecTestContextForChange, getSpecTestStatus, readSpecTestsOrDefault } from "./status.js";

export interface SpecTestDriftOptions {
  worktreeId?: string;
  changeId?: string;
}

const STRICT_FAILING_STATUSES: SpecTestDriftStatus[] = ["invalid", "stale", "failed"];

export async function getSpecTestDriftReport(project: ManagedProject, options: SpecTestDriftOptions = {}): Promise<SpecTestDriftReport> {
  const context = options.changeId
    ? await getSpecTestContextForChange(project, options.changeId)
    : await getActiveSpecTestContext(project);
  const status = await getSpecTestStatus(project, { changeId: context.changeId, worktreeId: options.worktreeId });
  const specTests = await readSpecTestsOrDefault(context.evidenceRoot, context.changeId);
  const specTestsUpdatedAt = specTests.updatedAt;
  const freshness = {
    specChangedAfterEvidence: await fileChangedAfter(join(context.evidenceRoot, "spec.md"), specTestsUpdatedAt),
    tasksChangedAfterEvidence: await fileChangedAfter(join(context.evidenceRoot, "tasks.md"), specTestsUpdatedAt),
    validationOlderThanEvidence: isBefore(status.latestValidation?.finishedAt, specTestsUpdatedAt),
  };
  const globalStaleReasons = [
    ...(freshness.specChangedAfterEvidence ? ["spec.md changed after spec-tests.json was updated."] : []),
    ...(freshness.tasksChangedAfterEvidence ? ["tasks.md changed after spec-tests.json was updated."] : []),
    ...(freshness.validationOlderThanEvidence ? ["Latest validation finished before spec-tests.json was updated."] : []),
  ];
  const acceptanceCriteria = status.acceptanceCriteria.map((item) => classifyAc(item, globalStaleReasons));
  const summary = summarize(acceptanceCriteria, status.blockingIssues);
  const failingStatuses = STRICT_FAILING_STATUSES.filter((item) => summary[item] > 0);
  const warnings = [
    ...status.warnings,
    ...globalStaleReasons.map((reason) => `${reason} This is mtime-based drift risk, not proof of inconsistency.`),
  ];
  const blockingIssues = status.blockingIssues;

  return {
    version: "1.0",
    changeId: status.changeId,
    selectedRoot: status.selectedRoot,
    selectedRootType: status.selectedWorktreeId ? "worktree" : "source-root",
    selectedWorktreeId: status.selectedWorktreeId,
    latestValidationId: status.latestValidation?.id ?? null,
    latestValidationStatus: status.latestValidation?.status ?? null,
    specTestsUpdatedAt,
    freshness,
    summary,
    acceptanceCriteria,
    warnings: uniqueSorted(warnings),
    blockingIssues: uniqueSorted(blockingIssues),
    strict: {
      passed: failingStatuses.length === 0 && blockingIssues.length === 0,
      failingStatuses,
    },
  };
}

function classifyAc(item: SpecTestAcStatus, globalStaleReasons: string[]): SpecTestDriftAcStatus {
  const reasons: string[] = [];
  let status: SpecTestDriftStatus;

  if (item.blockingIssues.length > 0 || item.confidence === "invalid") {
    status = "invalid";
    reasons.push(...item.blockingIssues);
  } else if (item.latestValidationStatus === "failed") {
    status = "failed";
    reasons.push("Latest selected validation failed.");
  } else if (!item.linkedEvidence) {
    status = "missing";
    reasons.push("Acceptance Criterion has no linked evidence.");
  } else {
    const commandMissing = item.commandEvidence.filter((command) => command.validationStatus === "missing");
    const commandFailed = item.commandEvidence.filter((command) => command.validationStatus === "failed");
    if (commandFailed.length > 0) {
      status = "failed";
      reasons.push(...commandFailed.map((command) => `Validation command failed: ${command.commandName}.`));
    } else if (commandMissing.length > 0 || globalStaleReasons.length > 0) {
      status = "stale";
      reasons.push(...commandMissing.map((command) => `Validation command was not found in selected latest validation: ${command.commandName}.`));
      reasons.push(...globalStaleReasons);
    } else if (item.commandEvidence.some((command) => command.validationStatus === "passed")) {
      status = "ok";
      reasons.push("Linked command evidence passed in selected latest validation.");
    } else {
      status = "unknown";
      reasons.push("Linked evidence exists, but no command evidence was confirmed by latest validation.");
    }
  }

  return {
    acId: item.acId,
    text: item.text,
    status,
    reasons: uniqueSorted(reasons),
    warnings: item.warnings,
    blockingIssues: item.blockingIssues,
    recommendedNextAction: recommendedNextAction(status),
  };
}

function recommendedNextAction(status: SpecTestDriftStatus): string {
  if (status === "ok") return "No action required.";
  if (status === "missing") return "Link existing evidence or generate/apply passing test evidence.";
  if (status === "invalid") return "Fix or unlink invalid spec-test evidence references.";
  if (status === "stale") return "Rerun validation or refresh evidence mapping after spec/task changes.";
  if (status === "failed") return "Fix failing validation before accepting this evidence.";
  return "Inspect evidence and validation artifacts manually.";
}

function summarize(items: SpecTestDriftAcStatus[], globalBlockingIssues: string[]): Record<SpecTestDriftStatus, number> {
  const result: Record<SpecTestDriftStatus, number> = {
    ok: 0,
    missing: 0,
    invalid: globalBlockingIssues.length > 0 ? 1 : 0,
    stale: 0,
    failed: 0,
    unknown: 0,
  };
  for (const item of items) result[item.status] += 1;
  return result;
}

async function fileChangedAfter(path: string, iso: string): Promise<boolean> {
  const reference = Date.parse(iso);
  if (Number.isNaN(reference)) return false;
  const item = await stat(path);
  return item.mtimeMs > reference + 1000;
}

function isBefore(left: string | undefined, right: string): boolean {
  if (!left) return false;
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) return false;
  return leftTime + 1000 < rightTime;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

