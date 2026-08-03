import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { decisionSchema } from "./schemas.js";
import { demandWorkersRoot, mainOrchestratorDecisionLogPath, type DemandWorkerStorePort } from "./paths.js";
import type { MainOrchestratorDecision, MainOrchestratorDecisionAction } from "../types/index.js";

export interface RecordMainOrchestratorDecisionInput {
  changeId: string;
  workerId?: string;
  attemptId?: string;
  action: MainOrchestratorDecisionAction;
  summary: string;
  reason: string;
  artifactRefs?: string[];
}

export async function recordMainOrchestratorDecision(memory: DemandWorkerStorePort, input: RecordMainOrchestratorDecisionInput): Promise<MainOrchestratorDecision> {
  const decision: MainOrchestratorDecision = {
    version: "1.0",
    id: `orchestrator-decision-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    projectId: memory.projectId,
    changeId: input.changeId,
    ...(input.workerId ? { workerId: input.workerId } : {}),
    ...(input.attemptId ? { attemptId: input.attemptId } : {}),
    action: input.action,
    summary: input.summary,
    reason: input.reason,
    artifactRefs: input.artifactRefs ?? [],
    createdAt: new Date().toISOString(),
  };
  decisionSchema.parse(decision);
  await mkdir(demandWorkersRoot(memory), { recursive: true });
  await appendFile(mainOrchestratorDecisionLogPath(memory), `${JSON.stringify(decision)}\n`, "utf8");
  return decision;
}

export async function listMainOrchestratorDecisions(memory: DemandWorkerStorePort): Promise<MainOrchestratorDecision[]> {
  const path = mainOrchestratorDecisionLogPath(memory);
  if (!existsSync(path)) return [];
  const text = await readFile(path, "utf8");
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => decisionSchema.parse(JSON.parse(line)));
}
