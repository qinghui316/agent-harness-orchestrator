import { z } from "zod";
import { getRuntimeAssignedHarnessSkillContext, type EnabledSkillContext } from "../skill/catalog.js";
import type { ManagedProject } from "../types/index.js";
import { parseHarnessEngineeringAssignment, type HarnessEngineeringAssignment } from "./harness-engineering-contract.js";

export type MaintenanceProviderRole = "maintenance-agent" | "evolution-agent" | "evolution-scorer";

export interface MaintenanceProviderExecutionRequest {
  project: ManagedProject;
  role: MaintenanceProviderRole;
  prompt: string;
  skillContext: EnabledSkillContext;
  parentThreadId: string | null;
  cwd: string;
  writable: boolean;
  writableRoots?: string[];
  existingThreadId?: string | null;
  signal?: AbortSignal;
}

export interface MaintenanceProviderExecutionResult {
  threadId: string;
  parentThreadId: string | null;
  finalText: string;
  changedFiles: string[];
}

export type MaintenanceProviderExecutor = (
  request: MaintenanceProviderExecutionRequest,
) => Promise<MaintenanceProviderExecutionResult>;

export interface MaintenanceProviderRunEvidence {
  version: "3.0";
  assignmentId: string;
  mode: "maintain-assigned-closeout" | "evolve-assigned-window";
  canonicalRoot: string;
  producer: { role: "maintenance-agent" | "evolution-agent"; threadIds: string[]; summary: string };
  scoring?: { role: "evolution-scorer"; threadId: string; parentThreadId: string; score: number; dimensions: Record<string, number>; hardIssues: string[]; summary: string };
  application: "direct-canonical-edit";
}

export interface RunMaintenanceProviderAssignmentInput {
  project: ManagedProject;
  assignment: HarnessEngineeringAssignment;
  executor: MaintenanceProviderExecutor;
  getSkillContext?: typeof getRuntimeAssignedHarnessSkillContext;
  signal?: AbortSignal;
}

const scoreSchema = z.object({
  score: z.number().int().min(0).max(100),
  dimensions: z.object({
    evidenceGrounding: z.number().int().min(0).max(30),
    projectRelevance: z.number().int().min(0).max(25),
    mechanicalEnforceability: z.number().int().min(0).max(15),
    regressionSafety: z.number().int().min(0).max(20),
    contextCost: z.number().int().min(0).max(10),
  }).strict(),
  hardIssues: z.array(z.string()),
  summary: z.string().trim().min(1),
}).strict().superRefine((value, context) => {
  const total = Object.values(value.dimensions).reduce((sum, item) => sum + item, 0);
  if (total !== value.score) context.addIssue({ code: "custom", path: ["score"], message: "Evolution score must equal its dimensions." });
});

