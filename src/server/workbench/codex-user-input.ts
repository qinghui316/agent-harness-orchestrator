import { respondToCodexAppServerUserInput } from "../../codex/app-server.js";
import { resolveProjectMemory } from "../../memory/resolver.js";
import { getWorkbenchSnapshot, type WorkbenchProjectInput } from "../../workbench/manager.js";
import { WorkbenchStore } from "../../workbench/store.js";
import type { ManagedProject } from "../../types/index.js";
import type { CodexUserInputAnswerRequest } from "./types.js";

const activeAnswerSubmissions = new Set<string>();

export async function handleCodexUserInputAnswer(
  input: WorkbenchProjectInput & { project: ManagedProject },
  requestId: string,
  body: CodexUserInputAnswerRequest,
): Promise<{ result: unknown; snapshot: unknown }> {
  if (!body.conversationId) {
    const error = new Error("Codex user input answer requires a conversationId.");
    error.name = "BadRequest";
    throw error;
  }
  if (!body.requestKey) {
    const error = new Error("Codex user input answer requires a requestKey.");
    error.name = "BadRequest";
    throw error;
  }
  const answers = normalizeCodexUserInputAnswers(body);
  const submissionKey = `${input.project.id}:${body.conversationId}:${body.requestKey}`;
  const current = await readStoredAnswer(input.project, body.conversationId, body.requestKey);
  if (requestId !== current.requestId) {
    const error = new Error("Codex user input request id does not match the persisted request key.");
    error.name = "BadRequest";
    throw error;
  }
  if (current.status === "submitted") {
    return submittedResponse(input, body, requestId);
  }
  if (current.status === "submitting") {
    if (activeAnswerSubmissions.has(submissionKey)) {
      return {
        result: { status: "submitting", requestId },
        snapshot: await getWorkbenchSnapshot(input, { topicId: body.changeId ?? body.conversationId }),
      };
    }
    activeAnswerSubmissions.add(submissionKey);
    try {
      try {
        await respondToCodexAppServerUserInput(current.runtimeScopeId, current.requestId, {
          answers: current.answers ?? answers,
        }, {
          runId: current.runId,
          threadId: current.threadId,
          turnId: current.turnId,
        });
      } catch (cause) {
        const error = new Error("Codex 回答提交状态无法确认；当前请求保持为提交中，请恢复对应 Agent 回合后重试。", { cause });
        error.name = "Conflict";
        throw error;
      }
      await transitionStoredAnswer(input.project, body.conversationId, body.requestKey, "submitting", "submitted", current.answers ?? answers);
      return submittedResponse(input, body, requestId);
    } finally {
      activeAnswerSubmissions.delete(submissionKey);
    }
  }
  let request: import("../../workbench/types.js").WorkbenchCodexUserInputRequest;
  try {
    request = await transitionStoredAnswer(input.project, body.conversationId, body.requestKey, "pending", "submitting", answers);
  } catch (cause) {
    const latest = await readStoredAnswer(input.project, body.conversationId, body.requestKey);
    if (latest.status === "submitted") return submittedResponse(input, body, requestId);
    if (latest.status === "submitting") {
      return {
        result: { status: "submitting", requestId },
        snapshot: await getWorkbenchSnapshot(input, { topicId: body.changeId ?? body.conversationId }),
      };
    }
    throw cause;
  }
  activeAnswerSubmissions.add(submissionKey);
  let providerAccepted = false;
  try {
    await respondToCodexAppServerUserInput(request.runtimeScopeId, request.requestId, { answers }, {
      runId: request.runId,
      threadId: request.threadId,
      turnId: request.turnId,
    });
    providerAccepted = true;
    await transitionStoredAnswer(input.project, body.conversationId, body.requestKey, "submitting", "submitted", answers);
    return submittedResponse(input, body, requestId);
  } catch (cause) {
    if (!providerAccepted) {
      await transitionStoredAnswer(input.project, body.conversationId, body.requestKey, "submitting", "pending", undefined).catch(() => undefined);
    }
    throw cause;
  } finally {
    activeAnswerSubmissions.delete(submissionKey);
  }
}

async function submittedResponse(
  input: WorkbenchProjectInput & { project: ManagedProject },
  body: CodexUserInputAnswerRequest,
  requestId: string,
): Promise<{ result: unknown; snapshot: unknown }> {
  return {
    result: { status: "submitted", requestId },
    snapshot: await getWorkbenchSnapshot(input, { topicId: body.changeId ?? body.conversationId }),
  };
}

async function readStoredAnswer(
  project: ManagedProject,
  conversationId: string,
  requestKey: string,
): Promise<import("../../workbench/types.js").WorkbenchCodexUserInputRequest> {
  const memory = await resolveProjectMemory(project);
  if (!memory.projectId) throw new Error("Project id is required to read a Codex answer.");
  const store = await WorkbenchStore.open(memory);
  try {
    const request = store.readCodexUserInputRequest(memory.projectId, conversationId, requestKey);
    if (!request) throw new Error(`Codex user input request was not persisted: ${requestKey}.`);
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
): Promise<import("../../workbench/types.js").WorkbenchCodexUserInputRequest> {
  const memory = await resolveProjectMemory(project);
  if (!memory.projectId) throw new Error("Project id is required to persist a Codex answer.");
  const store = await WorkbenchStore.open(memory);
  try {
    return store.transitionCodexUserInputRequest(
      memory.projectId,
      conversationId,
      requestKey,
      expectedStatus,
      nextStatus,
      answers,
      new Date().toISOString(),
    );
  } finally {
    store.close();
  }
}

function normalizeCodexUserInputAnswers(body: CodexUserInputAnswerRequest): Record<string, string | string[]> {
  if (body.answers && Object.keys(body.answers).length > 0) return body.answers;
  if (typeof body.answer === "string" && body.answer.trim()) return { q1: body.answer.trim() };
  const error = new Error("Codex user input answer is required.");
  error.name = "BadRequest";
  throw error;
}
