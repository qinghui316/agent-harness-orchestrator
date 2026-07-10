import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { canApplyResultFromGate, previewWorktreeApply } from "../../../apply/manager.js";
import { listAuditResults } from "../../../audit/artifacts.js";
import { getChangeStatusForChange } from "../../../change/manager.js";
import { hasPendingEvolution } from "../../../ecl/index.js";
import { readRun } from "../../../run/manager.js";
import { listSpecTestProposalSummaries } from "../../../spec-test/proposal.js";
import { listValidationResults } from "../../../validation/artifacts.js";
import { listWorktreesForChange } from "../../../worktree/manager.js";
import type { ManagedProject, ResolvedMemory } from "../../../types/index.js";
import type { WorkbenchApprovalAction, WorkbenchApprovalItem, WorkbenchTopicSummary } from "../../read-model-types.js";
import { readRunEvents } from "./thread-stream.js";

export async function buildApprovalInbox(project: ManagedProject, memory: ResolvedMemory, topics: WorkbenchTopicSummary[]): Promise<WorkbenchApprovalItem[]> {
  const approvals: WorkbenchApprovalItem[] = [];
  const activeTopics = topics.filter((item) => item.state === "active");
  const specTestProposals = await listSpecTestProposalSummaries(project).catch(() => []);
  for (const proposal of specTestProposals.filter((item) => item.status === "proposed" && item.acceptedSourceRootCount === 0)) {
    approvals.push({
      id: `spec-test:${proposal.id}`,
      kind: "spec-test-proposal",
      label: `Spec-test evidence proposal ready: ${proposal.id}`,
      changeId: proposal.changeId,
      runId: proposal.runId,
      targetId: proposal.id,
      severity: "info",
      action: approvalAction("spec-test.proposal.accept-all-existing", "Accept source-root spec-test evidence", "spec-test", ["proposal", "accept", project.id, proposal.id, "--all-existing"], true),
    });
  }

  for (const activeTopic of activeTopics) {
    const changeId = activeTopic.boundChangeId ?? activeTopic.id;
    const audits = await listAuditResults(memory, changeId).catch(() => []);
    const validations = await listValidationResults(memory, changeId).catch(() => []);
    for (const audit of audits.filter((item) => item.status === "approved" || item.status === "approved-with-notes").slice(0, 3)) {
      if (await auditAlreadyAccepted(memory, activeTopic.path, audit.id)) continue;
      approvals.push({
        id: `audit:${audit.id}`,
        kind: "audit-proposal",
        label: `Audit proposal can be accepted: ${audit.id}`,
        changeId: audit.changeId,
        runId: audit.runId,
        targetId: audit.id,
        severity: "info",
        action: approvalAction("audit.accept", "Accept audit", "audit", ["accept", project.id, audit.id], true),
        artifact: audit.artifacts.audit,
        reason: audit.status === "approved" ? undefined : "Audit approved with notes requires manual acceptance.",
      });
    }
    const worktrees = await listWorktreesForChange(memory, changeId).catch(() => []);
    for (const worktree of worktrees.filter((item) => item.status !== "applied")) {
      if (!hasPotentialApplyEvidence(validations, audits, worktree.worktreeId)) continue;
      const preview = await previewWorktreeApply(project, worktree.worktreeId).catch(() => null);
      if (preview && canApplyResultFromGate(preview.gate)) {
        approvals.push({
          id: `apply:${worktree.worktreeId}`,
          kind: "worktree-apply",
          label: `结果可应用到项目：${worktree.worktreeId}`,
          changeId: worktree.changeId,
          targetId: worktree.worktreeId,
          severity: "info",
          action: approvalAction("result.apply", "应用到项目", "result", ["apply", project.id, worktree.changeId, worktree.worktreeId], true),
          artifact: preview.gate.audit?.artifacts.audit,
        });
      }
    }
    const status = await getChangeStatusForChange(project, changeId).catch(() => null);
    if (status?.closeGate.ready) {
      approvals.push({
        id: `close:${changeId}`,
        kind: "change-close",
        label: `Change ready to close: ${changeId}`,
        changeId,
        targetId: changeId,
        severity: "info",
        action: approvalAction("change.close", "Close change", "change", ["close", project.id, changeId], true),
      });
    }
    if (status?.latestValidation?.status === "failed") {
      approvals.push({
        id: `attention:validation:${changeId}:${status.latestValidation.id}`,
        kind: "attention",
        label: `Latest validation failed: ${status.latestValidation.id}`,
        changeId,
        targetId: status.latestValidation.id,
        severity: "blocking",
        reason: "Failed validation blocks close.",
      });
    }
    if (status?.latestAudit?.status === "blocked") {
      approvals.push({
        id: `attention:audit:${changeId}:${status.latestAudit.id}`,
        kind: "attention",
        label: `Latest audit blocked: ${status.latestAudit.id}`,
        changeId,
        targetId: status.latestAudit.id,
        severity: "blocking",
        reason: "Blocked audit prevents safe close.",
      });
    }
  }

  if (hasPendingEvolution(memory)) {
    approvals.push({
      id: "evolution:pending",
      kind: "evolution",
      label: "Harness evolution pending",
      severity: "warning",
      action: approvalAction("evolution.handle", "Handle Harness evolution", "harness-evolve", ["status"], false),
      artifact: "harness/evolution/pending.md",
      reason: "Handle through proposal, independent review, validation, results.tsv, and mark-complete.",
    });
  }
  return approvals;
}

function hasPotentialApplyEvidence(
  validations: Array<{ worktreeId?: string; status: string; finishedAt: string }>,
  audits: Array<{ worktreeId?: string; status: string; finishedAt: string }>,
  worktreeId: string,
): boolean {
  const validation = latestForWorktree(validations, worktreeId);
  if (validation?.status !== "passed") return false;
  const audit = latestForWorktree(audits, worktreeId);
  return audit?.status === "approved" || audit?.status === "approved-with-notes";
}

function latestForWorktree<T extends { worktreeId?: string; finishedAt: string }>(items: T[], worktreeId: string): T | undefined {
  return items
    .filter((item) => item.worktreeId === worktreeId)
    .sort((a, b) => b.finishedAt.localeCompare(a.finishedAt))[0];
}

export async function runHasEvent(memory: ResolvedMemory, runId: string, eventType: string): Promise<boolean> {
  try {
    const run = await readRun(memory, runId);
    const events = await readRunEvents(memory, run);
    return events.some((event) => event.type === eventType);
  } catch {
    return false;
  }
}

export async function auditAlreadyAccepted(memory: ResolvedMemory, changePath: string, auditId: string): Promise<boolean> {
  const reviewPath = join(memory.memoryRoot, changePath, "reviews", "review.md");
  if (!existsSync(reviewPath)) return false;
  try {
    const content = await readFile(reviewPath, "utf8");
    return content.includes(`- Audit ID: ${auditId}`) || content.includes(`Audit ID: ${auditId}`);
  } catch {
    return false;
  }
}

export function approvalAction(actionId: string, label: string, command: string, args: string[], mutates: boolean): WorkbenchApprovalAction {
  return {
    actionId,
    label,
    command,
    args,
    mutates,
    requiresConfirmation: mutates,
  };
}
