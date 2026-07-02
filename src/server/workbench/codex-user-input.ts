import { respondToCodexAppServerUserInput } from "../../codex/app-server.js";
import { getWorkbenchSnapshot, type WorkbenchProjectInput } from "../../workbench/manager.js";
import type { ManagedProject } from "../../types/index.js";
import { requireChangeId } from "./http.js";
import type { CodexUserInputAnswerRequest } from "./types.js";

export async function handleCodexUserInputAnswer(
  input: WorkbenchProjectInput & { project: ManagedProject },
  requestId: string,
  body: CodexUserInputAnswerRequest,
): Promise<{ result: unknown; snapshot: unknown }> {
  const changeId = requireChangeId(body.changeId);
  const answers = normalizeCodexUserInputAnswers(body);
  await respondToCodexAppServerUserInput(changeId, requestId, { answers });
  return {
    result: { status: "submitted", requestId },
    snapshot: await getWorkbenchSnapshot(input, { topicId: changeId }),
  };
}

function normalizeCodexUserInputAnswers(body: CodexUserInputAnswerRequest): Record<string, string | string[]> {
  if (body.answers && Object.keys(body.answers).length > 0) return body.answers;
  if (typeof body.answer === "string" && body.answer.trim()) return { q1: body.answer.trim() };
  const error = new Error("Codex user input answer is required.");
  error.name = "BadRequest";
  throw error;
}
