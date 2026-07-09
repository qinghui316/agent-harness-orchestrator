import { respondToCodexAppServerUserInput } from "../../codex/app-server.js";
import { getWorkbenchSnapshot, type WorkbenchProjectInput } from "../../workbench/manager.js";
import type { ManagedProject } from "../../types/index.js";
import type { CodexUserInputAnswerRequest } from "./types.js";

export async function handleCodexUserInputAnswer(
  input: WorkbenchProjectInput & { project: ManagedProject },
  requestId: string,
  body: CodexUserInputAnswerRequest,
): Promise<{ result: unknown; snapshot: unknown }> {
  const scopeId = body.changeId ?? body.conversationId;
  if (!scopeId) {
    const error = new Error("Codex user input answer requires a changeId or conversationId.");
    error.name = "BadRequest";
    throw error;
  }
  const answers = normalizeCodexUserInputAnswers(body);
  await respondToCodexAppServerUserInput(scopeId, requestId, { answers });
  return {
    result: { status: "submitted", requestId },
    snapshot: await getWorkbenchSnapshot(input, { topicId: scopeId }),
  };
}

function normalizeCodexUserInputAnswers(body: CodexUserInputAnswerRequest): Record<string, string | string[]> {
  if (body.answers && Object.keys(body.answers).length > 0) return body.answers;
  if (typeof body.answer === "string" && body.answer.trim()) return { q1: body.answer.trim() };
  const error = new Error("Codex user input answer is required.");
  error.name = "BadRequest";
  throw error;
}
