import { recordToolEventAuditEntry } from "../agent-task/boundary-audit.js";
import { evaluateToolPolicy } from "../agent-task/tool-policy.js";
import { DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY } from "../provider-runtime/project-harness-discovery.js";
import { resolveProjectRuntimeState } from "../project-runtime/coordinator.js";
import type { ManagedProject } from "../types/index.js";

export interface HighImpactApprovalScope {
  projectId: string;
  changeId: string;
  conversationId: string;
  graphScopeId: string;
  workflowGraphPlanId: string;
  acceptedProposalHash: string;
  authorizationId: string;
  evidenceDigest: string;
  targetManifestHash: string;
}

export type HighImpactApprovalOperation =
  | "source.apply"
  | "worktree.discard"
  | "integration-check.apply"
  | "integration-check.discard";

export interface HighImpactApprovalRecoveryReceipt<T = unknown> {
  operation: HighImpactApprovalOperation;
  approvalActionId: "result.apply" | "worktree.discard" | "apply-check.apply" | "apply-check.discard" | null;
  targetId: string;
  scope: HighImpactApprovalScope;
  result: T;
}

export function isHighImpactApprovalScope(value: unknown): value is HighImpactApprovalScope {
  if (!value || typeof value !== "object") return false;
  const scope = value as Record<string, unknown>;
  return [
    "projectId",
    "changeId",
    "conversationId",
    "graphScopeId",
    "workflowGraphPlanId",
    "authorizationId",
  ].every((key) => typeof scope[key] === "string" && scope[key].length > 0)
    && ["acceptedProposalHash", "evidenceDigest", "targetManifestHash"]
      .every((key) => typeof scope[key] === "string" && /^[a-f0-9]{64}$/i.test(scope[key]));
}

export async function auditHighImpactApproval(
  project: ManagedProject,
  actionType: string,
  targetId: string,
  scope: HighImpactApprovalScope,
): Promise<string> {
  const state = await resolveProjectRuntimeState(project, {
    discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
  });
  if (state.state !== "ready") throw new Error(`Project Harness is not ready for ${actionType}: ${state.state}.`);
  const decision = evaluateToolPolicy({
    actionType,
    actorRoleId: "main-agent",
    changeId: scope.changeId,
    conversationId: scope.conversationId,
    targetId,
    enforcementMode: "broker-enforced",
  });
  const artifact = await recordToolEventAuditEntry(state.resolution.paths, {
    changeId: scope.changeId,
    conversationId: scope.conversationId,
    actorRoleId: "main-agent",
    actionType,
    targetId,
    scope: { ...scope },
    decision,
  });
  if (decision.status === "denied" || decision.status === "unavailable") {
    throw new Error(`${decision.readableMessage} Evidence: ${artifact}`);
  }
  return artifact;
}
