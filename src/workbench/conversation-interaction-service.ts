import { defaultProviderRegistry } from "../provider-runtime/index.js";
import { DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY } from "../provider-runtime/project-harness-discovery.js";
import { resolveProjectRuntimeState } from "../project-runtime/coordinator.js";
import type { ProjectRuntimeResolution } from "../project-runtime/context.js";
import type { ManagedProject } from "../types/index.js";
import { answerClarification, skipClarification, type ClarificationAnswer } from "./intake.js";
import { postConversationMessage } from "./conversation-service.js";
import { planHandoffUserMessage } from "./plan-handoff.js";
import { resolveConversationInteraction } from "./conversation-interactions.js";
import { openProjectRuntimeWorkbenchDatabase } from "./persistence/open-workbench-database.js";
import { CanonicalTimelineDelivery } from "./canonical-timeline-delivery.js";
import type { ConversationInteractionQuestion, ConversationInteractionSettlement } from "./conversation-interaction-contract.js";
import type { PlanHandoffIntentKind, WorkbenchLiveSink } from "./types.js";
import { publishAgentSurfacesInvalidated } from "./project-live-events.js";

const activeSettlements = new Set<string>();

export async function settleConversationInteraction(
  project: ManagedProject,
  conversationId: string,
  interactionId: string,
  settlement: ConversationInteractionSettlement,
  live?: WorkbenchLiveSink,
): Promise<unknown> {
  const runtime = await requireReadyProjectRuntime(project);
  const resolved = await resolveConversationInteraction(runtime.paths, conversationId, interactionId);
  if (resolved.kind === "provider-input") {
    return settleProviderInput(project, conversationId, interactionId, resolved, settlement, live);
  }
  if (resolved.kind === "clarification") {
    const result = await settleClarification(project, resolved, settlement);
    publishAgentSurfacesInvalidated(project.id, {
      conversationId: resolved.public.conversationId,
      graphScopeId: resolved.public.graphScopeId,
      reason: "interaction-updated",
    });
    return result;
  }
  return settlePlan(project, conversationId, resolved, settlement, live);
}

async function settleProviderInput(
  project: ManagedProject,
  conversationId: string,
  interactionId: string,
  resolved: Extract<Awaited<ReturnType<typeof resolveConversationInteraction>>, { kind: "provider-input" }>,
  settlement: ConversationInteractionSettlement,
  live?: WorkbenchLiveSink,
): Promise<{ status: "submitted"; interactionId: string }> {
  if (settlement.action !== "answer" && settlement.action !== "skip") throw badRequest("该操作不适用于Agent问题。");
  const request = resolved.source.request;
  if (request.status === "submitting") throw conflict("该回答的提交结果尚未确认，请等待状态恢复后再重试。");
  const normalized = settlement.action === "skip"
    ? { answers: {}, skippedQuestionIds: resolved.public.questions.map((question) => question.questionId), disposition: "skipped" as const }
    : normalizeQuestionSettlement(resolved.public.questions, settlement);
  const submissionKey = `${project.id}:${conversationId}:${interactionId}`;
  if (activeSettlements.has(submissionKey)) throw conflict("该回答正在提交，请勿重复操作。");
  activeSettlements.add(submissionKey);
  let transitioned = false;
  let transportInvoked = false;
  try {
    const provider = defaultProviderRegistry.get(request.providerId);
    const active = provider.conversation.getActiveTurn(request.runtimeScopeId);
    if (!active || active.attemptId !== request.attemptId) throw conflict("对应Agent回合当前不可用，请恢复该任务后重试。");
    await transitionProviderRequest(project, conversationId, requireRequestGraphScope(request), request.requestKey, "pending", "submitting", undefined, live);
    transitioned = true;
    transportInvoked = true;
    await active.respondToUserInput(request.requestId, normalized, {
      runId: request.runId,
      sessionId: request.threadId,
      turnId: request.turnId,
    });
    await transitionProviderRequest(project, conversationId, requireRequestGraphScope(request), request.requestKey, "submitting", "submitted", {
      publicAnswers: sanitizeAnswers(resolved.public.questions, normalized.answers),
      skippedQuestionIds: normalized.skippedQuestionIds,
      disposition: normalized.disposition,
    }, live);
    return { status: "submitted", interactionId };
  } catch (cause) {
    if (transitioned && !transportInvoked) {
      await transitionProviderRequest(project, conversationId, requireRequestGraphScope(request), request.requestKey, "submitting", "pending", undefined, live).catch(() => undefined);
    }
    throw cause;
  } finally {
    activeSettlements.delete(submissionKey);
  }
}

async function settleClarification(
  project: ManagedProject,
  resolved: Extract<Awaited<ReturnType<typeof resolveConversationInteraction>>, { kind: "clarification" }>,
  settlement: ConversationInteractionSettlement,
): Promise<unknown> {
  if (settlement.action === "skip") {
    return skipClarification(project, resolved.source.entry.changeId, resolved.source.clarification.id);
  }
  if (settlement.action !== "answer") throw badRequest("该操作不适用于需求确认。");
  const normalized = normalizeQuestionSettlement(resolved.public.questions, settlement);
  const answers: ClarificationAnswer[] = Object.entries(normalized.answers).map(([questionId, answer]) => ({
    questionId,
    answer: Array.isArray(answer) ? answer.join("、") : answer,
  }));
  if (answers.length === 0) return skipClarification(project, resolved.source.entry.changeId, resolved.source.clarification.id);
  return answerClarification(project, resolved.source.entry.changeId, resolved.source.clarification.id, answers);
}

