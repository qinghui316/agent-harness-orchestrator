import { z } from "zod";
import { getRuntimeAssignedHarnessSkillContext, type EnabledSkillContext } from "../skill/catalog.js";
import type { ManagedProject } from "../types/index.js";
import type { ProviderRealtimeEvent } from "../provider-runtime/index.js";
import { parseHarnessEngineeringAssignment, type HarnessEngineeringAssignment } from "./harness-engineering-contract.js";

export type MaintenanceProviderRole = "maintenance-agent" | "evolution-agent" | "evolution-scorer";

export interface MaintenanceProviderExecutionRequest {
  project: ManagedProject;
  role: MaintenanceProviderRole;
  prompt: string;
  skillContext: EnabledSkillContext;
  parentThreadId: string | null;
  cwd: string;
  runtimeWorkspaceRoots?: string[];
  writable: boolean;
  writableRoots?: string[];
  existingThreadId?: string | null;
  signal?: AbortSignal;
  onRealtimeEvent?: (event: ProviderRealtimeEvent) => void;
  taskLineage?: MaintenanceTaskLineage;
}

export interface MaintenanceTaskLineage {
  taskId: string;
  conversationId: string;
  changeId: string;
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
  version: "4.0";
  status: "completed" | "blocked";
  taskId: string;
  mode: "maintain-assigned-closeout" | "evolve-assigned-window";
  roots: { project: string; memory: string };
  producer: { role: "maintenance-agent" | "evolution-agent"; threadId: string; summary: string; changedFiles: string[] };
  scoring?: { role: "evolution-scorer"; threadId: string; parentThreadId: string; score: number; dimensions: Record<string, number>; hardIssues: string[]; summary: string };
  proposal?: string;
  scoringAttempts?: Array<{ role: "evolution-scorer"; threadId: string; parentThreadId: string; score: number; dimensions: Record<string, number>; hardIssues: string[]; summary: string }>;
  verification?: Array<{ name: string; command: string[]; exitCode: number | null; passed: boolean; stdoutPath: string; stderrPath: string }>;
  verificationAttempts?: Array<Array<{ name: string; command: string[]; exitCode: number | null; passed: boolean; stdoutPath: string; stderrPath: string }>>;
  application: "agent-direct-edit" | "not-applied";
}

export interface RunMaintenanceProviderAssignmentInput {
  project: ManagedProject;
  assignment: HarnessEngineeringAssignment;
  executor: MaintenanceProviderExecutor;
  getSkillContext?: typeof getRuntimeAssignedHarnessSkillContext;
  signal?: AbortSignal;
  onRealtimeEvent?: (event: ProviderRealtimeEvent) => void;
  taskLineage?: MaintenanceTaskLineage;
}

const scoreDimensionSchema = z.union([
  z.number().int(),
  z.object({
    score: z.number().int(),
    max: z.number().int().optional(),
    reason: z.string().optional(),
  }).strict().transform((value) => value.score),
]);

