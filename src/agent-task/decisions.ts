import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { AgentTaskKind, ResolvedMemory } from "../types/index.js";
import { agentTaskRoot } from "./paths.js";

export interface MainAgentDecision {
  version: "1.0";
  id: string;
  changeId: string;
  recommendedAction: string;
  userMessage: string;
  requiresUserDecision: boolean;
  createTask?: {
    roleId: string;
    kind: AgentTaskKind;
    summary: string;
    inputArtifacts: string[];
    parentTaskId?: string;
  };
  reason: string;
  createdAt: string;
}

export async function recordMainAgentDecision(memory: ResolvedMemory, input: Omit<MainAgentDecision, "version" | "id" | "createdAt">): Promise<MainAgentDecision> {
  const decision: MainAgentDecision = {
    version: "1.0",
    id: `decision-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    ...input,
  };
  await mkdir(agentTaskRoot(memory), { recursive: true });
  await appendFile(join(agentTaskRoot(memory), "main-agent-decisions.jsonl"), `${JSON.stringify(decision)}\n`, "utf8");
  return decision;
}
