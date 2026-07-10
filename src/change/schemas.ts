import { z } from "zod";

export const requiredChangeFiles = [
  "summary.md",
  "spec.md",
  "plan.md",
  "tasks.md",
  "reviews/review.md",
] as const;

export const changeMetadataSchema = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  title: z.string(),
  state: z.enum(["active", "archived"]),
  createdAt: z.string(),
  updatedAt: z.string(),
  closedAt: z.string().nullable(),
  archivePath: z.string().nullable(),
  originConversationId: z.string().optional(),
});
