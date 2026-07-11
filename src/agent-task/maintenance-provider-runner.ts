import { z } from "zod";
import { getRuntimeAssignedHarnessSkillContext, type EnabledSkillContext } from "../skill/catalog.js";
import type { MaintenanceDiffManifest, ManagedProject } from "../types/index.js";
import { parseHarnessEngineeringAssignment, type HarnessEngineeringAssignment } from "./harness-engineering-contract.js";
import { createMaintenanceDiffManifest } from "./maintenance-diff.js";

export type MaintenanceProviderRole = "maintenance-agent" | "evolution-agent" | "blind-reviewer";

export interface MaintenanceProviderExecutionRequest {
  project: ManagedProject;
  role: MaintenanceProviderRole;
  prompt: string;
  skillContext: EnabledSkillContext;
  parentThreadId: string | null;
  cwd: string;
  writable: boolean;
  signal?: AbortSignal;
}

export interface MaintenanceProviderExecutionResult {
  threadId: string;
  parentThreadId: string | null;
  finalText: string;
}

export type MaintenanceProviderExecutor = (
  request: MaintenanceProviderExecutionRequest,
) => Promise<MaintenanceProviderExecutionResult>;

export interface MaintenanceProviderReview {
  decision: "approve";
  assignmentId: string;
  manifestHash: string;
  summary: string;
  findings: string[];
}

export interface MaintenanceProviderRunEvidence {
  version: "2.0";
  assignmentId: string;
  mode: "maintain-assigned-closeout" | "evolve-assigned-window";
  manifestHash: string;
  manifest: MaintenanceDiffManifest;
  producer: {
    role: "maintenance-agent" | "evolution-agent";
    threadIds: string[];
    summary: string;
  };
  reviews: Array<MaintenanceProviderReview & {
    role: "blind-reviewer";
    threadId: string;
    parentThreadId: string;
  }>;
  quorum: { required: 1 | 2; approved: 1 | 2 };
  application: "not-applied";
}

export interface RunMaintenanceProviderAssignmentInput {
  project: ManagedProject;
  assignment: HarnessEngineeringAssignment;
  executor: MaintenanceProviderExecutor;
  getSkillContext?: typeof getRuntimeAssignedHarnessSkillContext;
  captureDiff?: typeof createMaintenanceDiffManifest;
  signal?: AbortSignal;
}

const reviewSchema = z.object({
  decision: z.enum(["approve", "revise", "block"]),
  assignmentId: z.string().trim().min(1),
  manifestHash: z.string().regex(/^[a-f0-9]{64}$/),
  summary: z.string().trim().min(1),
  findings: z.array(z.string().trim().min(1)),
}).strict();

export async function runMaintenanceProviderAssignment(
  input: RunMaintenanceProviderAssignmentInput,
): Promise<MaintenanceProviderRunEvidence> {
  const assignment = parseHarnessEngineeringAssignment(input.assignment);
  if (assignment.mode !== "maintain-assigned-closeout" && assignment.mode !== "evolve-assigned-window") {
    throw new Error("Maintenance provider runner only accepts assigned closeout or evolution modes.");
  }
  const skillContext = await (input.getSkillContext ?? getRuntimeAssignedHarnessSkillContext)(input.project, assignment);
  const producerRole = assignment.mode === "maintain-assigned-closeout" ? "maintenance-agent" : "evolution-agent";
  const required = assignment.mode === "evolve-assigned-window" ? 2 : 1;
  const producerThreadIds: string[] = [];
  let producerSummary = "";
  let revisionFindings: string[] = [];

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const producer = await input.executor({
      project: input.project,
      role: producerRole,
      prompt: buildProducerPrompt(assignment, skillContext, attempt, revisionFindings),
      skillContext,
      parentThreadId: null,
      cwd: assignment.workspace.workspaceRoot,
      writable: true,
      signal: input.signal,
    });
    assertThreadLineage(producer, null, "Maintenance provider producer");
    producerThreadIds.push(producer.threadId);
    producerSummary = producer.finalText.trim() || "Maintenance workspace editing completed.";

    const manifest = await (input.captureDiff ?? createMaintenanceDiffManifest)(assignment.workspace);
    const manifestHash = manifest.workspaceHash;
    const reviews = await runReviews(input, assignment, skillContext, producer.threadId, manifest, required);
    const blocked = reviews.find((review) => review.decision === "block");
    if (blocked) throw new MaintenanceReviewBlockedError(blocked.summary);
    const revise = reviews.find((review) => review.decision === "revise");
    if (revise) {
      if (attempt === 1) throw new MaintenanceReviewBlockedError("Maintenance diff still requires revision after the bounded revision attempt.");
      revisionFindings = reviews.flatMap((review) => review.decision === "revise" ? review.findings : []);
      continue;
    }
    const approved = reviews.map((review) => ({ ...review, decision: "approve" as const }));
    return {
      version: "2.0",
      assignmentId: assignment.assignmentId,
      mode: assignment.mode,
      manifestHash,
      manifest,
      producer: { role: producerRole, threadIds: producerThreadIds, summary: producerSummary },
      reviews: approved,
      quorum: { required, approved: required },
      application: "not-applied",
    };
  }
  throw new Error("Maintenance provider assignment exhausted its revision budget.");
}