export async function runMaintenanceProviderAssignment(
  input: RunMaintenanceProviderAssignmentInput,
): Promise<MaintenanceProviderRunEvidence> {
  const assignment = parseHarnessEngineeringAssignment(input.assignment);
  if (assignment.mode !== "maintain-assigned-closeout" && assignment.mode !== "evolve-assigned-window") {
    throw new Error("Maintenance provider runner only accepts assigned closeout or evolution modes.");
  }
  const skillContext = await (input.getSkillContext ?? getRuntimeAssignedHarnessSkillContext)(input.project, assignment);
  const canonicalRoot = assignment.canonicalTarget.baseRoot;
  const targets = canonicalTargets(assignment);

  if (assignment.mode === "maintain-assigned-closeout") {
    const results = [];
    for (const target of targets) {
      const result = await input.executor({
        project: input.project, role: "maintenance-agent",
        prompt: buildMaintenancePrompt(assignment, target), skillContext,
        parentThreadId: null, cwd: target.root, writable: true,
        writableRoots: writableRoots(target), signal: input.signal,
      });
      assertThreadLineage(result, null, "Maintenance Agent");
      assertChangedFilesInsideTarget(result.changedFiles, target);
      results.push(result);
    }
    return {
      version: "3.0",
      assignmentId: assignment.assignmentId,
      mode: assignment.mode,
      canonicalRoot,
      producer: { role: "maintenance-agent", threadIds: results.map((result) => result.threadId), summary: summarize(results, "Canonical Markdown maintenance completed.") },
      application: "direct-canonical-edit",
    };
  }

  let proposal = await input.executor({
    project: input.project,
    role: "evolution-agent",
    prompt: buildEvolutionProposalPrompt(assignment),
    skillContext,
    parentThreadId: null,
    cwd: canonicalRoot,
    writable: false,
    signal: input.signal,
  });
  assertThreadLineage(proposal, null, "Evolution proposal Agent");
  let scoringResult: MaintenanceProviderExecutionResult | null = null;
  let score: z.infer<typeof scoreSchema> | null = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    scoringResult = await input.executor({
      project: input.project, role: "evolution-scorer",
      prompt: buildScoringPrompt(assignment, proposal.finalText), skillContext,
      parentThreadId: proposal.threadId, existingThreadId: proposal.threadId,
      cwd: canonicalRoot, writable: false, signal: input.signal,
    });
    if (scoringResult.parentThreadId !== proposal.threadId || scoringResult.threadId === proposal.threadId) {
      throw new Error("Evolution scorer must be a native child of the proposal thread.");
    }
    score = scoreSchema.parse(parseJsonEnvelope(scoringResult.finalText, "Evolution scorer"));
    if (score.score >= 80 && score.hardIssues.length === 0) break;
    if (attempt === 2) throw new EvolutionScoreBlockedError(`Evolution proposal scored ${score.score} or retained hard issues after revision.`);
    const revised = await input.executor({
      project: input.project, role: "evolution-agent",
      prompt: buildEvolutionRevisionPrompt(proposal.finalText, score), skillContext,
      parentThreadId: null, existingThreadId: proposal.threadId,
      cwd: canonicalRoot, writable: false, signal: input.signal,
    });
    if (revised.threadId !== proposal.threadId) throw new Error("Evolution revision must continue the proposal thread.");
    proposal = revised;
  }
  if (!scoringResult || !score) throw new Error("Evolution scoring did not produce a result.");

  const applied = [];
  for (const target of targets) {
    const result = await input.executor({
      project: input.project, role: "evolution-agent",
      prompt: buildEvolutionApplyPrompt(assignment, proposal.finalText, score, target), skillContext,
      parentThreadId: null, existingThreadId: proposal.threadId,
      cwd: target.root, writable: true, writableRoots: writableRoots(target), signal: input.signal,
    });
    if (result.threadId !== proposal.threadId) throw new Error("Evolution apply must continue the accepted proposal thread.");
    assertChangedFilesInsideTarget(result.changedFiles, target);
    applied.push(result);
  }
  return {
    version: "3.0",
    assignmentId: assignment.assignmentId,
    mode: assignment.mode,
    canonicalRoot,
    producer: { role: "evolution-agent", threadIds: [proposal.threadId, ...applied.map((result) => result.threadId)], summary: summarize(applied, "Canonical Harness evolution completed.") },
    scoring: { role: "evolution-scorer", threadId: scoringResult.threadId, parentThreadId: proposal.threadId, ...score },
    application: "direct-canonical-edit",
  };
}

interface CanonicalTarget { root: string; namespaces: string[] }

function canonicalTargets(assignment: HarnessEngineeringAssignment): CanonicalTarget[] {
  return [
    { root: assignment.canonicalTarget.baseRoot, namespaces: assignment.canonicalTarget.namespaces },
    ...(assignment.canonicalTarget.additionalSources ?? []).map((source) => ({ root: source.root, namespaces: source.namespaces })),
  ];
}

