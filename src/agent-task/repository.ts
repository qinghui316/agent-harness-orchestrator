import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { readJsonFile, writeJsonFile } from "../fs/json.js";
import type {
  AgentTask,
  AgentTaskCreatedBy,
  AgentTaskKind,
  AgentTaskResult,
  AgentTaskStatus,
  ResolvedMemory,
} from "../types/index.js";
import { resultSchema, taskSchema } from "./schemas.js";
import { taskPath, taskResultPath, tasksRoot } from "./paths.js";

export interface CreateAgentTaskInput {
  conversationId: string;
  changeId: string;
  roleId: string;
  kind: AgentTaskKind;
  summary: string;
  inputArtifacts?: string[];
  parentTaskId?: string;
  createdBy?: AgentTaskCreatedBy;
  initialStatus?: Extract<AgentTaskStatus, "queued" | "running">;
}

export interface CompleteAgentTaskInput {
  status: AgentTaskStatus;
  summary: string;
  artifactRefs?: string[];
  policyAuditRefs?: string[];
  boundaryAuditRefs?: string[];
  boundaryViolations?: AgentTaskResult["boundaryViolations"];
  nextRecommendation?: string;
  failureClassification?: string;
  requiresUserInputReason?: string;
}

export async function createAgentTask(memory: ResolvedMemory, input: CreateAgentTaskInput): Promise<AgentTask> {
  const now = new Date().toISOString();
  const id = buildTaskId(input.changeId, input.roleId);
  const initialStatus = input.initialStatus ?? "queued";
  const task: AgentTask = {
    version: "1.0",
    id,
    projectId: memory.projectId,
    conversationId: input.conversationId,
    changeId: input.changeId,
    roleId: input.roleId,
    kind: input.kind,
    status: initialStatus,
    inputArtifacts: input.inputArtifacts ?? [],
    outputArtifacts: [],
    ...(input.parentTaskId ? { parentTaskId: input.parentTaskId } : {}),
    createdBy: input.createdBy ?? (input.kind === "background" ? "maintenance-policy" : "main-agent-policy"),
    summary: input.summary,
    createdAt: now,
    updatedAt: now,
    startedAt: initialStatus === "running" ? now : null,
    finishedAt: null,
  };
  await writeTask(memory, task);
  return task;
}

export async function claimAgentTask(memory: ResolvedMemory, task: AgentTask): Promise<AgentTask> {
  const now = new Date().toISOString();
  const claimed: AgentTask = {
    ...task,
    status: "claimed",
    updatedAt: now,
  };
  await writeTask(memory, claimed);
  return claimed;
}

export async function startAgentTask(memory: ResolvedMemory, task: AgentTask): Promise<AgentTask> {
  const now = new Date().toISOString();
  const running: AgentTask = {
    ...task,
    status: "running",
    updatedAt: now,
    startedAt: task.startedAt ?? now,
  };
  await writeTask(memory, running);
  return running;
}

export async function completeAgentTask(memory: ResolvedMemory, task: AgentTask, input: CompleteAgentTaskInput): Promise<AgentTaskResult> {
  const now = new Date().toISOString();
  const result: AgentTaskResult = {
    version: "1.0",
    taskId: task.id,
    roleId: task.roleId,
    status: input.status,
    summary: input.summary,
    artifactRefs: input.artifactRefs ?? [],
    ...(input.policyAuditRefs?.length ? { policyAuditRefs: input.policyAuditRefs } : {}),
    ...(input.boundaryAuditRefs?.length ? { boundaryAuditRefs: input.boundaryAuditRefs } : {}),
    ...(input.boundaryViolations?.length ? { boundaryViolations: input.boundaryViolations } : {}),
    ...(input.nextRecommendation ? { nextRecommendation: input.nextRecommendation } : {}),
    ...(input.failureClassification ? { failureClassification: input.failureClassification } : {}),
    ...(input.requiresUserInputReason ? { requiresUserInputReason: input.requiresUserInputReason } : {}),
    createdAt: now,
  };
  const completed: AgentTask = {
    ...task,
    status: input.status,
    outputArtifacts: result.artifactRefs,
    summary: input.summary,
    updatedAt: now,
    finishedAt: now,
  };
  await writeTask(memory, completed);
  await writeJsonFile(taskResultPath(memory, task.id), result);
  return result;
}

export async function listAgentTasks(memory: ResolvedMemory, changeId?: string): Promise<AgentTask[]> {
  const root = tasksRoot(memory);
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const tasks: AgentTask[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const task = await readJsonFile(taskPath(memory, entry.name), taskSchema, null as unknown as AgentTask).catch(() => null);
    if (task && (!changeId || task.changeId === changeId)) tasks.push(task);
  }
  return tasks.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function readAgentTaskResult(memory: ResolvedMemory, taskId: string): Promise<AgentTaskResult | null> {
  if (!existsSync(taskResultPath(memory, taskId))) return null;
  return readJsonFile(taskResultPath(memory, taskId), resultSchema, null as unknown as AgentTaskResult).catch(() => null);
}

export function writeTask(memory: ResolvedMemory, task: AgentTask): Promise<void> {
  taskSchema.parse(task);
  return writeJsonFile(taskPath(memory, task.id), task);
}

function buildTaskId(changeId: string, roleId: string): string {
  const safeChange = changeId.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 48);
  const safeRole = roleId.replace(/[^a-zA-Z0-9._-]+/g, "-");
  return `agtask-${Date.now()}-${safeRole}-${safeChange}-${Math.random().toString(16).slice(2, 8)}`;
}