async function runReviews(
  input: RunMaintenanceProviderAssignmentInput,
  assignment: HarnessEngineeringAssignment,
  skillContext: EnabledSkillContext,
  producerThreadId: string,
  manifest: MaintenanceDiffManifest,
  required: 1 | 2,
) {
  const prompt = buildBlindReviewPrompt(assignment, manifest);
  const results = await Promise.all(Array.from({ length: required }, () => input.executor({
    project: input.project,
    role: "blind-reviewer",
    prompt,
    skillContext,
    parentThreadId: producerThreadId,
    cwd: assignment.workspace.workspaceRoot,
    writable: false,
    signal: input.signal,
  })));
  const threadIds = new Set<string>();
  return results.map((result) => {
    if (!result.parentThreadId || result.parentThreadId === producerThreadId) {
      throw new Error("Blind reviewer must use an independent coordinator and child thread.");
    }
    if (result.threadId === producerThreadId || threadIds.has(result.threadId)) {
      throw new Error("Blind reviewers must use distinct child threads.");
    }
    threadIds.add(result.threadId);
    const review = reviewSchema.parse(parseJsonEnvelope(result.finalText, "Blind reviewer"));
    if (review.assignmentId !== assignment.assignmentId || review.manifestHash !== manifest.workspaceHash) {
      throw new Error("Blind review is stale or belongs to another assignment/diff.");
    }
    return { ...review, role: "blind-reviewer" as const, threadId: result.threadId, parentThreadId: result.parentThreadId };
  });
}

function buildProducerPrompt(
  assignment: HarnessEngineeringAssignment,
  skillContext: EnabledSkillContext,
  attempt: number,
  revisionFindings: string[],
): string {
  return [
    skillContext.promptSection,
    "",
    `Work directly in the assigned isolated maintenance workspace: ${assignment.workspace.workspaceRoot}`,
    `You may create, edit, move, or delete Markdown only inside: ${assignment.workspace.namespaces.join(", ")}.`,
    "Do not edit canonical memory, product source, scripts, policies, task state, or Git internals.",
    "Do not return a patch JSON envelope. Make the document changes in the workspace, then summarize the evidence and decisions in plain text.",
    attempt === 0
      ? "This is the initial editing pass."
      : `Reviewers requested the single bounded revision. Re-read the current workspace and address these findings:\n${revisionFindings.map((item) => `- ${item}`).join("\n")}`,
  ].join("\n");
}

function buildBlindReviewPrompt(assignment: HarnessEngineeringAssignment, manifest: MaintenanceDiffManifest): string {
  return [
    "You are an independent blind reviewer. Review only the assigned evidence boundary and exact Runtime-captured diff below.",
    "Do not edit files and do not infer another reviewer's conclusion.",
    "Assess semantic correctness, evidence support, document entropy, namespace safety, and whether the diff stays within the assigned mode.",
    "Return only JSON with decision (approve|revise|block), assignmentId, manifestHash, summary, and findings.",
    `Assignment: ${JSON.stringify(assignment)}`,
    `Manifest hash: ${manifest.workspaceHash}`,
    `Manifest metadata: ${JSON.stringify({ ...manifest, unifiedDiff: undefined })}`,
    "Exact unified diff:",
    manifest.unifiedDiff || "(no document changes)",
  ].join("\n");
}

function assertThreadLineage(result: MaintenanceProviderExecutionResult, expectedParent: string | null, label: string): void {
  if (!result.threadId.trim()) throw new Error(`${label} must record a provider thread id.`);
  if (result.parentThreadId !== expectedParent) throw new Error(`${label} parent/child thread lineage is invalid.`);
}

function parseJsonEnvelope(text: string, label: string): unknown {
  const match = text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  try { return JSON.parse(match?.[1] ?? text.trim()); }
  catch (error) { throw new Error(`${label} must return a JSON envelope: ${(error as Error).message}`); }
}

export class MaintenanceReviewBlockedError extends Error {}
