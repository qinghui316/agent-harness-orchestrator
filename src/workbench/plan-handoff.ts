import type {
  PlanHandoffAgentRoleId,
  PlanHandoffIntent,
  TopicThreadEntry,
  ValidatedPlanHandoffIntent,
} from "./types.js";
import { canonicalPlanDocumentFromEntry, canonicalPlanDocumentText } from "./plan-documents.js";

const ELIGIBLE_PLAN_HANDOFF_ROLES = new Set<PlanHandoffAgentRoleId>(["planning-agent"]);
const DEFAULT_EXECUTION_MODE = "scoped-auto" as const;

export function validatePlanHandoffIntent(
  messages: TopicThreadEntry[],
  intent: PlanHandoffIntent | undefined,
): ValidatedPlanHandoffIntent | undefined {
  if (!intent) return undefined;
  if (!ELIGIBLE_PLAN_HANDOFF_ROLES.has(intent.sourceAgentRoleId)) {
    throw badRequest(`Plan handoff source role is not supported: ${intent.sourceAgentRoleId}`);
  }
  if (intent.kind !== "execute-plan" && intent.kind !== "revise-plan" && intent.kind !== "skip-plan") {
    throw badRequest("Plan handoff intent kind is invalid.");
  }
  if (intent.executionMode !== undefined && intent.executionMode !== "stepwise" && intent.executionMode !== "scoped-auto") {
    throw badRequest("Plan handoff execution mode is invalid.");
  }
  const feedback = intent.feedback?.trim();
  if (intent.kind === "revise-plan" && !feedback) {
    throw badRequest("Plan handoff revise intent requires feedback.");
  }
  const sourceRunId = intent.sourceRunId.trim();
  if (!sourceRunId) throw badRequest("Plan handoff source run id is required.");
  const sourceDocumentId = intent.sourceDocumentId?.trim();
  const sourceCanonicalItemId = intent.sourceCanonicalItemId?.trim();
  const sourceProposalHash = intent.sourceProposalHash?.trim();
  if (!sourceDocumentId || !sourceCanonicalItemId || !sourceProposalHash) {
    throw staleHandoff("Plan handoff canonical document identity is missing.");
  }
  const source = [...messages].reverse().find((message) => (
    message.type === "assistant.message"
    && message.agentRoleId === intent.sourceAgentRoleId
    && message.runId === sourceRunId
    && !["accepted", "revision-requested", "skipped", "superseded"].includes(message.status ?? "")
    && canonicalPlanDocumentFromEntry(message)?.documentId === sourceDocumentId
  ));
  if (!source) throw staleHandoff("Plan handoff source is stale or unavailable in the selected conversation.");
  const latestPlanSource = [...messages].reverse().find((message) => (
    message.type === "assistant.message"
    && message.agentRoleId === intent.sourceAgentRoleId
    && canonicalPlanDocumentFromEntry(message)
  ));
  if (latestPlanSource?.id !== source.id) throw staleHandoff("Plan handoff source has been superseded by a newer proposal.");
  const document = canonicalPlanDocumentFromEntry(source);
  if (!document
    || document.sourceCanonicalItemId !== sourceCanonicalItemId
    || document.proposalHash !== sourceProposalHash
    || (intent.sourceArtifact && document.proposalArtifact !== intent.sourceArtifact)) {
    throw staleHandoff("Plan handoff source identity no longer matches the current proposal.");
  }
  const planText = canonicalPlanDocumentText(source, document);
  if (!planText) throw staleHandoff("Plan handoff source did not contain plan text.");
  return {
    ...intent,
    sourceRunId,
    sourceArtifact: document.proposalArtifact,
    sourceDocumentId,
    sourceCanonicalItemId,
    sourceProposalHash,
    executionMode: intent.executionMode ?? DEFAULT_EXECUTION_MODE,
    feedback,
    planText,
  };
}

export function buildMainAgentPlanHandoffPromptContext(handoff: ValidatedPlanHandoffIntent | undefined): string[] {
  if (!handoff) return [];
  return [
    "This turn was triggered by a visible Plan handoff card in the main conversation.",
    "Treat this as user intent about the current plan, not as execution authorization.",
    "Before deciding what to do, read project guidance in this order when present: AGENTS.md, docs/ECL.md, active change files under harness/changes/active, harness/evolution/pending.md only when no active change exists, docs/STATUS.md, then task-specific docs.",
    "If implementation is appropriate, continue as the main Agent through the project's normal Change/ECL and human-gated workflow. Do not assume Workbench created records, accepted artifacts, or executed anything for you.",
    `Requested plan handoff action: ${handoff.kind}.`,
    ...(handoff.kind === "execute-plan" ? [`Requested local execution mode: ${handoff.executionMode ?? DEFAULT_EXECUTION_MODE}.`] : []),
    ...(handoff.kind === "execute-plan" ? [
      "After reviewing the exact current planner-child proposal, call the no-argument aho_accept_current_plan tool if it is ready. The tool accepts artifacts and compiles a graph but never starts code execution.",
      "If the proposal is not ready, do not call the tool; explain the issue or delegate a revision.",
    ] : []),
    ...(handoff.feedback ? ["User feedback for revising the plan:", handoff.feedback] : []),
    "Current plan text from the same conversation:",
    handoff.planText,
  ];
}

export function planHandoffUserMessage(handoff: PlanHandoffIntent): string {
  return handoff.kind === "skip-plan"
    ? "我跳过了这次计划确认。请在没有执行授权的前提下，根据当前上下文继续判断下一步。"
    : handoff.kind === "revise-plan"
    ? `请主 Agent 先审查下面的计划修改意见，再决定是否让 Plan Agent 修改计划：\n\n${handoff.feedback ?? ""}`
    : "请主 Agent 基于当前计划继续判断执行路径。";
}

function badRequest(message: string): Error {
  const error = new Error(message);
  error.name = "BadRequest";
  return error;
}

function staleHandoff(message: string): Error {
  const error = new Error(message);
  error.name = "Conflict";
  return error;
}
