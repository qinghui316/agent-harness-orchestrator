import type { ManagedProject } from "../../types/index.js";
import { auditHighImpactApproval } from "../../workflow-actions/high-impact-approval.js";
import type { WorkbenchApprovalAction } from "../read-model-types.js";

const REVALIDATED_APPROVAL_ACTIONS = new Set([
  "spec-test.proposal.accept-all-existing",
  "result.apply",
  "worktree.discard",
  "apply-check.apply",
  "apply-check.discard",
]);

export interface CurrentApprovalActionInput {
  project: ManagedProject | null;
  path: string;
}

export interface CurrentApprovalActionDeps {
  getWorkbenchSnapshot(input: CurrentApprovalActionInput, options?: { topicId?: string }): Promise<unknown>;
}

export async function assertCurrentApprovalAction(
  input: CurrentApprovalActionInput,
  action: WorkbenchApprovalAction,
  deps: CurrentApprovalActionDeps,
): Promise<void> {
  if (!REVALIDATED_APPROVAL_ACTIONS.has(action.actionId)) return;
  if (!input.project || !action.scope || action.scope.projectId !== input.project.id) throwStaleApprovalTarget();
  const snapshot = await deps.getWorkbenchSnapshot(input, { topicId: action.scope.conversationId });
  assertSelectedScope(snapshot, action.scope);
  const candidates = collectApprovalActions(snapshot);
  const expected = stableJson(action);
  if (!candidates.some((candidate) => stableJson(candidate) === expected)) throwStaleApprovalTarget();
}

export async function auditHighImpactApprovalAction(
  project: ManagedProject,
  action: WorkbenchApprovalAction,
): Promise<string | null> {
  if (!REVALIDATED_APPROVAL_ACTIONS.has(action.actionId)) return null;
  if (!action.scope) throwStaleApprovalTarget();
  const targetId = approvalTargetId(action);
  return auditHighImpactApproval(project, action.actionId, targetId, action.scope);
}

function assertSelectedScope(snapshot: unknown, scope: NonNullable<WorkbenchApprovalAction["scope"]>): void {
  if (!isRecord(snapshot) || !isRecord(snapshot.center) || !isRecord(snapshot.center.selectedTopic)) {
    throwStaleApprovalTarget();
  }
  const topic = snapshot.center.selectedTopic;
  if (topic.id !== scope.conversationId
    || topic.boundChangeId !== scope.changeId
    || topic.graphScopeId !== scope.graphScopeId) {
    throwStaleApprovalTarget();
  }
}

function approvalTargetId(action: WorkbenchApprovalAction): string {
  if (action.actionId.startsWith("apply-check.")) return action.args[1] ?? "";
  return action.args[3] ?? action.args[2] ?? "";
}

function collectApprovalActions(snapshot: unknown): WorkbenchApprovalAction[] {
  if (!isRecord(snapshot) || !isRecord(snapshot.right)) return [];
  const result: WorkbenchApprovalAction[] = [];
  for (const item of asArray(snapshot.right.approvals)) {
    if (isRecord(item) && isRecord(item.action)) collectFromActions([item], result);
  }
  const inspector = snapshot.right.decisionInspector;
  if (isRecord(inspector) && isRecord(inspector.primary) && Array.isArray(inspector.primary.actions)) {
    collectFromActions(inspector.primary.actions, result);
  }
  const queue = snapshot.right.confirmationQueue;
  if (isRecord(queue)) {
    const groups = [queue.primary, ...(asArray(queue.current)), ...(asArray(queue.otherDemands)), ...(asArray(queue.maintenance))];
    for (const item of groups) {
      if (isRecord(item) && Array.isArray(item.actions)) collectFromActions(item.actions, result);
    }
  }
  return result;
}

function collectFromActions(actions: unknown[], result: WorkbenchApprovalAction[]): void {
  for (const item of actions) {
    if (!isRecord(item) || !isRecord(item.action)) continue;
    const action = item.action;
    if (typeof action.actionId === "string"
      && typeof action.label === "string"
      && typeof action.command === "string"
      && Array.isArray(action.args)
      && action.args.every((value) => typeof value === "string")
      && typeof action.mutates === "boolean"
      && typeof action.requiresConfirmation === "boolean") {
      result.push(action as unknown as WorkbenchApprovalAction);
    }
  }
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function throwStaleApprovalTarget(): never {
  const error = new Error("Approval action target is stale or no longer available.");
  error.name = "Conflict";
  throw error;
}
