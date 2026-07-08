import type { ManagedProject } from "../types/index.js";
import {
  runDefaultCodeChangeWorkflow,
  type DefaultCodeChangeWorkflowResult,
  type WorkflowRuntimeLiveSink,
} from "./default-code-change.js";
import { emitAssistantEvent } from "./kernel/live-events.js";

export interface TopLevelRoleChainWorkflowInput {
  project: ManagedProject;
  changeId: string;
  prompt?: string;
  live?: WorkflowRuntimeLiveSink;
  continuation?: boolean;
  taskIds?: string[];
  readinessManifestId?: string;
}

export async function runTopLevelRoleChainWorkflow(input: TopLevelRoleChainWorkflowInput): Promise<DefaultCodeChangeWorkflowResult> {
  emitAssistantEvent(input.live, {
    runId: input.changeId,
    kind: "status",
    phase: input.continuation ? "top-level-role-chain-continued" : "top-level-role-chain-started",
    title: input.continuation ? "Main-agent execution continued" : "Main-agent execution started",
    summary: "Workflow Runtime is running the default code-change workflow.",
  });
  return runDefaultCodeChangeWorkflow({
    project: input.project,
    changeId: input.changeId,
    prompt: input.prompt,
    live: input.live,
    taskIds: input.taskIds,
    readinessManifestId: input.readinessManifestId,
  });
}