function buildMaintenancePrompt(assignment: HarnessEngineeringAssignment, target: CanonicalTarget): string {
  return ["Use $aho-harness-engineering in maintain-assigned-closeout mode.",
    `Task: ${assignment.assignmentId}`,
    `Evidence: ${assignment.evidenceRefs.join(", ")}`,
    `Edit canonical project Markdown directly under ${target.root}.`,
    `This turn's writable Markdown namespaces: ${target.namespaces.join(", ")}.`,
    "Use only the assigned close evidence. Do not create a proposal, reviewer, diff manifest, patch envelope, or apply transaction.",
    "Do not edit product source, generated indexes, task state, or paths outside the assigned namespaces.",
    "Re-read changed files and return a concise summary."].join("\n");
}

function buildEvolutionProposalPrompt(assignment: HarnessEngineeringAssignment): string {
  return ["Use $aho-harness-engineering in evolve-assigned-window mode.",
    `Task: ${assignment.assignmentId}`,
    `Fixed window: ${assignment.sourceWindowHash}`,
    `Evidence: ${assignment.evidenceRefs.join(", ")}`,
    "Analyze exactly the assigned five-close evolution window and write a concrete proposal in your final response.",
    "This pass is read-only. Do not edit files. Include target Markdown paths, evidence, intended rule delta, and validation."].join("\n");
}

function buildScoringPrompt(assignment: HarnessEngineeringAssignment, proposal: string): string {
  return ["Independently score the bounded Harness evolution proposal against its assigned five-close window.",
    "Check evidence support, target ownership, minimality, non-duplication, and mechanical verifiability.",
    "Score evidenceGrounding/30, projectRelevance/25, mechanicalEnforceability/15, regressionSafety/20, and contextCost/10.",
    "Return only JSON with score, dimensions, hardIssues, and summary.",
    `Assignment id: ${assignment.assignmentId}`, "Proposal:", proposal].join("\n");
}

function buildEvolutionApplyPrompt(
  assignment: HarnessEngineeringAssignment,
  proposal: string,
  score: z.infer<typeof scoreSchema>,
  target: CanonicalTarget,
): string {
  return ["Continue using $aho-harness-engineering in evolve-assigned-window mode.",
    `Task: ${assignment.assignmentId}`,
    `The native scorer accepted this proposal with score ${score.score}: ${score.summary}`,
    "Apply the accepted proposal directly to canonical target Markdown now.",
    `Canonical root for this turn: ${target.root}.`,
    `This turn's writable Markdown namespaces: ${target.namespaces.join(", ")}.`,
    "Do not create a diff manifest, reviewer package, or apply transaction.", "Accepted proposal:", proposal].join("\n");
}

function buildEvolutionRevisionPrompt(proposal: string, score: z.infer<typeof scoreSchema>): string {
  return [
    "Revise the evolution proposal once using the independent scorer evidence. Do not edit target files yet.",
    `Score: ${score.score}. Hard issues: ${score.hardIssues.join("; ") || "none"}.`,
    `Scorer summary: ${score.summary}`,
    "Previous proposal:", proposal,
  ].join("\n");
}

function writableRoots(target: CanonicalTarget): string[] {
  return target.namespaces.map((namespace) => `${target.root}/${namespace}`);
}

function assertChangedFilesInsideTarget(changedFiles: string[], target: CanonicalTarget): void {
  const normalizedNamespaces = target.namespaces.map((value) => value.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/$/, ""));
  for (const changedFile of changedFiles) {
    const relativePath = changedFile.replaceAll("\\", "/").replace(/^\.\//, "");
    if (!normalizedNamespaces.some((namespace) => relativePath === namespace || relativePath.startsWith(`${namespace}/`))) {
      throw new Error(`Maintenance Agent changed a file outside its assigned Markdown namespaces: ${changedFile}`);
    }
  }
}

function summarize(results: MaintenanceProviderExecutionResult[], fallback: string): string {
  return results.map((result) => result.finalText.trim()).filter(Boolean).join("\n") || fallback;
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

export class EvolutionScoreBlockedError extends Error {}
