import { z } from "zod";

export const worktreeMetadataSchema = z.object({
  version: z.literal("1.0"),
  worktreeId: z.string(),
  projectId: z.string(),
  changeId: z.string(),
  runId: z.string().optional(),
  branchName: z.string(),
  baseRef: z.string(),
  baseCommit: z.string(),
  createdFromDirtyProject: z.boolean(),
  createdAt: z.string(),
  status: z.enum(["active", "applied"]),
  checkoutPath: z.string(),
  appliedAt: z.string().optional(),
  applyRunId: z.string().optional(),
  appliedCommit: z.string().optional(),
  worktreeDiffHash: z.string().optional(),
});

