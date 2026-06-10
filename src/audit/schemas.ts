import { z } from "zod";

export const auditFindingSchema = z.object({
  severity: z.enum(["blocking", "note"]),
  area: z.string(),
  evidence: z.string(),
  recommendation: z.string(),
  text: z.string(),
});

export const auditResultSchema = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  runId: z.string(),
  changeId: z.string(),
  status: z.enum(["approved", "approved-with-notes", "blocked", "failed"]),
  worktreeId: z.string().optional(),
  validationId: z.string().optional(),
  worktreeDiffHash: z.string().optional(),
  startedAt: z.string(),
  finishedAt: z.string(),
  findings: z.array(auditFindingSchema),
  artifacts: z.object({
    audit: z.string(),
    auditMarkdown: z.string(),
    lastMessage: z.string(),
    diff: z.string().optional(),
    diffStat: z.string().optional(),
  }),
});
