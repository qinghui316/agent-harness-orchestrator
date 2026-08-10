import { createHash } from "node:crypto";
import type { ProjectWorkbenchPathPort } from "../project-runtime/paths.js";
import { agentThreadSurfaceId } from "../provider-runtime/agent-surface-id.js";
import { readPlannerChildProposal, type PlannerChildProposal } from "./planning/planner-child-proposal.js";
import { canonicalPlanDocumentFromEntry, canonicalPlanDocumentText } from "./plan-documents.js";
import { fromStoredThreadMessage } from "./conversation-thread-log.js";
import { openProjectRuntimeWorkbenchDatabase } from "./persistence/open-workbench-database.js";
import type { ClarificationRequest } from "./intake.js";
import type { CanonicalPlanDocument, TopicThreadEntry, WorkbenchProviderUserInputRequest } from "./types.js";
import type {
  ConversationInteraction,
  ConversationInteractionQuestion,
  ConversationInteractionQueue,
} from "./conversation-interaction-contract.js";
import type { ProductMode } from "../provider-runtime/index.js";

export type ResolvedConversationInteraction =
  | { kind: "provider-input"; public: ConversationInteraction & { kind: "provider-input" }; source: { entry: TopicThreadEntry; request: WorkbenchProviderUserInputRequest } }
  | { kind: "clarification"; public: ConversationInteraction & { kind: "clarification" }; source: { entry: TopicThreadEntry; clarification: ClarificationRequest } }
  | { kind: "plan"; public: ConversationInteraction & { kind: "plan" }; source: { entry: TopicThreadEntry; proposal: PlannerChildProposal; document: CanonicalPlanDocument } };

const TERMINAL_PLAN_STATUSES = new Set(["accepted", "revision-requested", "skipped", "superseded", "planner-proposal-invalid"]);

export async function buildConversationInteractionQueue(
  runtime: ProjectWorkbenchPathPort,
  conversationId: string | undefined,
  graphScopeId: string | undefined,
  productMode: ProductMode,
): Promise<ConversationInteractionQueue> {
  if (!conversationId || !graphScopeId) return { productMode, conversationId, graphScopeId, items: [] };
  const database = await openProjectRuntimeWorkbenchDatabase(runtime);
  try {
    const conversation = database.conversations.readConversation(runtime.projectId, conversationId);
    if (!conversation) throw notFound("Conversation interaction is unavailable.");
    if (conversation.productMode !== productMode) {
      const error = new Error("Conversation productMode does not match the requested mode.");
      error.name = "Conflict";
      throw error;
    }
  } finally {
    database.close();
  }
  const resolved = await resolveConversationInteractions(runtime, conversationId, graphScopeId);
  return { productMode, conversationId, graphScopeId, items: resolved.map((item) => item.public) };
}

export async function resolveConversationInteraction(
  runtime: ProjectWorkbenchPathPort,
  conversationId: string,
  interactionId: string,
): Promise<ResolvedConversationInteraction> {
  const store = await openProjectRuntimeWorkbenchDatabase(runtime);
  let graphScopeId: string | null;
  try {
    const conversation = store.conversations.readConversation(runtime.projectId, conversationId);
    if (!conversation) throw notFound("Conversation interaction is unavailable.");
    graphScopeId = conversation.currentGraphScopeId;
  } finally {
    store.close();
  }
  if (!graphScopeId) throw staleInteraction();
  const match = (await resolveConversationInteractions(runtime, conversationId, graphScopeId))
    .find((item) => item.public.interactionId === interactionId);
  if (!match) throw staleInteraction();
  return match;
}

export async function buildConversationInteractionAttention(
  runtime: ProjectWorkbenchPathPort,
  conversationId: string | undefined,
  graphScopeId: string | undefined,
): Promise<{ mainNeedsInput: boolean; agentSurfaceIds: Set<string> }> {
  if (!conversationId || !graphScopeId) return { mainNeedsInput: false, agentSurfaceIds: new Set() };
  const interactions = await resolveConversationInteractions(runtime, conversationId, graphScopeId);
  const agentSurfaceIds = new Set<string>();
  let mainNeedsInput = false;
  for (const interaction of interactions) {
    if (interaction.kind !== "provider-input") {
      mainNeedsInput = true;
      continue;
    }
    const request = interaction.source.request;
    if (!request.agentRoleId || request.agentRoleId === "main-agent" || !request.threadId) mainNeedsInput = true;
    else agentSurfaceIds.add(agentThreadSurfaceId(request.providerId, request.threadId));
  }
  return { mainNeedsInput, agentSurfaceIds };
}

