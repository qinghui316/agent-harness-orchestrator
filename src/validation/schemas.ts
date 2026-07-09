import { z } from "zod";

export const validationCommandSchema = z.object({
  name: z.string(),
  command: z.array(z.string()),
  cwd: z.string(),
  status: z.enum(["passed", "failed"]),
  exitCode: z.number().nullable(),
  signal: z.string().nullable(),
  startedAt: z.string(),
  finishedAt: z.string(),
  stdout: z.string(),
  stderr: z.string(),
});

export const validationResultSchema = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  runId: z.string(),
  changeId: z.string(),
  profile: z.string(),
  status: z.enum(["passed", "failed"]),
  executionMode: z.enum(["direct", "worktree"]),
  worktreeId: z.string().optional(),
  worktreeDiffHash: z.string().optional(),
  startedAt: z.string(),
  finishedAt: z.string(),
  commands: z.array(validationCommandSchema),
});
