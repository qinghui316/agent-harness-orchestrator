import { z } from "zod";
import type { WorkflowGraphPlan } from "../types/index.js";
import type { WorkflowAuthoringPlan } from "./types.js";

const requiredString = z.string().refine((value) => value.trim().length > 0, "Value must not be empty.");

export const workflowAuthoringPlanSchema: z.ZodType<WorkflowAuthoringPlan> = z.object({
  version: z.literal("1.0"),
  mode: z.enum(["sequential-v1", "ready-set-v1"]),
  nodes: z.array(z.object({
    id: requiredString,
    title: requiredString,
    taskIds: z.array(requiredString).min(1),
    acIds: z.array(requiredString).min(1),
    prompt: requiredString,
    dependsOn: z.array(requiredString),
    sourceScopes: z.array(requiredString).min(1),
  }).strict()).min(1),
}).strict();

const workflowGraphPlanBaseSchema = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  changeId: z.string(),
  status: z.enum(["compiled", "superseded", "rejected"]),
  sourceArtifactHashes: z.record(z.string()),
  artifactRefs: z.array(z.string()),
  artifact: z.string(),
  markdownArtifact: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  authoringContractVersion: z.literal("1.0").optional(),
  planArtifactRef: z.string().optional(),
});

const workflowGraphStageSchema = z.enum(["coder", "validation", "audit", "bounded-rework"]);

const workflowGraphRecoveryKeyInputSchema = z.object({
  key: z.string(),
  value: z.union([z.string(), z.array(z.string())]),
});

const sequentialWorkflowGraphPlanSchema = workflowGraphPlanBaseSchema.extend({
  graphMode: z.literal("sequential-v1"),
  nodes: z.array(z.object({
    id: z.string(),
    taskId: z.string(),
    unitId: z.string(),
    title: z.string(),
    order: z.number(),
    stages: z.array(workflowGraphStageSchema),
    acIds: z.array(z.string()),
    sourceScopes: z.array(z.string()),
    taskIds: z.array(z.string()).optional(),
    prompt: z.string().optional(),
    dependsOn: z.array(z.string()).optional(),
  })),
  edges: z.array(z.object({
    from: z.string(),
    to: z.string(),
    kind: z.enum(["task-order", "stage-order"]),
  })),
});

const readySetWorkflowGraphPlanSchema = workflowGraphPlanBaseSchema.extend({
  graphMode: z.literal("ready-set-v1"),
  schedulerMode: z.literal("parallel-readiness-v1"),
  schedulerContractId: z.string(),
  schedulerDispatchDryRunId: z.string(),
  schedulerWorkerPlanId: z.string(),
  schedulerClaimReconcilePlanId: z.string(),
  nodes: z.array(z.object({
    id: z.string(),
    schedulerNodeId: z.string(),
    unitId: z.string(),
    taskIds: z.array(z.string()),
    title: z.string(),
    waveIndex: z.number(),
    stages: z.array(workflowGraphStageSchema),
    stageRefs: z.array(z.object({
      id: z.string(),
      stage: workflowGraphStageSchema,
      roleId: z.string(),
      adapterFamily: z.string(),
      status: z.enum(["planned", "blocked"]),
      sourceScopes: z.array(z.string()),
      recoveryKeyInputs: z.array(workflowGraphRecoveryKeyInputSchema),
      blockedReasons: z.array(z.string()),
    })),
    acIds: z.array(z.string()),
    sourceScopes: z.array(z.string()),
    claimIntentId: z.string(),
    plannedWorkerKey: z.string(),
    roleIds: z.array(z.string()),
    plannedSlotDemand: z.number(),
    sourceLocks: z.array(z.object({
      scope: z.string(),
      nodeId: z.string(),
      unitId: z.string(),
      waveIndex: z.number(),
      claimIntentId: z.string(),
      stageIds: z.array(z.string()),
    })),
    recoveryKeyInputs: z.array(workflowGraphRecoveryKeyInputSchema),
    status: z.enum(["planned", "blocked"]),
    blockedReasons: z.array(z.string()),
    prompt: z.string().optional(),
    dependsOn: z.array(z.string()).optional(),
  })),
  edges: z.array(z.object({
    from: z.string(),
    to: z.string(),
    kind: z.enum(["dependency", "synthesis", "stage-order"]),
  })),
  waves: z.array(z.object({
    index: z.number(),
    nodeIds: z.array(z.string()),
    claimIntentIds: z.array(z.string()),
    candidateCount: z.number(),
    blockedCount: z.number(),
    plannedSlotDemand: z.number(),
    blockedReasons: z.array(z.string()),
  })),
  plannedSlotDemand: z.number(),
  maxPlannedWaveWidth: z.number(),
  recoveryKeyCoverage: z.enum(["complete", "partial"]),
});

export const workflowGraphPlanSchema: z.ZodType<WorkflowGraphPlan> = z.discriminatedUnion("graphMode", [
  sequentialWorkflowGraphPlanSchema,
  readySetWorkflowGraphPlanSchema,
]);
