import type { ManagedProject } from "../../types/index.js";
import type { WorkbenchLiveSink, WorkbenchWorkflowActionRequest } from "../../workbench/types.js";
import { runMainAgentTaskQueueLifecycle } from "../../main-agent-orchestration/taskqueue-lifecycle.js";

export function runTaskQueueSequence(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  return runMainAgentTaskQueueLifecycle(project, changeId, request, live);
}
