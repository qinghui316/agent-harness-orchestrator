import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { listAgentTasks } from "../../agent-task/manager.js";
import {
  createMainAgentOrchestrationState,
  decideNextMainAgentOrchestration,
  type MainAgentOrchestrationDecision,
  type MainAgentOrchestrationRole,
  type MainAgentOrchestrationState,
} from "../../agent-task/orchestration-engine.js";
import {
  claimAvailableDemandWorkers,
  claimNextDemandWorker,
  completeDemandWorkerAttempt,
  enqueueDemandWorker,
  getDemandWorkerForChange,
  markDemandWorkerRunning,
  reconcileDemandWorkers,
  recordMainOrchestratorDecision,
  releaseDemandWorker,
} from "../../demand-worker/manager.js";
import { assertWritableMemory, resolveProjectMemory } from "../../memory/resolver.js";
import type { ManagedProject, ResolvedMemory } from "../../types/index.js";
import { runCodeValidateAuditSequence } from "../../workflow-runtime/code-workflow.js";
import { emitAssistantEvent } from "../live-events.js";
import { resolveTopic } from "../topic-resolver.js";
import type { WorkbenchLiveSink } from "../types.js";

export async function enqueueDemandWorkerForAction(project: ManagedProject, changeId: string): Promise<unknown> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Demand worker enqueue");
  return enqueueDemandWorker(memory, { changeId, waitingReason: "用户请求加入本地处理队列。" });
}

export async function startNextDemandWorkerForAction(
  project: ManagedProject,
  changeId: string,
  prompt: string | undefined,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  return startDemandWorkerForChange(project, changeId, prompt, live);
}

export async function pumpDemandWorkersForAction(
  project: ManagedProject,
  prompt: string | undefined,
  live: WorkbenchLiveSink | undefined,
  liveChangeId?: string,
): Promise<unknown> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Demand worker pump");
  const claimed = await claimAvailableDemandWorkers(memory);
  if (claimed.length === 0) {
    if (liveChangeId) {
      const worker = await getDemandWorkerForChange(memory, liveChangeId);
      if (worker && worker.status === "queued") {
        await recordMainOrchestratorDecision(memory, {
          changeId: liveChangeId,
          workerId: worker.id,
          action: "enqueue",
          summary: "Demand is waiting for a local worker slot.",
          reason: "No demand worker slot is currently available.",
          artifactRefs: [],
        });
        return { status: "queued", claimed: 0, worker, results: [] };
      }
    }
    return { status: "idle", claimed: 0, results: [] };
  }
  const liveClaim = liveChangeId ? claimed.find((claim) => claim.worker.changeId === liveChangeId) : undefined;
  const backgroundClaims = claimed.filter((claim) => claim !== liveClaim);
  for (const claim of backgroundClaims) {
    scheduleClaimedDemandWorker(project, memory, claim);
  }
  if (!liveClaim) {
    if (liveChangeId) {
      const worker = await getDemandWorkerForChange(memory, liveChangeId);
      if (worker && worker.status === "queued") {
        await recordMainOrchestratorDecision(memory, {
          changeId: liveChangeId,
          workerId: worker.id,
          action: "enqueue",
          summary: "Demand is waiting for a local worker slot.",
          reason: "Available demand worker slots were assigned to earlier queued demands.",
          artifactRefs: [],
        });
        return { status: "queued", claimed: claimed.length, backgroundStarted: backgroundClaims.length, worker, results: [] };
      }
    }
    return { status: "pumped", claimed: claimed.length, backgroundStarted: backgroundClaims.length, results: [] };
  }
  try {
    const result = await runClaimedDemandWorker(project, memory, liveClaim, prompt, live);
    return { status: "pumped", claimed: claimed.length, backgroundStarted: backgroundClaims.length, results: [result] };
  } catch (error) {
    return {
      status: "pumped",
      claimed: claimed.length,
      backgroundStarted: backgroundClaims.length,
      results: [{
        status: "failed",
        worker: liveClaim.worker,
        attempt: liveClaim.attempt,
        error: error instanceof Error ? error.message : String(error),
      }],
    };
  }
}

export async function evaluateDemandOrchestrator(project: ManagedProject, changeId: string): Promise<unknown> {
  const memory = await resolveProjectMemory(project);
  const worker = await getDemandWorkerForChange(memory, changeId);
  const decisions = (await reconcileDemandWorkers(memory)).decisions.filter((decision) => decision.changeId === changeId);
  return { worker, decisions };
}

export async function reconcileDemandWorkersForAction(project: ManagedProject): Promise<unknown> {
  return reconcileDemandWorkers(await resolveProjectMemory(project));
}

export async function releaseDemandWorkerForAction(project: ManagedProject, changeId: string, reason: string | undefined): Promise<unknown> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Demand worker release");
  return releaseDemandWorker(memory, changeId, reason?.trim() || "Demand worker released by user action.");
}

