import { listAgentTasks, readAgentTaskResult } from "../../../agent-task/manager.js";
import type { ResolvedMemory, AgentTask } from "../../../types/index.js";
import type { WorkbenchAgentTaskSummary } from "../../read-model-types.js";

export async function buildAgentTaskSummaries(memory: ResolvedMemory, changeId: string): Promise<WorkbenchAgentTaskSummary[]> {
  const tasks = await listAgentTasks(memory, changeId).catch(() => []);
  return Promise.all(tasks.slice(-12).map(async (task) => agentTaskToSummary(memory, task)));
}

export async function agentTaskToSummary(memory: ResolvedMemory, task: AgentTask): Promise<WorkbenchAgentTaskSummary> {
  const result = await readAgentTaskResult(memory, task.id).catch(() => null);
  return {
    id: task.id,
    conversationId: task.conversationId,
    roleId: task.roleId,
    kind: task.kind,
    status: task.status,
    changeId: task.changeId,
    runId: result?.artifactRefs.map(runIdFromArtifactRef).find((runId) => runId !== undefined),
    summary: task.summary,
    resultSummary: result?.summary,
    evidenceRefs: result?.artifactRefs ?? task.outputArtifacts ?? task.inputArtifacts,
    policyAuditRefs: result?.policyAuditRefs ?? [],
    boundaryAuditRefs: result?.boundaryAuditRefs ?? [],
    boundaryViolations: (result?.boundaryViolations ?? []).map((violation) => violation.reason),
    createdAt: task.createdAt,
    completedAt: task.finishedAt ?? undefined,
  };
}

function runIdFromArtifactRef(ref: string): string | undefined {
  const normalized = ref.replace(/\\/g, "/");
  const match = normalized.match(/(?:^|\/)runs\/([^/]+)(?:\/|$)/);
  return match?.[1];
}
