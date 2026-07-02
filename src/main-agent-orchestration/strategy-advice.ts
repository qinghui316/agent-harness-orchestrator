import { z } from "zod";

export type MainAgentStrategyAdviceKind =
  | "direct"
  | "pipeline"
  | "parallel-candidate"
  | "clarify"
  | "blocked"
  | "terminal"
  | "stale";

export type MainAgentStrategyAdviceStatus = "accepted-readonly" | "ignored";

export interface MainAgentStrategyAdvice {
  authority: "read-only-main-agent-strategy-advice";
  executionStarted: false;
  controller: false;
  status: MainAgentStrategyAdviceStatus;
  kind: MainAgentStrategyAdviceKind | null;
  reason: string;
  confidence: number | null;
  evidenceRefs: string[];
  applied: false;
  ignoredReason: string | null;
}

const strategyAdviceInputSchema = z.object({
  kind: z.enum(["direct", "pipeline", "parallel-candidate", "clarify", "blocked", "terminal", "stale"]),
  reason: z.string().min(1).max(1200),
  confidence: z.number().min(0).max(1).nullable().optional(),
  evidenceRefs: z.array(z.string().min(1).max(240)).max(24).optional(),
}).strict();

const forbiddenAdviceTerms = [
  "actionType",
  "approvalActionId",
  "approval payload",
  "confirmationPayload",
  "confirmation payload",
  "schedulerPayload",
  "scheduler payload",
  "recommendedAction",
  "result.apply",
  "change.close",
  "applyIntegrationCheck",
  "discardIntegrationCheck",
  "planning.scheduler.",
];

export function buildMainAgentStrategyAdvice(raw: unknown): MainAgentStrategyAdvice {
  if (raw === undefined || raw === null) {
    return ignoredStrategyAdvice("No strategy advice was provided.");
  }
  if (containsForbiddenAdvicePayload(raw)) {
    return ignoredStrategyAdvice("Strategy advice contained forbidden executable payload hints.");
  }
  const parsed = strategyAdviceInputSchema.safeParse(raw);
  if (!parsed.success) {
    return ignoredStrategyAdvice("Strategy advice failed strict schema validation.");
  }
  return {
    authority: "read-only-main-agent-strategy-advice",
    executionStarted: false,
    controller: false,
    status: "accepted-readonly",
    kind: parsed.data.kind,
    reason: parsed.data.reason,
    confidence: parsed.data.confidence ?? null,
    evidenceRefs: dedupeStrings(parsed.data.evidenceRefs ?? []),
    applied: false,
    ignoredReason: "V2a records advice as read-only evidence only; deterministic strategy remains authoritative.",
  };
}

export function ignoredStrategyAdvice(reason: string): MainAgentStrategyAdvice {
  return {
    authority: "read-only-main-agent-strategy-advice",
    executionStarted: false,
    controller: false,
    status: "ignored",
    kind: null,
    reason: "Strategy advice was ignored.",
    confidence: null,
    evidenceRefs: [],
    applied: false,
    ignoredReason: reason,
  };
}

function containsForbiddenAdvicePayload(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") {
    return forbiddenAdviceTerms.some((term) => value.includes(term));
  }
  if (typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((item) => containsForbiddenAdvicePayload(item));
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (forbiddenAdviceTerms.some((term) => key.includes(term))) return true;
    if (containsForbiddenAdvicePayload(child)) return true;
  }
  return false;
}

function dedupeStrings(values: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}
