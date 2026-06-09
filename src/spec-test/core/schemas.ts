import { z } from "zod";

export const specTestRefSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("file"), path: z.string() }),
  z.object({ type: z.literal("testName"), name: z.string(), path: z.string() }),
  z.object({ type: z.literal("command"), commandName: z.string() }),
  z.object({ type: z.literal("note"), text: z.string() }),
]);

export const specTestMappingSchema = z.object({
  acId: z.string(),
  refs: z.array(specTestRefSchema),
});

export const specTestsSchema = z.object({
  version: z.literal("1.0"),
  changeId: z.string(),
  updatedAt: z.string(),
  mappings: z.array(specTestMappingSchema),
});