const scoreSchema = z.object({
  score: z.number().int().min(0).max(100),
  dimensions: z.object({
    evidenceGrounding: scoreDimensionSchema.pipe(z.number().min(0).max(30)),
    projectRelevance: scoreDimensionSchema.pipe(z.number().min(0).max(25)),
    mechanicalEnforceability: scoreDimensionSchema.pipe(z.number().min(0).max(15)),
    regressionSafety: scoreDimensionSchema.pipe(z.number().min(0).max(20)),
    contextCost: scoreDimensionSchema.pipe(z.number().min(0).max(10)),
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
  const writableRoots = uniqueRoots(assignment.projectRoot, assignment.memoryRoot);

  if (assignment.mode === "maintain-assigned-closeout") {
    const result = await input.executor({
      project: input.project,
      role: "maintenance-agent",
      prompt: buildMaintenancePrompt(assignment),
      skillContext,
      parentThreadId: null,
      cwd: assignment.memoryRoot,
      runtimeWorkspaceRoots: [assignment.projectRoot, assignment.memoryRoot],
      writable: true,
      writableRoots,
      signal: input.signal,
      onRealtimeEvent: input.onRealtimeEvent,
      taskLineage: input.taskLineage,
    });
    assertThreadLineage(result, null, "Maintenance Agent");
    return evidence(assignment, "maintenance-agent", result);
  }

  let proposal = await input.executor({
    project: input.project,
    role: "evolution-agent",
    prompt: buildEvolutionProposalPrompt(assignment),
    skillContext,
    parentThreadId: null,
    cwd: assignment.memoryRoot,
    runtimeWorkspaceRoots: [assignment.projectRoot, assignment.memoryRoot],
    writable: false,
    signal: input.signal,
    onRealtimeEvent: input.onRealtimeEvent,
    taskLineage: input.taskLineage,
  });
  assertThreadLineage(proposal, null, "Evolution Agent");

  let scoringResult: MaintenanceProviderExecutionResult | null = null;
  let score: z.infer<typeof scoreSchema> | null = null;
  const scoringAttempts: NonNullable<MaintenanceProviderRunEvidence["scoringAttempts"]> = [];
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    scoringResult = await input.executor({
      project: input.project,
      role: "evolution-scorer",
      prompt: buildScoringPrompt(assignment, proposal.finalText),
      skillContext,
      parentThreadId: proposal.threadId,
      existingThreadId: proposal.threadId,
      cwd: assignment.memoryRoot,
      runtimeWorkspaceRoots: [assignment.projectRoot, assignment.memoryRoot],
      writable: false,
      signal: input.signal,
      onRealtimeEvent: input.onRealtimeEvent,
      taskLineage: input.taskLineage,
    });
    if (scoringResult.parentThreadId !== proposal.threadId || scoringResult.threadId === proposal.threadId) {
      throw new Error("Evolution scorer must be a native child of the proposal thread.");
    }
    score = scoreSchema.parse(parseJsonEnvelope(scoringResult.finalText, "Evolution scorer"));
    scoringAttempts.push({
      role: "evolution-scorer",
      threadId: scoringResult.threadId,
      parentThreadId: proposal.threadId,
      ...score,
    });
    if (score.score >= 80 && score.hardIssues.length === 0) break;
    if (attempt === 2) {
      throw new EvolutionScoreBlockedError(
        `Evolution proposal scored ${score.score} or retained hard issues after one revision.`,
        {
          version: "4.0",
          status: "blocked",
          taskId: assignment.taskId,
          mode: assignment.mode,
          roots: { project: assignment.projectRoot, memory: assignment.memoryRoot },
          producer: {
            role: "evolution-agent",
            threadId: proposal.threadId,
            summary: proposal.finalText.trim() || "Evolution proposal remained below threshold.",
            changedFiles: proposal.changedFiles,
          },
          proposal: proposal.finalText,
          scoringAttempts,
          application: "not-applied",
        },
      );
    }
    const revised = await input.executor({
      project: input.project,
      role: "evolution-agent",
      prompt: buildEvolutionRevisionPrompt(proposal.finalText, score),
      skillContext,
      parentThreadId: null,
      existingThreadId: proposal.threadId,
      cwd: assignment.memoryRoot,
      runtimeWorkspaceRoots: [assignment.projectRoot, assignment.memoryRoot],
      writable: false,
      signal: input.signal,
      onRealtimeEvent: input.onRealtimeEvent,
      taskLineage: input.taskLineage,
    });
    if (revised.threadId !== proposal.threadId) throw new Error("Evolution revision must continue the proposal thread.");
    proposal = revised;
  }
  if (!scoringResult || !score) throw new Error("Evolution scoring did not produce a result.");

  const applied = await input.executor({
    project: input.project,
    role: "evolution-agent",
    prompt: buildEvolutionApplyPrompt(assignment, proposal.finalText, score),
    skillContext,
    parentThreadId: null,
    existingThreadId: proposal.threadId,
    cwd: assignment.memoryRoot,
    runtimeWorkspaceRoots: [assignment.projectRoot, assignment.memoryRoot],
    writable: true,
    writableRoots,
    signal: input.signal,
    onRealtimeEvent: input.onRealtimeEvent,
    taskLineage: input.taskLineage,
  });
  if (applied.threadId !== proposal.threadId) throw new Error("Evolution edit must continue the accepted proposal thread.");
  return {
    ...evidence(assignment, "evolution-agent", applied),
    scoring: {
      role: "evolution-scorer",
      threadId: scoringResult.threadId,
      parentThreadId: proposal.threadId,
      ...score,
    },
    proposal: proposal.finalText,
    scoringAttempts,
  };
}

function evidence(
  assignment: HarnessEngineeringAssignment,
  role: "maintenance-agent" | "evolution-agent",
  result: MaintenanceProviderExecutionResult,
): MaintenanceProviderRunEvidence {
  return {
    version: "4.0",
    status: "completed",
    taskId: assignment.taskId,
    mode: assignment.mode as "maintain-assigned-closeout" | "evolve-assigned-window",
    roots: { project: assignment.projectRoot, memory: assignment.memoryRoot },
    producer: {
      role,
      threadId: result.threadId,
      summary: result.finalText.trim() || "Harness task completed.",
      changedFiles: result.changedFiles,
    },
    application: "agent-direct-edit",
  };
}

function buildMaintenancePrompt(assignment: HarnessEngineeringAssignment): string {
  return [
    `Task: ${assignment.taskId}`,
    `Project root: ${assignment.projectRoot}`,
    `Memory root: ${assignment.memoryRoot}`,
    `Evidence: ${assignment.evidenceRefs.join(", ")}`,
    ...verificationPrompt(assignment),
    "Inspect the actual Harness structure, decide the evidence-backed delta, edit the real files directly when needed, and run the project's applicable checks.",
    "A no-op is correct when the current Harness already represents the durable facts. Return a concise result.",
  ].join("\n");
}

function buildEvolutionProposalPrompt(assignment: HarnessEngineeringAssignment): string {
  return [
    `Task: ${assignment.taskId}`,
    `Project root: ${assignment.projectRoot}`,
    `Memory root: ${assignment.memoryRoot}`,
    `Fixed window: ${assignment.sourceWindow!.hash}`,
    `Evidence: ${assignment.sourceWindow!.evidenceRefs.join(", ")}`,
    ...verificationPrompt(assignment),
    "Analyze exactly the assigned window and the current Harness. Produce a concrete evidence-grounded evolution proposal in the final response.",
    "Do not edit files before scoring. The proposal may conclude that no durable delta is warranted.",
  ].join("\n");
}

function buildScoringPrompt(assignment: HarnessEngineeringAssignment, proposal: string): string {
  return [
    "Independently score this Harness evolution proposal against the fixed evidence window.",
    "Do not edit files, create tasks, apply the proposal, or change the assigned window.",
    "Score evidenceGrounding/30, projectRelevance/25, mechanicalEnforceability/15, regressionSafety/20, and contextCost/10.",
    "Return only JSON in this exact shape, with numeric dimension values:",
    '{"score":0,"dimensions":{"evidenceGrounding":0,"projectRelevance":0,"mechanicalEnforceability":0,"regressionSafety":0,"contextCost":0},"hardIssues":[],"summary":"..."}',
    `Task: ${assignment.taskId}`,
    `Window: ${assignment.sourceWindow!.hash}`,
    `Window evidence: ${assignment.sourceWindow!.evidenceRefs.join(", ")}`,
    "Proposal:",
    proposal,
  ].join("\n");
}

function buildEvolutionApplyPrompt(
  assignment: HarnessEngineeringAssignment,
  proposal: string,
  score: z.infer<typeof scoreSchema>,
): string {
  return [
    `Task: ${assignment.taskId}`,
    `The native scorer accepted the proposal with score ${score.score}: ${score.summary}`,
    "Re-read the current Harness, then directly complete the accepted delta in the real project and memory roots.",
    "Run the project's applicable mechanical checks and return a concise result.",
    "Accepted proposal:",
    proposal,
  ].join("\n");
}

function buildEvolutionRevisionPrompt(proposal: string, score: z.infer<typeof scoreSchema>): string {
  return [
    "Revise the evolution proposal once using the independent score. Do not edit files yet.",
    `Score: ${score.score}. Hard issues: ${score.hardIssues.join("; ") || "none"}.`,
    `Scorer summary: ${score.summary}`,
    "Previous proposal:",
    proposal,
  ].join("\n");
}

function uniqueRoots(...roots: string[]): string[] {
  return [...new Set(roots)];
}

function verificationPrompt(assignment: HarnessEngineeringAssignment): string[] {
  return assignment.requiredVerification.length > 0
    ? [`Required mechanical verification: ${assignment.requiredVerification.map((item) => item.command.join(" ")).join("; ")}`]
    : ["No Runtime verification command was resolved; report that limitation explicitly."];
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

export class EvolutionScoreBlockedError extends Error {
  artifactRefs: string[] = [];

  constructor(message: string, readonly evidence: MaintenanceProviderRunEvidence) {
    super(message);
  }
}
