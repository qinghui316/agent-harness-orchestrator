import { defaultProviderRegistry } from "../../provider-runtime/index.js";
import { resolveProjectMemory } from "../../memory/resolver.js";
import { getWorkbenchSnapshot, type WorkbenchProjectInput } from "../../workbench/manager.js";
import { WorkbenchStore } from "../../workbench/store.js";
import type { ManagedProject } from "../../types/index.js";
import type { ProviderUserInputAnswerRequest } from "./types.js";

const activeAnswerSubmissions = new Set<string>();

export async function handleProviderUserInputAnswer(
  input: WorkbenchProjectInput & { project: ManagedProject },
  requestId: string,
  body: ProviderUserInputAnswerRequest,
): Promise<{ result: unknown; snapshot: unknown }> {
  if (!body.conversationId || !body.requestKey) throw badRequest("Provider user input requires conversationId and requestKey.");
  const answers = normalizeAnswers(body);
  const submissionKey = `${input.project.id}:${body.conversationId}:${body.requestKey}`;
  const current = await readStoredAnswer(input.project, body.conversationId, body.requestKey);
  if (requestId !== current.requestId) throw badRequest("Provider user input request id does not match the persisted request key.");
  if (current.status === "submitted") return submittedResponse(input, body, requestId);
  if (activeAnswerSubmissions.has(submissionKey)) {
    return { result: { status: "submitting", requestId }, snapshot: await snapshot(input, body) };
  }
  const expectedStatus = current.status === "submitting" ? "submitting" : "pending";
  const request = current.status === "submitting"
    ? current
    : await transitionStoredAnswer(input.project, body.conversationId, body.requestKey, expectedStatus, "submitting", answers);
  activeAnswerSubmissions.add(submissionKey);
  let accepted = false;
  try {
    const provider = defaultProviderRegistry.get(request.providerId);
    const active = provider.conversation.getActiveTurn(request.runId);
    if (!active || active.attemptId !== request.attemptId) {
      const error = new Error("对应 Agent 回合当前不可用，请恢复该任务后重试。");
      error.name = "Conflict";
      throw error;
    }
    await active.respondToUserInput(request.requestId, { answers: request.answers ?? answers }, {
      runId: request.runId,
      sessionId: request.threadId,
      turnId: request.turnId,
    });
    accepted = true;
    await transitionStoredAnswer(input.project, body.conversationId, body.requestKey, "submitting", "submitted", request.answers ?? answers);
    return submittedResponse(input, body, requestId);
  } catch (cause) {
    if (!accepted && expectedStatus === "pending") {
      await transitionStoredAnswer(input.project, body.conversationId, body.requestKey, "submitting", "pending", undefined).catch(() => undefined);
    }
    throw cause;
  } finally {
    activeAnswerSubmissions.delete(submissionKey);
  }
}

async function readStoredAnswer(project: ManagedProject, conversationId: string, requestKey: string) {
  const memory = await resolveProjectMemory(project);
  if (!memory.projectId) throw new Error("Project id is required to read a provider answer.");
  const store = await WorkbenchStore.open(memory);
  try {
    const request = store.readProviderUserInputRequest(memory.projectId, conversationId, requestKey);
    if (!request) throw new Error(`Provider user input request was not persisted: ${requestKey}.`);
    return request;
  } finally {
    store.close();
  }
}

async function transitionStoredAnswer(
  project: ManagedProject,
  conversationId: string,
  requestKey: string,
  expectedStatus: "pending" | "submitting" | "submitted",
  nextStatus: "pending" | "submitting" | "submitted",
  answers: Record<string, string | string[]> | undefined,
) {
  const memory = await resolveProjectMemory(project);
  if (!memory.projectId) throw new Error("Project id is required to persist a provider answer.");
  const store = await WorkbenchStore.open(memory);
  try {
    return store.transitionProviderUserInputRequest(memory.projectId, conversationId, requestKey, expectedStatus, nextStatus, answers, new Date().toISOString());
  } finally {
    store.close();
  }
}

async function submittedResponse(input: WorkbenchProjectInput & { project: ManagedProject }, body: ProviderUserInputAnswerRequest, requestId: string) {
  return { result: { status: "submitted", requestId }, snapshot: await snapshot(input, body) };
}

function snapshot(input: WorkbenchProjectInput & { project: ManagedProject }, body: ProviderUserInputAnswerRequest) {
  return getWorkbenchSnapshot(input, { topicId: body.changeId ?? body.conversationId });
}

function normalizeAnswers(body: ProviderUserInputAnswerRequest): Record<string, string | string[]> {
  if (body.answers && Object.keys(body.answers).length > 0) return body.answers;
  if (typeof body.answer === "string" && body.answer.trim()) return { q1: body.answer.trim() };
  throw badRequest("Provider user input answer is required.");
}

function badRequest(message: string): Error {
  const error = new Error(message);
  error.name = "BadRequest";
  return error;
}
