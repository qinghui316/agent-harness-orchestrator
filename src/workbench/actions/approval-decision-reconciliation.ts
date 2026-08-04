import type { ManagedProject } from "../../types/index.js";
import {
  completeSpecTestAcceptanceTransaction,
  type SpecTestAcceptanceRecoveryReceipt,
} from "../../spec-test/proposal.js";
import type { HighImpactApprovalRecoveryReceipt } from "../../workflow-actions/high-impact-approval.js";
import {
  buildWorkbenchApprovalDecisionId,
  readWorkbenchDecisionStatus,
  recordWorkbenchDecision,
} from "../decisions.js";
import type { WorkbenchApprovalAction } from "../read-model-types.js";
import {
  inferArtifactFromActionResult,
  inferChangeIdFromAction,
  inferRunIdFromActionResult,
  inferTargetIdFromAction,
} from "./approval-execution.js";

const RECOVERABLE_APPROVAL_ACTIONS = new Set([
  "spec-test.proposal.accept-all-existing",
  "result.apply",
  "worktree.discard",
  "apply-check.apply",
  "apply-check.discard",
]);

export function isRecoverableApprovalAction(actionId: string): boolean {
  return RECOVERABLE_APPROVAL_ACTIONS.has(actionId);
}

export async function recordAcceptedApprovalDecision(
  project: ManagedProject,
  action: WorkbenchApprovalAction,
  result: unknown,
  feedback: string | null = null,
): Promise<void> {
  const changeId = inferChangeIdFromAction(action, result) ?? action.scope?.changeId ?? null;
  await recordWorkbenchDecision(project, {
    id: buildWorkbenchApprovalDecisionId(action.actionId, action.args),
    changeId,
    decisionType: action.actionId,
    status: "accepted",
    label: action.label,
    summary: `Accepted ${action.label}.`,
    targetId: inferTargetIdFromAction(action, result),
    runId: inferRunIdFromActionResult(result),
    artifact: inferArtifactFromActionResult(result),
    actionId: action.actionId,
    feedback,
    payload: result,
    completedAt: new Date().toISOString(),
  });
  const acceptanceTransactionId = specTestAcceptanceTransactionId(action, result);
  if (acceptanceTransactionId) {
    await completeSpecTestAcceptanceTransaction(project, acceptanceTransactionId);
  }
}

export async function reconcileRecoveredApprovalDecisions(
  project: ManagedProject,
  receipts: readonly (HighImpactApprovalRecoveryReceipt | SpecTestAcceptanceRecoveryReceipt)[],
): Promise<void> {
  for (const receipt of receipts) {
    if ("approvalActionId" in receipt && receipt.approvalActionId === null) continue;
    const action = actionForRecoveryReceipt(receipt);
    const decisionId = buildWorkbenchApprovalDecisionId(action.actionId, action.args);
    const status = await readWorkbenchDecisionStatus(project, decisionId);
    if (status === "accepted" || status === "completed") continue;
    await recordAcceptedApprovalDecision(project, action, receipt.result);
  }
}

function actionForRecoveryReceipt(
  receipt: HighImpactApprovalRecoveryReceipt | SpecTestAcceptanceRecoveryReceipt,
): WorkbenchApprovalAction {
  if ("actionId" in receipt) {
    return {
      actionId: receipt.actionId,
      label: receipt.label,
      command: receipt.command,
      args: receipt.args,
      mutates: true,
      requiresConfirmation: true,
      scope: receipt.scope,
    };
  }
  switch (receipt.operation) {
    case "source.apply":
      assertRecoveryActionId(receipt, "result.apply");
      return approvalAction(
        "result.apply",
        "应用到项目",
        "result",
        ["apply", receipt.scope.projectId, receipt.scope.changeId, receipt.targetId],
        receipt,
      );
    case "worktree.discard":
      assertRecoveryActionId(receipt, "worktree.discard");
      return approvalAction(
        "worktree.discard",
        "放弃这次结果",
        "worktree",
        ["discard", receipt.scope.projectId, receipt.scope.changeId, receipt.targetId],
        receipt,
      );
    case "integration-check.apply":
      assertRecoveryActionId(receipt, "apply-check.apply");
      return approvalAction(
        "apply-check.apply",
        "确认应用到项目",
        "apply-check",
        ["apply", receipt.targetId, integrationArtifactHash(receipt.result)],
        receipt,
      );
    case "integration-check.discard":
      assertRecoveryActionId(receipt, "apply-check.discard");
      return approvalAction(
        "apply-check.discard",
        "放弃组合结果",
        "apply-check",
        ["discard", receipt.targetId],
        receipt,
      );
  }
}

function specTestAcceptanceTransactionId(action: WorkbenchApprovalAction, result: unknown): string | null {
  if (action.actionId !== "spec-test.proposal.accept-all-existing" || !isRecord(result)) return null;
  return typeof result.acceptanceTransactionId === "string" ? result.acceptanceTransactionId : null;
}

function assertRecoveryActionId(
  receipt: HighImpactApprovalRecoveryReceipt,
  expected: NonNullable<HighImpactApprovalRecoveryReceipt["approvalActionId"]>,
): void {
  if (receipt.approvalActionId !== expected) {
    throw new Error(`Recovered ${receipt.operation} receipt has a stale approval action id.`);
  }
}

function approvalAction(
  actionId: string,
  label: string,
  command: string,
  args: string[],
  receipt: HighImpactApprovalRecoveryReceipt,
): WorkbenchApprovalAction {
  return {
    actionId,
    label,
    command,
    args,
    mutates: true,
    requiresConfirmation: true,
    scope: receipt.scope,
  };
}

function integrationArtifactHash(result: unknown): string {
  if (isRecord(result)
    && isRecord(result.check)
    && typeof result.check.latestArtifactHash === "string") {
    return result.check.latestArtifactHash;
  }
  throw new Error("Recovered IntegrationCheck apply receipt is missing its exact artifact hash.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