async function settlePlan(
  project: ManagedProject,
  conversationId: string,
  resolved: Extract<Awaited<ReturnType<typeof resolveConversationInteraction>>, { kind: "plan" }>,
  settlement: ConversationInteractionSettlement,
  live?: WorkbenchLiveSink,
): Promise<unknown> {
  const kind: PlanHandoffIntentKind | null = settlement.action === "execute-plan"
    ? "execute-plan"
    : settlement.action === "revise-plan"
      ? "revise-plan"
      : settlement.action === "skip"
        ? "skip-plan"
        : null;
  if (!kind) throw badRequest("该操作不适用于计划确认。");
  const feedback = settlement.feedback?.trim();
  if (kind === "revise-plan" && !feedback) throw badRequest("请输入希望修改的内容。");
  const intent = {
    sourceRunId: resolved.source.proposal.runId,
    sourceAgentRoleId: "planning-agent" as const,
    sourceArtifact: resolved.source.proposal.artifact,
    sourceDocumentId: resolved.source.document.documentId,
    sourceCanonicalItemId: resolved.source.document.sourceCanonicalItemId,
    sourceProposalHash: resolved.source.document.proposalHash,
    kind,
    feedback,
  };
  return postConversationMessage(project, conversationId, {
    mode: "chat",
    message: planHandoffUserMessage(intent),
    planHandoffIntent: intent,
  }, live);
}

function normalizeQuestionSettlement(
  questions: ConversationInteractionQuestion[],
  settlement: ConversationInteractionSettlement,
): { answers: Record<string, string | string[]>; skippedQuestionIds: string[]; disposition: "answered" | "skipped" } {
  const known = new Map(questions.map((question) => [question.questionId, question]));
  const skippedQuestionIds = [...new Set(settlement.skippedQuestionIds ?? [])];
  for (const questionId of skippedQuestionIds) if (!known.has(questionId)) throw badRequest("回答包含未知问题。");
  const answers: Record<string, string | string[]> = {};
  for (const [questionId, rawAnswer] of Object.entries(settlement.answers ?? {})) {
    const question = known.get(questionId);
    if (!question) throw badRequest("回答包含未知问题。");
    if (skippedQuestionIds.includes(questionId)) throw badRequest("同一问题不能同时回答和跳过。");
    const values = (Array.isArray(rawAnswer) ? rawAnswer : [rawAnswer]).map((value) => value.trim()).filter(Boolean);
    if (values.length === 0) continue;
    if (question.inputMode !== "multiple" && values.length > 1) throw badRequest("该问题只允许一个回答。");
    const optionValues = new Set(question.options.map((option) => option.value));
    if (!question.allowCustom && values.some((value) => !optionValues.has(value))) throw badRequest("回答不属于允许的选项。");
    answers[questionId] = question.inputMode === "multiple" ? values : values[0]!;
  }
  const unresolved = questions.filter((question) => !(question.questionId in answers) && !skippedQuestionIds.includes(question.questionId));
  if (unresolved.length > 0) throw badRequest("请回答或跳过全部问题后再提交。");
  return {
    answers,
    skippedQuestionIds,
    disposition: Object.keys(answers).length > 0 ? "answered" : "skipped",
  };
}

function sanitizeAnswers(
  questions: ConversationInteractionQuestion[],
  answers: Record<string, string | string[]>,
): Record<string, string | string[]> {
  const byId = new Map(questions.map((question) => [question.questionId, question]));
  return Object.fromEntries(Object.entries(answers).map(([questionId, answer]) => [
    questionId,
    byId.get(questionId)?.inputMode === "secret" ? "已提供敏感信息" : answer,
  ]));
}

async function transitionProviderRequest(
  project: ManagedProject,
  conversationId: string,
  expectedGraphScopeId: string,
  requestKey: string,
  expectedStatus: "pending" | "submitting",
  nextStatus: "pending" | "submitting" | "submitted",
  settlement?: { publicAnswers?: Record<string, string | string[]>; skippedQuestionIds?: string[]; disposition?: "answered" | "skipped" },
  live?: WorkbenchLiveSink,
): Promise<void> {
  const runtime = await requireReadyProjectRuntime(project);
  const projectId = runtime.harness.projectId;
  const store = await openProjectRuntimeWorkbenchDatabase(runtime.paths);
  try {
    const transition = store.interactions.transitionProviderUserInputRequest(projectId, conversationId, expectedGraphScopeId, requestKey, expectedStatus, nextStatus, settlement, new Date().toISOString());
    new CanonicalTimelineDelivery(store, live).publishCommitted(transition.row);
    const graphScopeId = store.conversations.readConversation(projectId, conversationId)?.currentGraphScopeId;
    publishAgentSurfacesInvalidated(projectId, {
      conversationId,
      graphScopeId: graphScopeId ?? undefined,
      reason: "interaction-updated",
    });
  } finally {
    store.close();
  }
}

function requireRequestGraphScope(request: { graphScopeId?: string }): string {
  if (!request.graphScopeId) throw conflict("对应Agent问题缺少当前任务身份，无法提交。");
  return request.graphScopeId;
}

async function requireReadyProjectRuntime(project: ManagedProject): Promise<ProjectRuntimeResolution> {
  const state = await resolveProjectRuntimeState(project, {
    discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
  });
  if (state.state !== "ready") {
    throw new Error(`Project Harness is not ready for conversation interaction settlement: ${state.state}.`);
  }
  return state.resolution;
}

function badRequest(message: string): Error {
  const error = new Error(message);
  error.name = "BadRequest";
  return error;
}

function conflict(message: string): Error {
  const error = new Error(message);
  error.name = "Conflict";
  return error;
}