async function resolveConversationInteractions(
  runtime: ProjectWorkbenchPathPort,
  conversationId: string,
  graphScopeId: string,
): Promise<ResolvedConversationInteraction[]> {
  const database = await openProjectRuntimeWorkbenchDatabase(runtime);
  try {
    if (database.conversations.isConversationGraphScopeTerminal(runtime.projectId, graphScopeId)) return [];
  } finally {
    database.close();
  }
  const entries = await readEntries(runtime, conversationId);
  const currentEntries = entries.filter((entry) => entry.graphScopeId === graphScopeId);
  const latestClarification = new Map<string, TopicThreadEntry>();
  for (const entry of currentEntries) {
    const clarification = clarificationOf(entry);
    if (clarification) latestClarification.set(clarification.id, entry);
  }
  const latestPlanEntry = [...currentEntries].reverse().find((entry) => (
    entry.agentRoleId === "planning-agent" && canonicalPlanDocumentFromEntry(entry)
  ));
  const interactions: ResolvedConversationInteraction[] = [];
  for (const entry of currentEntries) {
    if (entry.providerUserInput
      && (entry.providerUserInput.status === "pending" || entry.providerUserInput.status === "submitting")
      && (!entry.providerUserInput.expiresAt || Date.parse(entry.providerUserInput.expiresAt) > Date.now())) {
      const request = entry.providerUserInput;
      interactions.push({
        kind: "provider-input",
        public: {
          interactionId: interactionId("provider-input", conversationId, graphScopeId, entry.id, request.requestKey),
          conversationId,
          graphScopeId,
          canonicalSequence: entry.position ?? 0,
          kind: "provider-input",
          status: request.status === "submitting" ? "submitting" : "pending",
          title: request.agentRoleId ? "Agent 需要你回答" : "需要你回答",
          questions: request.questions.map(providerQuestion),
          canSkip: true,
        },
        source: { entry, request },
      });
      continue;
    }
    const clarification = clarificationOf(entry);
    if (clarification && latestClarification.get(clarification.id)?.id === entry.id && clarification.status === "pending") {
      interactions.push({
        kind: "clarification",
        public: {
          interactionId: interactionId("clarification", conversationId, graphScopeId, entry.id, clarification.id),
          conversationId,
          graphScopeId,
          canonicalSequence: entry.position ?? 0,
          kind: "clarification",
          status: "pending",
          title: clarification.questions[0]?.header ?? "需要你确认",
          questions: clarification.questions.map((question) => ({
            questionId: question.id,
            title: question.question,
            inputMode: question.options?.length ? "single" : "text",
            options: (question.options ?? []).map((option) => ({ value: option.label, label: option.label, description: option.description })),
            allowCustom: question.allowFreeform,
          })),
          canSkip: true,
        },
        source: { entry, clarification },
      });
      continue;
    }
    const document = canonicalPlanDocumentFromEntry(entry);
    if (!document || entry.id !== latestPlanEntry?.id || entry.agentRoleId !== "planning-agent" || TERMINAL_PLAN_STATUSES.has(entry.status ?? "")) continue;
    const proposal = await readPlannerChildProposal(document.proposalArtifact).catch(() => null);
    if (!proposal
      || proposal.conversationId !== conversationId
      || proposal.runId !== entry.runId
      || proposal.id !== document.proposalId
      || proposal.hash !== document.proposalHash
      || proposal.artifact !== document.proposalArtifact
      || proposal.status !== "proposed"
      || proposal.openQuestions.length > 0
      || !canonicalPlanDocumentText(entry, document)) continue;
    interactions.push({
      kind: "plan",
      public: {
        interactionId: interactionId("plan", conversationId, graphScopeId, document.documentId, proposal.hash),
        conversationId,
        graphScopeId,
        canonicalSequence: entry.position ?? 0,
        kind: "plan",
        status: "pending",
        title: "实施此计划？",
        questions: [{
          questionId: "plan-decision",
          title: "实施此计划？",
          inputMode: "single",
          options: [{ value: "execute", label: "是，实施此计划" }],
          allowCustom: true,
        }],
        canSkip: true,
      },
      source: { entry, proposal, document },
    });
  }
  return interactions.sort((left, right) => left.public.canonicalSequence - right.public.canonicalSequence || left.public.interactionId.localeCompare(right.public.interactionId));
}

function clarificationOf(entry: TopicThreadEntry): ClarificationRequest | null {
  const value = entry.clarification;
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<ClarificationRequest>;
  return typeof candidate.id === "string" && Array.isArray(candidate.questions) && typeof candidate.status === "string"
    ? value as ClarificationRequest
    : null;
}

async function readEntries(runtime: ProjectWorkbenchPathPort, conversationId: string): Promise<TopicThreadEntry[]> {
  const store = await openProjectRuntimeWorkbenchDatabase(runtime);
  try {
    return store.timeline.listConversationMessages(runtime.projectId, conversationId).map(fromStoredThreadMessage);
  } finally {
    store.close();
  }
}

function providerQuestion(question: WorkbenchProviderUserInputRequest["questions"][number]): ConversationInteractionQuestion {
  return {
    questionId: question.id,
    title: question.question,
    inputMode: question.inputMode,
    options: question.options ?? [],
    allowCustom: question.allowCustom,
  };
}

function interactionId(kind: string, conversationId: string, graphScopeId: string, itemId: string, sourceIdentity: string): string {
  const hash = createHash("sha256").update(JSON.stringify({ kind, conversationId, graphScopeId, itemId, sourceIdentity })).digest("hex");
  return `interaction:${hash.slice(0, 32)}`;
}

function staleInteraction(): Error {
  const error = new Error("该交互已经处理、过期或不属于当前需求，请刷新后重试。");
  error.name = "Conflict";
  return error;
}

function notFound(message: string): Error {
  const error = new Error(message);
  error.name = "NotFound";
  return error;
}
