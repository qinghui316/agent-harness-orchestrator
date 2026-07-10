import type { ManagedProject } from "../types/index.js";
import { resolveProjectMemory } from "../memory/resolver.js";
import { readLatestWorkflowGraphPlan, readWorkflowGraphPlan } from "../workflow-artifacts/manager.js";
import { activeChangePath } from "../workflow-run/recovery-key.js";
import {
  runDefaultCodeChangeWorkflow,
  type DefaultCodeChangeWorkflowResult,
} from "./default-code-change.js";
import { emitAssistantEvent, type WorkflowRuntimeLiveSink } from "./kernel/live-events.js";

export interface TopLevelRoleChainWorkflowInput {
  project: ManagedProject;
  changeId: string;
  prompt?: string;
  live?: WorkflowRuntimeLiveSink;
  continuation?: boolean;
  taskIds?: string[];
  workflowGraphPlanId?: string;
}

export async function runTopLevelRoleChainWorkflow(input: TopLevelRoleChainWorkflowInput): Promise<DefaultCodeChangeWorkflowResult> {
  const memory = await resolveProjectMemory(input.project);
  const changePath = await activeChangePath(memory, input.changeId);
  const graph = input.workflowGraphPlanId
    ? await readWorkflowGraphPlan(memory, changePath, input.workflowGraphPlanId)
    : await readLatestWorkflowGraphPlan(memory, changePath);
  if (graph.authoringContractVersion !== "1.0" || graph.graphMode !== "sequential-v1" || graph.nodes.length !== 1) {
    throw new Error("Top-level default code workflow requires the latest authored single-node sequential WorkflowGraphPlan.");
  }
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
    workflowGraphPlanId: graph.id,
  });
}
