import { z } from "zod";

export const harnessEngineeringModeSchema = z.enum([
  "onboard",
  "audit",
  "maintain-assigned-closeout",
  "evolve-assigned-window",
]);

const idSchema = z.string().trim().min(1).max(200);
const hashSchema = z.string().trim().min(1).max(256);

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
  allowedTargets: z.array(z.object({ targetId: idSchema, beforeHash: hashSchema }).strict()),
  requiredVerification: z.array(idSchema),
}).strict().superRefine((value, context) => {
  if ((value.mode === "maintain-assigned-closeout" || value.mode === "evolve-assigned-window") && !value.sourceWindowHash) {
    context.addIssue({ code: "custom", path: ["sourceWindowHash"], message: "Assigned maintenance and evolution modes require a source window hash." });
  }
  const targetIds = value.allowedTargets.map((target) => target.targetId);
  if (new Set(targetIds).size !== targetIds.length) {
    context.addIssue({ code: "custom", path: ["allowedTargets"], message: "Harness engineering assignment target IDs must be unique." });
  }
});

const evidenceSchema = z.object({ text: z.string().trim().min(1), evidenceRefs: z.array(idSchema).min(1) }).strict();
const decisionSchema = z.object({
  kind: z.enum(["promote", "retain", "merge", "retire", "archive-only"]),
  subject: z.string().trim().min(1),
  reason: z.string().trim().min(1),
  evidenceRefs: z.array(idSchema).min(1),
}).strict();
const patchOperationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("replacement"), replacement: z.string() }).strict(),
  z.object({ kind: z.literal("hunk"), oldText: z.string(), newText: z.string(), occurrence: z.number().int().positive().optional() }).strict(),
]);
const patchSchema = z.object({
  targetId: idSchema,
  beforeHash: hashSchema,
  afterHash: hashSchema,
  reason: z.string().trim().min(1),
  evidenceRefs: z.array(idSchema).min(1),
  operations: z.array(patchOperationSchema).min(1),
}).strict();

export const harnessEngineeringPatchPackageSchema = z.object({
  mode: harnessEngineeringModeSchema,
  assignmentId: idSchema,
  inputCheckpoint: hashSchema,
  policyVersion: idSchema,
  sourceWindowHash: hashSchema.nullable(),
  summary: z.string().trim().min(1),
  observations: z.array(evidenceSchema),
  decisions: z.array(decisionSchema),
  patches: z.array(patchSchema),
  context: z.object({ projectState: z.string(), uncertainty: z.array(z.string()), recommendations: z.array(z.string()) }).strict().nullable(),
  verificationRequests: z.array(idSchema),
  warnings: z.array(z.string()),
  status: z.enum(["ready", "noop", "blocked"]),
}).strict();

export type HarnessEngineeringAssignment = z.infer<typeof harnessEngineeringAssignmentSchema>;
export type HarnessEngineeringPatchPackage = z.infer<typeof harnessEngineeringPatchPackageSchema>;

export function parseHarnessEngineeringAssignment(value: unknown): HarnessEngineeringAssignment {
  return harnessEngineeringAssignmentSchema.parse(value);
}

export function parseHarnessEngineeringPatchPackage(
  assignment: HarnessEngineeringAssignment,
  value: unknown,
): HarnessEngineeringPatchPackage {
  const parsed = harnessEngineeringPatchPackageSchema.parse(value);
  if (parsed.mode !== assignment.mode || parsed.assignmentId !== assignment.assignmentId
    || parsed.inputCheckpoint !== assignment.inputCheckpoint || parsed.policyVersion !== assignment.policyVersion
    || parsed.sourceWindowHash !== assignment.sourceWindowHash) {
    throw new Error("Harness engineering package assignment lineage is stale or forged.");
  }
  const targets = new Map(assignment.allowedTargets.map((target) => [target.targetId, target.beforeHash]));
  const patchTargets = new Set<string>();
  const evidenceRefs = new Set([...assignment.evidenceRefs, ...assignment.currentDocumentRefs, ...assignment.currentStableMemoryRefs]);
  for (const patch of parsed.patches) {
    if (targets.get(patch.targetId) !== patch.beforeHash) throw new Error(`Harness engineering patch target is not allowed or is stale: ${patch.targetId}.`);
    if (patchTargets.has(patch.targetId)) throw new Error(`Duplicate Harness engineering patch target: ${patch.targetId}.`);
    patchTargets.add(patch.targetId);
  }
  for (const ref of [
    ...parsed.observations.flatMap((item) => item.evidenceRefs),
    ...parsed.decisions.flatMap((item) => item.evidenceRefs),
    ...parsed.patches.flatMap((item) => item.evidenceRefs),
  ]) {
    if (!evidenceRefs.has(ref)) throw new Error(`Harness engineering output references evidence outside the assignment: ${ref}.`);
  }
  const allowedVerification = new Set(assignment.requiredVerification);
  for (const request of parsed.verificationRequests) {
    if (!allowedVerification.has(request)) throw new Error(`Harness engineering verification request is outside the assignment: ${request}.`);
  }
  if (parsed.status !== "ready" && parsed.patches.length > 0) throw new Error("Only ready Harness engineering packages may contain patches.");
  if ((assignment.mode === "onboard" || assignment.mode === "audit") && !parsed.context) {
    throw new Error("Onboard and audit results require typed project context.");
  }
  return parsed;
}
