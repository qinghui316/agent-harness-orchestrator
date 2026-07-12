import { z } from "zod";

export const harnessEngineeringModeSchema = z.enum([
  "onboard",
  "audit",
  "maintain-assigned-closeout",
  "evolve-assigned-window",
]);

const idSchema = z.string().trim().min(1).max(300);
const hashSchema = z.string().trim().min(1).max(256);
const canonicalTargetSchema = z.object({
  version: z.literal("1.0"),
  assignmentId: idSchema,
  mode: z.literal("canonical-direct"),
  memoryMode: z.enum(["repo-local", "external-local"]),
  baseRoot: idSchema,
  namespaces: z.array(idSchema).min(1),
  additionalSources: z.array(z.object({
    key: z.literal("project"),
    root: idSchema,
    namespaces: z.array(idSchema).min(1),
  }).strict()).optional(),
}).strict();

export const harnessEngineeringAssignmentSchema = z.object({
  mode: harnessEngineeringModeSchema,
  projectId: idSchema,
  assignmentId: idSchema,
  inputCheckpoint: hashSchema,
  policyVersion: idSchema,
  sourceWindowHash: hashSchema.nullable(),
  evidenceRefs: z.array(idSchema).min(1),
  currentDocumentRefs: z.array(idSchema),
  currentStableMemoryRefs: z.array(idSchema),
  canonicalTarget: canonicalTargetSchema,
  namespaceClasses: z.array(z.enum(["content", "control-plane"])).min(1),
  requiredVerification: z.array(idSchema),
}).strict().superRefine((value, context) => {
  if ((value.mode === "maintain-assigned-closeout" || value.mode === "evolve-assigned-window") && !value.sourceWindowHash) {
    context.addIssue({ code: "custom", path: ["sourceWindowHash"], message: "Assigned maintenance and evolution modes require a source window hash." });
  }
  if (value.canonicalTarget.assignmentId !== value.assignmentId) {
    context.addIssue({ code: "custom", path: ["canonicalTarget", "assignmentId"], message: "Canonical maintenance target must belong to the assignment." });
  }
});

export type HarnessEngineeringAssignment = z.infer<typeof harnessEngineeringAssignmentSchema>;

export function parseHarnessEngineeringAssignment(value: unknown): HarnessEngineeringAssignment {
  return harnessEngineeringAssignmentSchema.parse(value);
}
