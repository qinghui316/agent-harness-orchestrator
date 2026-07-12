import { z } from "zod";

export const harnessEngineeringModeSchema = z.enum([
  "onboard",
  "audit",
  "maintain-assigned-closeout",
  "evolve-assigned-window",
]);

const textSchema = z.string().trim().min(1).max(2_000);
const rootSchema = z.string().trim().min(1).max(32_000);
const sourceWindowSchema = z.object({
  hash: textSchema,
  evidenceRefs: z.array(textSchema).min(1),
}).strict();
const verificationSchema = z.object({
  name: textSchema,
  command: z.array(textSchema).min(1),
}).strict();

export const harnessEngineeringAssignmentSchema = z.object({
  mode: harnessEngineeringModeSchema,
  taskId: textSchema,
  projectRoot: rootSchema,
  memoryRoot: rootSchema,
  evidenceRefs: z.array(textSchema).min(1),
  sourceWindow: sourceWindowSchema.optional(),
  requiredVerification: z.array(verificationSchema),
}).strict().superRefine((value, context) => {
  if (value.mode === "evolve-assigned-window" && !value.sourceWindow) {
    context.addIssue({ code: "custom", path: ["sourceWindow"], message: "Evolution requires its Runtime-assigned source window." });
  }
  if (value.mode !== "evolve-assigned-window" && value.sourceWindow) {
    context.addIssue({ code: "custom", path: ["sourceWindow"], message: "Only Evolution accepts a source window." });
  }
});

export type HarnessEngineeringAssignment = z.infer<typeof harnessEngineeringAssignmentSchema>;

export function parseHarnessEngineeringAssignment(value: unknown): HarnessEngineeringAssignment {
  return harnessEngineeringAssignmentSchema.parse(value);
}
