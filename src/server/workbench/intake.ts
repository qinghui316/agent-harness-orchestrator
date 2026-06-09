import { answerClarification, reanalyzeIntake, runIntakeScan, skipClarification, type ClarificationAnswer } from "../../workbench/intake.js";
import { getWorkbenchSnapshot, type WorkbenchProjectInput } from "../../workbench/manager.js";
import type { ManagedProject } from "../../types/index.js";
import { requireChangeId } from "./http.js";
import type { ClarificationAnswerRequest, IntakeRequest } from "./types.js";

export async function handleIntakeScan(input: WorkbenchProjectInput & { project: ManagedProject }, body: IntakeRequest): Promise<{ result: unknown; snapshot: unknown }> {
  const changeId = requireChangeId(body.changeId);
  const result = await runIntakeScan(input.project, changeId, body.prompt ?? body.message ?? "");
  return { result, snapshot: await getWorkbenchSnapshot(input, { topicId: changeId }) };
}

export async function handleIntakeReanalyze(input: WorkbenchProjectInput & { project: ManagedProject }, body: IntakeRequest): Promise<{ result: unknown; snapshot: unknown }> {
  const changeId = requireChangeId(body.changeId);
  const message = (body.message ?? body.prompt ?? "").trim();
  if (!message) {
    const error = new Error("intake.reanalyze requires message or prompt.");
    error.name = "BadRequest";
    throw error;
  }
  const result = await reanalyzeIntake(input.project, changeId, message);
  return { result, snapshot: await getWorkbenchSnapshot(input, { topicId: changeId }) };
}

export async function handleClarificationAnswer(input: WorkbenchProjectInput & { project: ManagedProject }, clarificationId: string, body: ClarificationAnswerRequest): Promise<{ result: unknown; snapshot: unknown }> {
  const changeId = requireChangeId(body.changeId);
  const answers = normalizeClarificationAnswers(body);
  const result = await answerClarification(input.project, changeId, clarificationId, answers);
  return { result, snapshot: await getWorkbenchSnapshot(input, { topicId: changeId }) };
}

export async function handleClarificationSkip(input: WorkbenchProjectInput & { project: ManagedProject }, clarificationId: string, body: ClarificationAnswerRequest): Promise<{ result: unknown; snapshot: unknown }> {
  const changeId = requireChangeId(body.changeId);
  const result = await skipClarification(input.project, changeId, clarificationId);
  return { result, snapshot: await getWorkbenchSnapshot(input, { topicId: changeId }) };
}

function normalizeClarificationAnswers(body: ClarificationAnswerRequest): ClarificationAnswer[] {
  if (Array.isArray(body.answers) && body.answers.length > 0) return body.answers;
  if (typeof body.answer === "string" && body.answer.trim()) return [{ questionId: "q1", answer: body.answer.trim() }];
  const error = new Error("Clarification answer is required.");
  error.name = "BadRequest";
  throw error;
}
