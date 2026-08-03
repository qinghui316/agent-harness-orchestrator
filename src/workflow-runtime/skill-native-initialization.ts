import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { hashFile, hashText } from "../workflow-artifacts/manager.js";
import { getGitCommit, getGitStatusShort } from "../project/git.js";
import type { SkillNativeWorkflowInitialization, SkillNativeWorkflowStartGate } from "../project-runtime/workflow-start.js";
import {
  buildTaskQueueRunFromGraph,
  persistTaskQueueRunFromGraph,
} from "../task-queue/queue-creation.js";
import { taskQueueItemPath, taskQueuePath } from "../task-queue/paths.js";
import type { TaskQueueItem, TaskQueueRun, TaskQueueWorkflowRun, WorkflowGraphRecoveryKey } from "../types/index.js";
import {
  buildWorkflowRunForGraph,
  persistWorkflowRunForGraph,
  readWorkflowRun,
} from "../workflow-run/manager.js";
import { workflowEventPath, workflowRunPath } from "../workflow-run/paths.js";

const acceptedTaskMapSchema = z.object({
  changeId: z.string().min(1),
  tasks: z.array(z.object({
    id: z.string().min(1),
    done: z.boolean().default(false),
  }).passthrough()),
}).passthrough();

export interface SkillNativeSequentialInitialization {
  workflowRun: TaskQueueWorkflowRun;
  queue: TaskQueueRun;
  items: TaskQueueItem[];
}

export interface SkillNativeSequentialInitializationPort {
  persistWorkflow(
    gate: SkillNativeWorkflowStartGate,
    workflow: TaskQueueWorkflowRun,
  ): Promise<void>;
  persistQueue(
    gate: SkillNativeWorkflowStartGate,
    workflow: TaskQueueWorkflowRun,
    created: { queue: TaskQueueRun; items: TaskQueueItem[] },
  ): Promise<void>;
}

const defaultPort: SkillNativeSequentialInitializationPort = {
  async persistWorkflow(gate, workflow) {
    await persistWorkflowRunForGraph(gate.runs, gate.project.id, workflow);
  },
  async persistQueue(gate, workflow, created) {
    await persistTaskQueueRunFromGraph(gate.runs, workflow, created);
  },
};

export async function initializeSkillNativeSequentialWorkflow(
  gate: SkillNativeWorkflowStartGate,
  port: SkillNativeSequentialInitializationPort = defaultPort,
): Promise<SkillNativeWorkflowInitialization<SkillNativeSequentialInitialization>> {
  if (gate.graph.graphMode !== "sequential-v1") {
    throw new Error("Skill-native sequential initialization requires a sequential-v1 WorkflowGraphPlan.");
  }
  const acceptedTasks = await readAcceptedTasks(gate);
  const recoveryKey = await buildRecoveryKey(gate);
  const workflow = buildWorkflowRunForGraph(gate.graph, recoveryKey);
  const created = buildTaskQueueRunFromGraph({
    project: gate.project,
    changeId: gate.changeId,
    workflow,
    workflowGraphPlanId: gate.graph.id,
    graphItems: gate.graph.nodes.map((node) => ({ taskId: node.taskId, order: node.order })),
    acceptedTasks,
  });
  const rollback = () => rollbackSequentialInitialization(gate, workflow, created);
  try {
    await port.persistWorkflow(gate, workflow);
    await port.persistQueue(gate, workflow, created);
    const persistedWorkflow = await readWorkflowRun(gate.runs, gate.changeId, workflow.id);
    if (persistedWorkflow.source !== "workflow-graph") {
      throw new Error("Skill-native sequential initialization persisted an unexpected WorkflowRun source.");
    }
    return {
      value: { workflowRun: persistedWorkflow, queue: created.queue, items: created.items },
      evidenceRefs: [
        runtimeArtifact(gate, workflowRunPath(gate.runs, gate.changeId, workflow.id)),
        runtimeArtifact(gate, taskQueuePath(gate.runs, gate.changeId, created.queue.id)),
        ...created.items.map((item) => runtimeArtifact(
          gate,
          taskQueueItemPath(gate.runs, gate.changeId, item.id),
        )),
      ],
      rollback,
    };
  } catch (error) {
    await rollback();
    throw error;
  }
}

async function readAcceptedTasks(gate: SkillNativeWorkflowStartGate) {
  const value = acceptedTaskMapSchema.parse(JSON.parse(await readFile(
    join(gate.evidenceRoot, "ac-map.json"),
    "utf8",
  )));
  if (value.changeId !== gate.changeId) throw new Error("Accepted task map Change scope is stale.");
  return value.tasks;
}

async function buildRecoveryKey(gate: SkillNativeWorkflowStartGate): Promise<WorkflowGraphRecoveryKey> {
  const acceptedArtifactHashes: Record<string, string> = {};
  for (const name of ["spec.md", "plan.md", "tasks.md", "ac-map.json"]) {
    acceptedArtifactHashes[name] = await hashFile(join(gate.evidenceRoot, name));
  }
  const [head, status] = await Promise.all([
    getGitCommit(gate.project.path).catch(() => null),
    getGitStatusShort(gate.project.path).catch(() => null),
  ]);
  const sourceHash = !head && !status
    ? `nogit:${hashText(gate.project.path)}`
    : hashText(JSON.stringify({ head, status: status?.slice().sort() ?? [] }));
  return {
    version: "1.0",
    changeId: gate.changeId,
    workflowGraphPlanId: gate.graph.id,
    acceptedArtifactHashes,
    workflowGraphPlanHash: await hashFile(join(
      gate.evidenceRoot,
      "planning",
      "workflow-graphs",
      `${gate.graph.id}.json`,
    )),
    sourceHash,
    policyHash: hashText("tool-policy-gate@workflow-graph"),
    capabilityHash: hashText(`local-runtime:${gate.graph.graphMode}:provider-worktree`),
    createdAt: new Date().toISOString(),
  };
}

async function rollbackSequentialInitialization(
  gate: SkillNativeWorkflowStartGate,
  workflow: TaskQueueWorkflowRun,
  created: { queue: TaskQueueRun; items: TaskQueueItem[] },
): Promise<void> {
  await Promise.all([
    rm(workflowRunPath(gate.runs, gate.changeId, workflow.id), { force: true }),
    rm(workflowEventPath(gate.runs, gate.changeId, workflow.id), { force: true }),
    rm(taskQueuePath(gate.runs, gate.changeId, created.queue.id), { force: true }),
    ...created.items.map((item) => rm(
      taskQueueItemPath(gate.runs, gate.changeId, item.id),
      { force: true },
    )),
  ]);
}

function runtimeArtifact(gate: SkillNativeWorkflowStartGate, absolutePath: string): string {
  const relative = absolutePath.slice(gate.runs.runsRoot.length).replace(/^[/\\]+/, "").replace(/\\/g, "/");
  return `runtime-sidecar:runs/${relative}`;
}
