import type { IncomingMessage, ServerResponse } from "node:http";
import { listAgentTasks } from "../../agent-task/repository.js";
import type { AgentTask } from "../../types/index.js";
import { getWorkbenchSnapshot, type WorkbenchProjectInput } from "../../workbench/manager.js";
import { subscribeProjectLiveEvents } from "../../workbench/project-live-events.js";
import { resolveWorkbenchMemory } from "../../workbench/projections/read-model/support.js";
import type { WorkbenchAgentWorkspaceAgent } from "../../workbench/read-model-types.js";
import type { WorkbenchLiveEvent } from "../../workbench/types.js";
import { createSseResponse } from "../sse.js";

export async function sendProjectLiveEvents(input: WorkbenchProjectInput, request: IncomingMessage, response: ServerResponse): Promise<void> {
  const sse = createSseResponse(response);
  const unsubscribe = subscribeProjectLiveEvents(input.project?.id ?? "", (event) => sse.send("message", event));
  let snapshot: Awaited<ReturnType<typeof getWorkbenchSnapshot>>;
  let tasks: Awaited<ReturnType<typeof listAgentTasks>>;
  try {
    [snapshot, tasks] = await Promise.all([
      getWorkbenchSnapshot(input),
      resolveWorkbenchMemory(input).then((memory) => listAgentTasks(memory)),
    ]);
  } catch (error) {
    unsubscribe();
    sse.end();
    throw error;
  }
  for (const event of buildInitialProjectAgentEvents(input.project?.id, snapshot.right.agentWorkspace.agents, tasks)) sse.send("message", event);
  const cleanup = (): void => {
    unsubscribe();
    sse.cleanup();
  };
  request.on("close", cleanup);
  response.on("close", cleanup);
}

export function buildInitialProjectAgentEvents(
  projectId: string | undefined,
  agents: WorkbenchAgentWorkspaceAgent[],
  tasks: AgentTask[],
): WorkbenchLiveEvent[] {
  const events: WorkbenchLiveEvent[] = [];
  const announced = new Set<string>();
  for (const agent of agents.filter((item) => item.status === "running" || item.status === "queued" || item.status === "claimed")) {
    announced.add(agent.id);
    events.push({
      event: "run.status",
      data: {
        projectId,
        runId: agent.runId,
        threadId: agent.providerThreadId,
        parentThreadId: agent.parentThreadId,
        agentRoleId: agent.roleId,
        agentSurfaceId: agent.id,
        agentDisplayName: agent.providerDisplayName,
        status: agent.status,
      },
    });
  }
  for (const task of tasks.filter((item) => item.kind === "background" && (item.status === "running" || item.status === "queued" || item.status === "claimed"))) {
    const projectedAgent = agents.find((agent) => agent.transcript.cells?.some((cell) => cell.id === `task:${task.id}`));
    const agentSurfaceId = projectedAgent?.id ?? `task:${task.id}`;
    if (announced.has(agentSurfaceId)) continue;
    events.push({
      event: "run.status",
      data: {
        projectId,
        conversationId: task.conversationId,
        changeId: task.changeId,
        runId: projectedAgent?.runId ?? task.id,
        agentTaskId: task.id,
        agentRoleId: normalizedRoleId(task.roleId),
        agentSurfaceId,
        agentDisplayName: projectedAgent?.providerDisplayName,
        status: task.status,
      },
    });
  }
  return events;
}

function normalizedRoleId(roleId: string): string {
  if (roleId.startsWith("memory-maintenance-agent:")) return "memory-maintenance-agent";
  if (roleId.startsWith("harness-evolution-agent:")) return "harness-evolution-agent";
  return roleId;
}
