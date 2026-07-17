import { reanalyzeIntake, runIntakeScan } from "../../workbench/intake.js";
import { getWorkbenchSnapshot, type WorkbenchProjectInput } from "../../workbench/projections/read-model/implementation.js";
import type { ManagedProject } from "../../types/index.js";
import { requireChangeId } from "./http.js";
import type { IntakeRequest } from "./types.js";

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
