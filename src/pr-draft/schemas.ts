import { z } from "zod";
import type { PrDraftRevision } from "../types/index.js";
import type { PrDraftPackage } from "./types.js";

export const prDraftRevisionSchema: z.ZodType<PrDraftRevision> = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  prDraftPackageId: z.string(),
  previousLandingPackageId: z.string(),
  landingPackageId: z.string(),
  projectId: z.string().nullable(),
  branchName: z.string(),
  prUrl: z.string().optional(),
  commitHash: z.string().optional(),
  artifactRefs: z.array(z.string()),
  createdAt: z.string(),
});

export const prDraftPackageSchema: z.ZodType<PrDraftPackage> = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  landingPackageId: z.string(),
  projectId: z.string().nullable(),
  provider: z.literal("github-cli"),
  status: z.enum(["prepared", "created"]),
  title: z.string(),
  bodyArtifact: z.string(),
  packageArtifact: z.string(),
  remoteName: z.string().optional(),
  remoteUrl: z.string().optional(),
  baseBranch: z.string().nullable().optional(),
  branchName: z.string(),
  prUrl: z.string().optional(),
  landingEvidenceRefs: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});