async function startDemandWorkerForChange(
  project: ManagedProject,
  changeId: string,
  prompt: string | undefined,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Demand worker start");
  const claimed = await claimNextDemandWorker(memory, { changeId });
  if (!claimed) {
    const worker = await getDemandWorkerForChange(memory, changeId);
    await recordMainOrchestratorDecision(memory, {
      changeId,
      workerId: worker?.id,
      action: "enqueue",
      summary: "Demand is waiting for a local worker slot.",
      reason: "No demand worker slot is currently available.",
      artifactRefs: [],
    });
    return { status: "queued", worker };
  }
  return runClaimedDemandWorker(project, memory, claimed, prompt, live);
}

async function runClaimedDemandWorker(
  project: ManagedProject,
  memory: ResolvedMemory,
  claimed: NonNullable<Awaited<ReturnType<typeof claimNextDemandWorker>>>,
  prompt: string | undefined,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  const changeId = claimed.worker.changeId;
  const running = await markDemandWorkerRunning(memory, claimed.worker, claimed.attempt);
  emitAssistantEvent(live, {
    runId: running.worker.id,
    kind: "status",
    phase: "demand-worker-running",
    title: "Demand worker started",
    summary: "本地主 orchestrator 已领取该需求，开始 main-agent tool orchestration。",
  });
  try {
    if (!await hasConfirmedPlanningArtifacts(project, changeId)) {
      const completed = await completeDemandWorkerAttempt(memory, running.worker, running.attempt, {
        status: "needs-user-input",
        resultStatus: "needs-user-input",
        summary: "Demand execution needs confirmed planning artifacts before role agents can run.",
        failureReason: "The demand worker was queued without confirmed spec, plan, tasks, and AC map artifacts.",
      });
      scheduleDemandWorkerPump(project);
      return { status: completed.worker.status, worker: completed.worker, attempt: completed.attempt, decision: completed.decision };
    }
    const beforeTasks = await listAgentTasks(memory, changeId).catch(() => []);
    const result = await runMainAgentToolOrchestration(project, changeId, prompt, live, false);
    const afterTasks = await listAgentTasks(memory, changeId).catch(() => []);
    const beforeTaskIds = new Set(beforeTasks.map((task) => task.id));
    const newAgentTaskIds = afterTasks.filter((task) => !beforeTaskIds.has(task.id)).map((task) => task.id);
    const status = workerStatusFromPipelineResult(result);
    const completed = await completeDemandWorkerAttempt(memory, running.worker, running.attempt, {
      status,
      resultStatus: isRecord(result) && typeof result.status === "string" ? result.status : status,
      summary: summarizePipelineResult(result),
      failureReason: status === "needs-user-input" || status === "failed" ? summarizePipelineResult(result) : undefined,
      agentTaskIds: newAgentTaskIds,
    });
    scheduleDemandWorkerPump(project);
    return { status: completed.worker.status, worker: completed.worker, attempt: completed.attempt, rolePipeline: result, decision: completed.decision };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const completed = await completeDemandWorkerAttempt(memory, running.worker, running.attempt, {
      status: "failed",
      resultStatus: "failed",
      summary: `Main-agent tool orchestration failed: ${message}`,
      failureReason: message,
    });
    scheduleDemandWorkerPump(project);
    throw Object.assign(error instanceof Error ? error : new Error(message), { demandWorker: completed.worker.id });
  }
}

