import {
  runWorkflowGraphSequentialExecution,
  type WorkflowGraphSequentialRuntimeInput,
  type WorkflowGraphSequentialRuntimeResult,
} from "./workflowgraph-sequential.js";
import type { WorkflowRuntimeLiveSink } from "./kernel/live-events.js";

export type {
  WorkflowRuntimeLiveSink,
  WorkflowGraphSequentialRuntimeInput as TaskQueueSequentialRuntimeInput,
  WorkflowGraphSequentialRuntimeResult as TaskQueueSequentialRuntimeResult,
};

export async function runTaskQueueSequentialWorkflow(input: WorkflowGraphSequentialRuntimeInput): Promise<WorkflowGraphSequentialRuntimeResult> {
  return runWorkflowGraphSequentialExecution(input);
}
