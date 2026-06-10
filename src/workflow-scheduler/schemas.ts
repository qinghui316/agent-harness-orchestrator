import { z } from "zod";
import type { SchedulerContract } from "./types.js";

export const schedulerContractSchema: z.ZodType<SchedulerContract> = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  changeId: z.string(),
  status: z.enum(["compiled", "superseded", "rejected"]),
  schedulerMode: z.literal("parallel-readiness-v1"),
  decompositionPlanId: z.string(),
  readinessManifestId: z.string(),
  nodes: z.array(z.object({
    id: z.string(),
    unitId: z.string(),
    taskIds: z.array(z.string()),
    acIds: z.array(z.string()),
    title: z.string(),
    sourceScopes: z.array(z.string()),
    stages: z.array(z.enum(["coder", "validation", "audit", "bounded-rework"])),
  })),
  edges: z.array(z.object({
    from: z.string(),
    to: z.string(),
    kind: z.enum(["dependency", "synthesis"]),
  })),
  waves: z.array(z.object({
    index: z.number(),
    nodeIds: z.array(z.string()),
  })),
  conflictScopes: z.array(z.string()),
  sourceArtifactHashes: z.record(z.string()),
  artifactRefs: z.array(z.string()),
  artifact: z.string(),
  markdownArtifact: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
