import type { AgentTask } from "../types/index.js";
import type { ResolvedMemory } from "../types/index.js";
import { recordMainAgentDecision } from "./decisions.js";
import { claimAgentTask, createAgentTask, startAgentTask } from "./repository.js";
import { buildDelegateTaskDecisionInput, type AgentTaskRequest, validateDelegateTaskPolicy } from "./delegate-task.js";
import { recordToolEventAuditEntry } from "./boundary-audit.js";
import { evaluateToolPolicy } from "./tool-policy.js";

export interface RoleDispatchResult {
  task: AgentTask;
  policyAuditRef: string;
}

export async function dispatchForegroundRoleTask(memory: ResolvedMemory, request: AgentTaskRequest): Promise<RoleDispatchResult> {
  const policy = await validateDelegateTaskPolicy(memory, request);
  const toolDecision = evaluateToolPolicy({
    actionType: "delegateTask",
    actorRoleId: "main-agent",
    changeId: request.changeId,
    conversationId: request.conversationId,
    targetId: request.roleId,
    goal: request.goal,
    enforcementMode: "broker-enforced",
  });
  const policyAuditRef = await recordToolEventAuditEntry(memory, {
    changeId: request.changeId,
    conversationId: request.conversationId,
    actorRoleId: "main-agent",
    actionType: "delegateTask",
    targetId: request.roleId,
    decision: policy.ok ? toolDecision : { ...toolDecision, status: "denied", reason: policy.reason, readableMessage: policy.readableMessage },
  });
  if (!policy.ok) throw new Error(policy.readableMessage);
  if (toolDecision.status === "denied" || toolDecision.status === "unavailable") throw new Error(toolDecision.readableMessage);

  await recordMainAgentDecision(memory, buildDelegateTaskDecisionInput(policy.request, policy.reason));
  const queued = await createAgentTask(memory, {
    conversationId: policy.request.conversationId,
    changeId: policy.request.changeId,
    roleId: policy.request.roleId,
    kind: "foreground",
    summary: policy.request.goal,
    inputArtifacts: policy.request.inputArtifacts ?? [],
    parentTaskId: policy.request.parentTaskId,
    createdBy: "main-agent-policy",
    initialStatus: "queued",
  });
  const claimed = await claimAgentTask(memory, queued);
  return { task: await startAgentTask(memory, claimed), policyAuditRef };
}
