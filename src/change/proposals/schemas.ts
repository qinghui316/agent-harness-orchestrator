import { z } from "zod";

export const specProposalSchema = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  runId: z.string(),
  changeId: z.string(),
  status: z.enum(["proposed", "blocked", "failed"]),
  startedAt: z.string(),
  finishedAt: z.string(),
  targetHashes: z.object({ spec: z.string().optional(), plan: z.string().optional(), tasks: z.string().optional() }),
  specMd: z.string(),
  openQuestions: z.array(z.string()),
  assumptions: z.array(z.string()),
  warnings: z.array(z.string()),
  artifacts: z.object({
    proposal: z.string(),
    proposalMarkdown: z.string(),
    lastMessage: z.string(),
  }),
});

export const planProposalSchema = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  runId: z.string(),
  changeId: z.string(),
  status: z.enum(["proposed", "blocked", "failed"]),
  startedAt: z.string(),
  finishedAt: z.string(),
  targetHashes: z.object({ spec: z.string().optional(), plan: z.string().optional(), tasks: z.string().optional() }),
  planMd: z.string(),
  tasksMd: z.string(),
  openQuestions: z.array(z.string()),
  assumptions: z.array(z.string()),
  warnings: z.array(z.string()),
  artifacts: z.object({
    proposal: z.string(),
    proposalMarkdown: z.string(),
    lastMessage: z.string(),
  }),
});

export const specModelOutputSchema = z.object({
  status: z.enum(["proposed", "blocked", "failed"]),
  specMd: z.string().default(""),
  openQuestions: z.array(z.string()).default([]),
  assumptions: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
});

export const planModelOutputSchema = z.object({
  status: z.enum(["proposed", "blocked", "failed"]),
  planMd: z.string().default(""),
  tasksMd: z.string().default(""),
  openQuestions: z.array(z.string()).default([]),
  assumptions: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
});

export const runMetadataSchema = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  changeId: z.string(),
  projectPath: z.string(),
  runtime: z.string(),
  executionMode: z.enum(["direct", "worktree"]).optional(),
  proposalOnly: z.boolean().optional(),
  command: z.array(z.string()),
  status: z.enum(["created", "running", "completed", "failed"]),
  exitCode: z.number().nullable(),
  signal: z.string().nullable(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  artifacts: z.record(z.string(), z.unknown()),
});
