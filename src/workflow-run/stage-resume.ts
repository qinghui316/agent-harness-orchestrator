import { listAuditResults } from "../audit/artifacts.js";
import { listRuns } from "../run/manager.js";
import type { ResolvedMemory, StageResumeVerdict, TaskRun } from "../types/index.js";
import { listValidationResults } from "../validation/artifacts.js";

export async function deriveStageResumeVerdict(memory: ResolvedMemory, changeId: string, taskRun: TaskRun): Promise<StageResumeVerdict> {
  const runs = await listRuns(memory);
  const coderRun = runs.find((run) => run.taskRunId === taskRun.id && run.changeId === changeId);
  if (!coderRun) {
    return { kind: "start-coder", taskRunId: taskRun.id, taskId: taskRun.taskId, reason: "No coder run evidence exists for this TaskRun.", evidenceRefs: [] };
  }
  if (coderRun.status !== "completed" || !coderRun.worktree?.worktreeId) {
    return { kind: "blocked", taskRunId: taskRun.id, taskId: taskRun.taskId, runId: coderRun.id, reason: "Coder evidence is missing, failed, or has no worktree.", evidenceRefs: [coderRun.artifacts.directory] };
  }
  const validations = await listValidationResults(memory, changeId);
  const validation = validations.find((item) => item.worktreeId === coderRun.worktree?.worktreeId);
  if (!validation) {
    return { kind: "continue-validation", taskRunId: taskRun.id, taskId: taskRun.taskId, runId: coderRun.id, worktreeId: coderRun.worktree.worktreeId, reason: "Coder completed; validation evidence is missing.", evidenceRefs: [coderRun.artifacts.directory] };
  }
  if (validation.status !== "passed") {
    return { kind: "continue-rework", taskRunId: taskRun.id, taskId: taskRun.taskId, runId: coderRun.id, worktreeId: coderRun.worktree.worktreeId, validationId: validation.id, reason: "Validation failed; bounded rework is the next safe stage.", evidenceRefs: [coderRun.artifacts.directory, validation.id] };
  }
  const audits = await listAuditResults(memory, changeId);
  const audit = audits.find((item) => item.worktreeId === coderRun.worktree?.worktreeId);
  if (!audit) {
    return { kind: "continue-audit", taskRunId: taskRun.id, taskId: taskRun.taskId, runId: coderRun.id, worktreeId: coderRun.worktree.worktreeId, validationId: validation.id, reason: "Validation passed; audit evidence is missing.", evidenceRefs: [coderRun.artifacts.directory, validation.id] };
  }
  if (audit.status === "approved" || audit.status === "approved-with-notes") {
    return { kind: "completed", taskRunId: taskRun.id, taskId: taskRun.taskId, runId: coderRun.id, worktreeId: coderRun.worktree.worktreeId, validationId: validation.id, auditId: audit.id, reason: "Coder, validation, and audit evidence are complete.", evidenceRefs: [coderRun.artifacts.directory, validation.id, audit.id] };
  }
  return { kind: "continue-rework", taskRunId: taskRun.id, taskId: taskRun.taskId, runId: coderRun.id, worktreeId: coderRun.worktree.worktreeId, validationId: validation.id, auditId: audit.id, reason: `Audit ${audit.status}; bounded rework is the next safe stage.`, evidenceRefs: [coderRun.artifacts.directory, validation.id, audit.id] };
}