async function hasConfirmedPlanningArtifacts(project: ManagedProject, changeId: string): Promise<boolean> {
  try {
    const { memory, changePath } = await resolveTopic(project, changeId);
    const changeDir = join(memory.memoryRoot, changePath);
    if (!existsSync(join(changeDir, "ac-map.json"))) return false;
    for (const file of ["spec.md", "plan.md", "tasks.md"]) {
      const path = join(changeDir, file);
      if (!existsSync(path)) return false;
      const content = await readFile(path, "utf8");
      if (hasUnresolvedPlanningPlaceholder(content)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function hasUnresolvedPlanningPlaceholder(content: string): boolean {
  return /(^|\n)\s*(?:-\s*)?(?:\[[ xX]\]\s*)?TBD\s*(?=\n|$)/.test(content);
}

function scheduleClaimedDemandWorker(
  project: ManagedProject,
  memory: ResolvedMemory,
  claimed: NonNullable<Awaited<ReturnType<typeof claimNextDemandWorker>>>,
): void {
  setTimeout(() => {
    void runClaimedDemandWorker(project, memory, claimed, undefined, undefined).catch(() => undefined);
  }, 0);
}

function scheduleDemandWorkerPump(project: ManagedProject): void {
  setTimeout(() => {
    void pumpDemandWorkersForAction(project, undefined, undefined).catch(() => undefined);
  }, 0);
}

function workerStatusFromPipelineResult(result: unknown): "result-ready" | "needs-user-input" | "failed" {
  if (!isRecord(result)) return "result-ready";
  if (result.status === "failed") return "failed";
  if (result.status === "needs-user-input" || result.requiresUserInput) return "needs-user-input";
  return "result-ready";
}

function summarizePipelineResult(result: unknown): string {
  if (!isRecord(result)) return "Main-agent tool orchestration completed and produced result review evidence.";
  if (typeof result.status === "string") {
    if (result.status === "completed") return "Main-agent tool orchestration completed and produced result review evidence.";
    if (result.status === "needs-user-input") return `Main-agent tool orchestration needs user input${typeof result.stoppedAt === "string" ? ` after ${result.stoppedAt}` : ""}.`;
    if (result.status === "failed") return "Main-agent tool orchestration failed before result review.";
  }
  return "Main-agent tool orchestration finished with recorded evidence.";
}

export async function runMainAgentToolOrchestration(
  project: ManagedProject,
  changeId: string,
  prompt: string | undefined,
  live: WorkbenchLiveSink | undefined,
  continuation: boolean,
  taskIds?: string[],
  readinessManifestId?: string,
): Promise<unknown> {
  emitAssistantEvent(live, {
    runId: changeId,
    kind: "status",
    phase: "main-agent-tool-orchestration",
    title: continuation ? "Main-agent orchestration continued" : "Main-agent orchestration started",
    summary: "主 agent 将按当前证据逐步委派角色任务；每一步都经过 ToolPolicyGate、RoleDispatcher 和 AgentTaskResult。",
  });
  let orchestration = createMainAgentOrchestrationState({ changeId });
  const firstDecision = decideNextMainAgentOrchestration(orchestration);
  assertDelegateDecision(firstDecision, "coder-agent");
  const first = await runCodeValidateAuditSequence(project, changeId, prompt, live, taskIds, undefined, firstDecision.roleId, orchestration, firstDecision, readinessManifestId ? { mode: "single-change-readiness", readinessManifestId } : undefined);
  orchestration = readWorkflowOrchestration(first, orchestration);
  const next = decideNextMainAgentOrchestration(orchestration);
  if (next.kind === "completed") {
    return { status: "completed", attempts: [{ kind: "initial", result: first }], reworkUsed: 0, orchestration };
  }
  if (next.kind === "failed") {
    return { status: "failed", attempts: [{ kind: "initial", result: first }], reworkUsed: 0, requiresUserInput: true, stoppedAt: next.stoppedAt, orchestration };
  }
  if (next.kind === "needs-user-input") {
    return { status: "needs-user-input", attempts: [{ kind: "initial", result: first }], reworkUsed: 0, requiresUserInput: true, stoppedAt: next.stoppedAt, orchestration };
  }
  assertDelegateDecision(next, "rework-coder");
  emitAssistantEvent(live, {
    runId: changeId,
    kind: "status",
    phase: "automatic-rework",
    title: "Automatic rework started",
    summary: `${next.reason} AHO is sending the evidence back to rework-coder once.`,
    isError: true,
  });
  const reworkPrompt = [
    "Use the failed official validation/audit evidence from the previous attempt.",
    "Repair only the accepted demand in the assigned worktree.",
    "Do not change canonical planning artifacts.",
    prompt ?? "",
  ].join("\n\n");
  const second = await runCodeValidateAuditSequence(project, changeId, reworkPrompt, live, undefined, undefined, next.roleId, orchestration, next);
  orchestration = readWorkflowOrchestration(second, orchestration);
  const finalDecision = decideNextMainAgentOrchestration(orchestration);
  return {
    status: finalDecision.kind === "completed" ? "completed" : finalDecision.kind,
    attempts: [
      { kind: "initial", result: first },
      { kind: "automatic-rework", result: second },
    ],
    reworkUsed: 1,
    requiresUserInput: finalDecision.kind !== "completed",
    stoppedAt: finalDecision.kind === "needs-user-input" || finalDecision.kind === "failed" ? finalDecision.stoppedAt : undefined,
    orchestration,
  };
}

function assertDelegateDecision(decision: MainAgentOrchestrationDecision, roleId: MainAgentOrchestrationRole): asserts decision is Extract<MainAgentOrchestrationDecision, { kind: "delegate-role" }> {
  if (decision.kind !== "delegate-role" || decision.roleId !== roleId) {
    throw new Error(`Main-agent decision engine expected ${roleId}, got ${decision.kind}${decision.kind === "delegate-role" ? `:${decision.roleId}` : ""}.`);
  }
}

function readWorkflowOrchestration(result: unknown, fallback: MainAgentOrchestrationState): MainAgentOrchestrationState {
  if (isRecord(result) && isRecord(result.orchestration)) {
    const state = result.orchestration;
    if (typeof state.changeId === "string" && Array.isArray(state.steps) && typeof state.maxReworkAttempts === "number") {
      return state as unknown as MainAgentOrchestrationState;
    }
  }
  return fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
