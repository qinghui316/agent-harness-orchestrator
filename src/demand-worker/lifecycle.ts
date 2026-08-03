import type { DemandWorker, DemandWorkerAttempt, MainOrchestratorDecision, MainOrchestratorDecisionAction } from "../types/index.js";
import type { DemandWorkerStorePort } from "./paths.js";
import type { CompleteDemandWorkerInput } from "./types.js";
import { recordMainOrchestratorDecision } from "./decisions.js";
import { getDemandWorkerForChange, writeDemandWorker, writeDemandWorkerAttempt } from "./repository.js";

export async function markDemandWorkerRunning(memory: DemandWorkerStorePort, worker: DemandWorker, attempt: DemandWorkerAttempt): Promise<{ worker: DemandWorker; attempt: DemandWorkerAttempt }> {
  const now = new Date().toISOString();
  const runningWorker = await writeDemandWorker(memory, {
    ...worker,
    status: "running",
    updatedAt: now,
    startedAt: worker.startedAt ?? now,
  });
  const runningAttempt = await writeDemandWorkerAttempt(memory, {
    ...attempt,
    status: "running",
    updatedAt: now,
    startedAt: attempt.startedAt ?? now,
  });
  return { worker: runningWorker, attempt: runningAttempt };
}

export async function completeDemandWorkerAttempt(
  memory: DemandWorkerStorePort,
  worker: DemandWorker,
  attempt: DemandWorkerAttempt,
  input: CompleteDemandWorkerInput,
): Promise<{ worker: DemandWorker; attempt: DemandWorkerAttempt; decision: MainOrchestratorDecision }> {
  const now = new Date().toISOString();
  const attemptStatus = demandWorkerStatusToAttemptStatus(input.status);
  const completedAttempt = await writeDemandWorkerAttempt(memory, {
    ...attempt,
    status: attemptStatus,
    updatedAt: now,
    finishedAt: now,
    agentTaskIds: input.agentTaskIds ?? attempt.agentTaskIds,
    ...(input.resultStatus ? { resultStatus: input.resultStatus } : {}),
    resultSummary: input.summary,
    ...(input.failureReason ? { failureReason: input.failureReason } : {}),
  });
  const completedWorker = await writeDemandWorker(memory, {
    ...worker,
    status: input.status,
    activeAttemptId: undefined,
    updatedAt: now,
    finishedAt: now,
    resultSummary: input.summary,
    ...(input.failureReason ? { failureReason: input.failureReason } : {}),
  });
  const decision = await recordMainOrchestratorDecision(memory, {
    changeId: worker.changeId,
    workerId: worker.id,
    attemptId: attempt.id,
    action: decisionActionFromWorkerStatus(input.status),
    summary: input.summary,
    reason: input.failureReason ?? resultReasonFromWorkerStatus(input.status),
    artifactRefs: [],
  });
  return { worker: completedWorker, attempt: completedAttempt, decision };
}

export async function releaseDemandWorker(memory: DemandWorkerStorePort, changeId: string, reason: string): Promise<DemandWorker | null> {
  const existing = await getDemandWorkerForChange(memory, changeId);
  if (!existing) return null;
  const now = new Date().toISOString();
  const worker = await writeDemandWorker(memory, {
    ...existing,
    status: "released",
    updatedAt: now,
    finishedAt: now,
    activeAttemptId: undefined,
    resultSummary: reason,
  });
  await recordMainOrchestratorDecision(memory, {
    changeId,
    workerId: worker.id,
    action: "done",
    summary: reason,
    reason: "Demand worker was released by local orchestrator policy.",
    artifactRefs: [],
  });
  return worker;
}

export function demandWorkerStatusToAttemptStatus(status: CompleteDemandWorkerInput["status"]): DemandWorkerAttempt["status"] {
  if (status === "result-ready" || status === "completed" || status === "released") return "completed";
  if (status === "needs-user-input") return "needs-user-input";
  return "failed";
}

export function decisionActionFromWorkerStatus(status: CompleteDemandWorkerInput["status"]): MainOrchestratorDecisionAction {
  if (status === "result-ready") return "result-review";
  if (status === "needs-user-input" || status === "failed") return "needs-user-input";
  return "done";
}

export function resultReasonFromWorkerStatus(status: CompleteDemandWorkerInput["status"]): string {
  if (status === "result-ready") return "Main-agent role orchestration produced evidence for user result review.";
  if (status === "needs-user-input") return "Main-agent role orchestration needs user input before continuing.";
  if (status === "failed") return "Main-agent role orchestration failed before result review.";
  return "Demand worker reached a terminal state.";
}
