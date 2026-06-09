import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type {
  DecompositionPlan,
  DecompositionReadinessManifest,
  TaskQueueProposal,
  WorkflowGraphPlan,
} from "../../../workflow-artifacts/manager.js";
import type { ResolvedMemory } from "../../../types/index.js";
import type { WorkbenchPlanningArtifactBundle, WorkbenchProjectInput } from "../../read-model-types.js";
import { resolveWorkbenchMemory } from "./support.js";
import { listWorkbenchTopicsFromMemory } from "./topics.js";
import {
  findWorkbenchTopicPath,
  getDecompositionPlanProjectionForPath,
  getDecompositionReadinessProjectionForPath,
  getTaskQueueProposalProjectionForPath,
  getWorkflowGraphPlanProjectionForPath,
  getWorkflowRunProjectionForChange,
} from "../typed-workflow.js";

const planningBundleProjectionSchema = z.object({
  id: z.string(),
  status: z.enum(["draft", "confirmed"]),
  goal: z.string(),
  constraints: z.array(z.string()).default([]),
  acceptanceCriteria: z.array(z.string()).default([]),
  design: z.string().default(""),
  tasks: z.array(z.object({ id: z.string(), title: z.string(), acIds: z.array(z.string()).default([]) })).default([]),
  risks: z.array(z.string()).default([]),
  openQuestions: z.array(z.string()).default([]),
  artifact: z.string().optional(),
  updatedAt: z.string().optional(),
});

export async function readLatestPlanningBundleProjection(memory: ResolvedMemory, changePath: string): Promise<WorkbenchPlanningArtifactBundle | null> {
  const path = join(memory.memoryRoot, changePath, "planning", "latest-bundle.json");
  if (!existsSync(path)) return null;
  const content = await readFile(path, "utf8").catch(() => "");
  if (!content.trim()) return null;
  const parsed = planningBundleProjectionSchema.safeParse(JSON.parse(content));
  if (!parsed.success) return null;
  return parsed.data;
}

export async function getWorkbenchDecompositionPlanProjection(input: WorkbenchProjectInput, changeId: string): Promise<DecompositionPlan | null> {
  const memory = await resolveWorkbenchMemory(input);
  if (!memory.supported) return null;
  const topics = await listWorkbenchTopicsFromMemory(memory);
  const changePath = findWorkbenchTopicPath(topics, changeId);
  if (!changePath) return null;
  return getDecompositionPlanProjectionForPath(memory, changePath);
}

export async function getWorkbenchDecompositionReadinessProjection(input: WorkbenchProjectInput, changeId: string): Promise<DecompositionReadinessManifest | null> {
  const memory = await resolveWorkbenchMemory(input);
  if (!memory.supported) return null;
  const topics = await listWorkbenchTopicsFromMemory(memory);
  const changePath = findWorkbenchTopicPath(topics, changeId);
  if (!changePath) return null;
  return getDecompositionReadinessProjectionForPath(memory, changePath);
}

export async function getWorkbenchTaskQueueProposalProjection(input: WorkbenchProjectInput, changeId: string): Promise<TaskQueueProposal | null> {
  const memory = await resolveWorkbenchMemory(input);
  if (!memory.supported) return null;
  const topics = await listWorkbenchTopicsFromMemory(memory);
  const changePath = findWorkbenchTopicPath(topics, changeId);
  if (!changePath) return null;
  return getTaskQueueProposalProjectionForPath(memory, changePath);
}

export async function getWorkbenchWorkflowGraphPlanProjection(input: WorkbenchProjectInput, changeId: string, workflowGraphPlanId?: string): Promise<WorkflowGraphPlan | null> {
  const memory = await resolveWorkbenchMemory(input);
  if (!memory.supported) return null;
  const topics = await listWorkbenchTopicsFromMemory(memory);
  const changePath = findWorkbenchTopicPath(topics, changeId);
  if (!changePath) return null;
  return getWorkflowGraphPlanProjectionForPath(memory, changePath, workflowGraphPlanId);
}

export async function getWorkbenchWorkflowRunProjection(input: WorkbenchProjectInput, changeId: string, workflowRunId: string): Promise<Awaited<ReturnType<typeof getWorkflowRunProjectionForChange>> | null> {
  const memory = await resolveWorkbenchMemory(input);
  if (!memory.supported) return null;
  const topics = await listWorkbenchTopicsFromMemory(memory);
  const changePath = findWorkbenchTopicPath(topics, changeId);
  if (!changePath) return null;
  return getWorkflowRunProjectionForChange(memory, changeId, workflowRunId);
}
