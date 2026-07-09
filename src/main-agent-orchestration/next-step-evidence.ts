import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { MainAgentOrchestrationDecision, MainAgentOrchestrationRole } from "../agent-task/orchestration-engine.js";
import type { ResolvedMemory } from "../types/index.js";
import { mainAgentLoopRunRoot, type MainAgentLoopEntrypoint } from "./loop-evidence.js";

export type MainAgentNextStepEvidenceAuthority = "non-executing-main-agent-next-step-evidence";
export type MainAgentNextStepEntrypoint = Exclude<MainAgentLoopEntrypoint, "task-queue">;

export interface MainAgentNextStepEvidenceRefs {
  agentTaskIds: string[];
  runIds: string[];
  validationIds: string[];
  auditIds: string[];
}

export type MainAgentNextStepGateIntent =
  | "delegate-leaf"
  | "result-handoff"
  | "none";

export interface MainAgentNextStepTargetRefs {
  worktreeIds: string[];
  runIds: string[];
  validationIds: string[];
  auditIds: string[];
  applyCheckIds: string[];
  landingPackageIds: string[];
}

export interface MainAgentNextStepObservationSummary {
  summary: string;
  totalSteps: number;
  completedSteps: number;
  failedSteps: number;
  latestRoleId: MainAgentOrchestrationRole | null;
  latestStatus: "completed" | "failed" | null;
}

export interface MainAgentNextStepEvidence {
  version: "1.0";
  authority: MainAgentNextStepEvidenceAuthority;
  executionStarted: false;
  id: string;
  ref: string;
  loopRunId: string;
  changeId: string;
  projectId: string | null;
  entrypoint: MainAgentNextStepEntrypoint;
  stepIndex: number;
  createdAt: string;
  observation: MainAgentNextStepObservationSummary;
  decision: {
    kind: MainAgentOrchestrationDecision["kind"];
    roleId: MainAgentOrchestrationRole | null;
    attemptKind: "initial" | "rework" | "follow-up" | null;
    stoppedAt: "boundary" | "code" | "validation" | "audit" | null;
    reason: string;
    nextRecommendation: string;
  };
  gateIntent?: MainAgentNextStepGateIntent;
  targetRefs?: MainAgentNextStepTargetRefs;
  artifactRefs: string[];
  refs: MainAgentNextStepEvidenceRefs;
}

const refsSchema = z.object({
  agentTaskIds: z.array(z.string()),
  runIds: z.array(z.string()),
  validationIds: z.array(z.string()),
  auditIds: z.array(z.string()),
});

const targetRefsSchema = z.object({
  worktreeIds: z.array(z.string()),
  runIds: z.array(z.string()),
  validationIds: z.array(z.string()),
  auditIds: z.array(z.string()),
  applyCheckIds: z.array(z.string()),
  landingPackageIds: z.array(z.string()),
});

const observationSchema = z.object({
  summary: z.string(),
  totalSteps: z.number(),
  completedSteps: z.number(),
  failedSteps: z.number(),
  latestRoleId: z.enum(["coder-agent", "validator", "auditor-agent", "rework-coder"]).nullable(),
  latestStatus: z.enum(["completed", "failed"]).nullable(),
});

const mainAgentNextStepEvidenceSchema = z.object({
  version: z.literal("1.0"),
  authority: z.literal("non-executing-main-agent-next-step-evidence"),
  executionStarted: z.literal(false),
  id: z.string(),
  ref: z.string(),
  loopRunId: z.string(),
  changeId: z.string(),
  projectId: z.string().nullable(),
  entrypoint: z.enum(["top-level", "task-run", "source-refresh-rework", "feedback-rework"]),
  stepIndex: z.number(),
  createdAt: z.string(),
  observation: observationSchema,
  decision: z.object({
    kind: z.enum(["delegate-role", "completed", "needs-user-input", "failed"]),
    roleId: z.enum(["coder-agent", "validator", "auditor-agent", "rework-coder"]).nullable(),
    attemptKind: z.enum(["initial", "rework", "follow-up"]).nullable(),
    stoppedAt: z.enum(["boundary", "code", "validation", "audit"]).nullable(),
    reason: z.string(),
    nextRecommendation: z.string(),
  }),
  gateIntent: z.enum(["delegate-leaf", "result-handoff", "none"]).optional(),
  targetRefs: targetRefsSchema.optional(),
  artifactRefs: z.array(z.string()),
  refs: refsSchema,
});

export function mainAgentNextStepDecisionsPath(memory: ResolvedMemory, loopRunId: string): string {
  return join(mainAgentLoopRunRoot(memory, loopRunId), "decisions.jsonl");
}

export function mainAgentNextStepEvidenceRef(loopRunId: string, evidenceId: string): string {
  return `agent-tasks/main-agent-loop-runs/${loopRunId}/decisions.jsonl#${evidenceId}`;
}

export async function readMainAgentNextStepEvidence(
  memory: ResolvedMemory,
  loopRunId: string,
): Promise<MainAgentNextStepEvidence[]> {
  const path = mainAgentNextStepDecisionsPath(memory, loopRunId);
  try {
    if (!existsSync(path)) return [];
    const lines = (await readFile(path, "utf8")).split(/\r?\n/).filter(Boolean);
    const decisions: MainAgentNextStepEvidence[] = [];
    for (const line of lines) {
      const parsed = mainAgentNextStepEvidenceSchema.safeParse(JSON.parse(line));
      if (!parsed.success) return [];
      decisions.push(parsed.data);
    }
    return decisions;
  } catch {
    return [];
  }
}

