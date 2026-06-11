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
import type { SchedulerClaimReconcilePlan, SchedulerContract, SchedulerDispatchDryRun, SchedulerLaunchPreflight, SchedulerRun, SchedulerWorkerSessionPlan } from "../../../workflow-scheduler/manager.js";
import type { SchedulerReconcileSnapshot, SchedulerRuntimeClaimReservation, SchedulerRuntimeState } from "../../../scheduler-runtime/manager.js";
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
  getSchedulerContractProjectionForPath,
  getSchedulerDispatchDryRunProjectionForPath,
  getSchedulerClaimReconcilePlanProjectionForPath,
  getSchedulerClaimReservationProjectionForPath,
  getSchedulerLaunchPreflightProjectionForPath,
  getSchedulerReconcileSnapshotProjectionForPath,
  getSchedulerRuntimeProjectionForPath,
  getSchedulerRunProjectionForPath,
  getSchedulerWorkerSessionPlanProjectionForPath,
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

export async function getWorkbenchSchedulerContractProjection(input: WorkbenchProjectInput, changeId: string, schedulerContractId?: string): Promise<SchedulerContract | null> {
  const memory = await resolveWorkbenchMemory(input);
  if (!memory.supported) return null;
  const topics = await listWorkbenchTopicsFromMemory(memory);
  const changePath = findWorkbenchTopicPath(topics, changeId);
  if (!changePath) return null;
  return getSchedulerContractProjectionForPath(memory, changePath, schedulerContractId);
}

export async function getWorkbenchSchedulerDispatchDryRunProjection(input: WorkbenchProjectInput, changeId: string, dryRunId?: string): Promise<SchedulerDispatchDryRun | null> {
  const memory = await resolveWorkbenchMemory(input);
  if (!memory.supported) return null;
  const topics = await listWorkbenchTopicsFromMemory(memory);
  const changePath = findWorkbenchTopicPath(topics, changeId);
  if (!changePath) return null;
  return getSchedulerDispatchDryRunProjectionForPath(memory, changePath, dryRunId);
}

export async function getWorkbenchSchedulerWorkerSessionPlanProjection(input: WorkbenchProjectInput, changeId: string, workerPlanId?: string): Promise<SchedulerWorkerSessionPlan | null> {
  const memory = await resolveWorkbenchMemory(input);
  if (!memory.supported) return null;
  const topics = await listWorkbenchTopicsFromMemory(memory);
  const changePath = findWorkbenchTopicPath(topics, changeId);
  if (!changePath) return null;
  return getSchedulerWorkerSessionPlanProjectionForPath(memory, changePath, workerPlanId);
}

export async function getWorkbenchSchedulerClaimReconcilePlanProjection(input: WorkbenchProjectInput, changeId: string, claimReconcilePlanId?: string): Promise<SchedulerClaimReconcilePlan | null> {
  const memory = await resolveWorkbenchMemory(input);
  if (!memory.supported) return null;
  const topics = await listWorkbenchTopicsFromMemory(memory);
  const changePath = findWorkbenchTopicPath(topics, changeId);
  if (!changePath) return null;
  return getSchedulerClaimReconcilePlanProjectionForPath(memory, changePath, claimReconcilePlanId);
}

export async function getWorkbenchSchedulerLaunchPreflightProjection(input: WorkbenchProjectInput, changeId: string, preflightId?: string): Promise<SchedulerLaunchPreflight | null> {
  const memory = await resolveWorkbenchMemory(input);
  if (!memory.supported) return null;
  const topics = await listWorkbenchTopicsFromMemory(memory);
  const changePath = findWorkbenchTopicPath(topics, changeId);
  if (!changePath) return null;
  return getSchedulerLaunchPreflightProjectionForPath(memory, changePath, preflightId);
}

export async function getWorkbenchSchedulerRunProjection(input: WorkbenchProjectInput, changeId: string, schedulerRunId?: string): Promise<SchedulerRun | null> {
  const memory = await resolveWorkbenchMemory(input);
  if (!memory.supported) return null;
  const topics = await listWorkbenchTopicsFromMemory(memory);
  const changePath = findWorkbenchTopicPath(topics, changeId);
  if (!changePath) return null;
  return getSchedulerRunProjectionForPath(memory, changePath, schedulerRunId);
}

export async function getWorkbenchSchedulerRuntimeProjection(input: WorkbenchProjectInput, changeId: string, schedulerRunId?: string): Promise<SchedulerRuntimeState | null> {
  if (!schedulerRunId) return null;
  const memory = await resolveWorkbenchMemory(input);
  if (!memory.supported) return null;
  const topics = await listWorkbenchTopicsFromMemory(memory);
  const changePath = findWorkbenchTopicPath(topics, changeId);
  if (!changePath) return null;
  return getSchedulerRuntimeProjectionForPath(memory, changePath, schedulerRunId);
}

export async function getWorkbenchSchedulerReconcileSnapshotProjection(input: WorkbenchProjectInput, changeId: string, snapshotId?: string, schedulerRunId?: string): Promise<SchedulerReconcileSnapshot | null> {
  if (!snapshotId) return null;
  const memory = await resolveWorkbenchMemory(input);
  if (!memory.supported) return null;
  const topics = await listWorkbenchTopicsFromMemory(memory);
  const changePath = findWorkbenchTopicPath(topics, changeId);
  if (!changePath) return null;
  return getSchedulerReconcileSnapshotProjectionForPath(memory, changePath, snapshotId, schedulerRunId);
}

export async function getWorkbenchSchedulerClaimReservationProjection(input: WorkbenchProjectInput, changeId: string, schedulerRunId?: string, reservationId?: string): Promise<SchedulerRuntimeClaimReservation | null> {
  if (!schedulerRunId || !reservationId) return null;
  const memory = await resolveWorkbenchMemory(input);
  if (!memory.supported) return null;
  const topics = await listWorkbenchTopicsFromMemory(memory);
  const changePath = findWorkbenchTopicPath(topics, changeId);
  if (!changePath) return null;
  return getSchedulerClaimReservationProjectionForPath(memory, changePath, schedulerRunId, reservationId);
}

export async function getWorkbenchWorkflowRunProjection(input: WorkbenchProjectInput, changeId: string, workflowRunId: string): Promise<Awaited<ReturnType<typeof getWorkflowRunProjectionForChange>> | null> {
  const memory = await resolveWorkbenchMemory(input);
  if (!memory.supported) return null;
  const topics = await listWorkbenchTopicsFromMemory(memory);
  const changePath = findWorkbenchTopicPath(topics, changeId);
  if (!changePath) return null;
  return getWorkflowRunProjectionForChange(memory, changeId, workflowRunId);
}
