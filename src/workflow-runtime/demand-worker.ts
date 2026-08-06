import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { listAgentTasks } from "../agent-task/manager.js";
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
} from "../demand-worker/manager.js";
import type { ManagedProject } from "../types/index.js";
import type { ProjectExecutionRuntimePort } from "../project-runtime/execution-ports.js";
import { emitAssistantEvent, type WorkflowRuntimeLiveSink } from "./kernel/live-events.js";
import { runTopLevelRoleChainWorkflow } from "./top-level-role-chain.js";

type ClaimedDemandWorker = NonNullable<Awaited<ReturnType<typeof claimNextDemandWorker>>>;

export interface SkillNativeDemandWorkerRuntime {
  runtime: ProjectExecutionRuntimePort;
  changeRoot(changeId: string): string | Promise<string>;
}

type DemandWorkerRuntimeStore = ProjectExecutionRuntimePort;

export async function enqueueDemandWorkerForRuntime(
  project: ManagedProject,
  changeId: string,
  skillNative: SkillNativeDemandWorkerRuntime,
): Promise<unknown> {
  const memory = await resolveDemandWorkerStore(project, skillNative);
  return enqueueDemandWorker(memory, { changeId, waitingReason: "用户请求加入本地处理队列。" });
}

export async function startNextDemandWorkerForRuntime(
  project: ManagedProject,
  changeId: string,
  prompt: string | undefined,
  live: WorkflowRuntimeLiveSink | undefined,
  skillNative: SkillNativeDemandWorkerRuntime,
): Promise<unknown> {
  return startDemandWorkerForChange(project, changeId, prompt, live, skillNative);
}

export async function pumpDemandWorkersForRuntime(
  project: ManagedProject,
  prompt: string | undefined,
  live: WorkflowRuntimeLiveSink | undefined,
  liveChangeId: string | undefined,
  skillNative: SkillNativeDemandWorkerRuntime,
): Promise<unknown> {
  const memory = await resolveDemandWorkerStore(project, skillNative);
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
    scheduleClaimedDemandWorker(project, memory, claim, skillNative);
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
    const result = await runClaimedDemandWorker(project, memory, liveClaim, prompt, live, skillNative);
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

export async function evaluateDemandOrchestratorRuntime(
  project: ManagedProject,
  changeId: string,
  skillNative: SkillNativeDemandWorkerRuntime,
): Promise<unknown> {
  const memory = await resolveDemandWorkerStore(project, skillNative);
  const worker = await getDemandWorkerForChange(memory, changeId);
  const decisions = (await reconcileDemandWorkers(memory)).decisions.filter((decision) => decision.changeId === changeId);
  return { worker, decisions };
}

export async function reconcileDemandWorkersForRuntime(
  project: ManagedProject,
  skillNative: SkillNativeDemandWorkerRuntime,
): Promise<unknown> {
  return reconcileDemandWorkers(await resolveDemandWorkerStore(project, skillNative));
}

export async function releaseDemandWorkerForRuntime(
  project: ManagedProject,
  changeId: string,
  reason: string | undefined,
  skillNative: SkillNativeDemandWorkerRuntime,
): Promise<unknown> {
  const memory = await resolveDemandWorkerStore(project, skillNative);
  return releaseDemandWorker(memory, changeId, reason?.trim() || "Demand worker released by user action.");
}

async function startDemandWorkerForChange(
  project: ManagedProject,
  changeId: string,
  prompt: string | undefined,
  live: WorkflowRuntimeLiveSink | undefined,
  skillNative: SkillNativeDemandWorkerRuntime,
): Promise<unknown> {
  const memory = skillNative.runtime;
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
  return runClaimedDemandWorker(project, memory, claimed, prompt, live, skillNative);
}

async function runClaimedDemandWorker(
  project: ManagedProject,
  memory: DemandWorkerRuntimeStore,
  claimed: ClaimedDemandWorker,
  prompt: string | undefined,
  live: WorkflowRuntimeLiveSink | undefined,
  skillNative: SkillNativeDemandWorkerRuntime,
): Promise<unknown> {
  const changeId = claimed.worker.changeId;
  const running = await markDemandWorkerRunning(memory, claimed.worker, claimed.attempt);
  emitAssistantEvent(live, {
    runId: running.worker.id,
    kind: "status",
    phase: "demand-worker-running",
    title: "Demand worker started",
    summary: "本地主 orchestrator 已领取该需求，开始 Workflow Runtime 默认代码变更流程。",
  });
  try {
    if (!await hasConfirmedPlanningArtifacts(changeId, skillNative)) {
      const completed = await completeDemandWorkerAttempt(memory, running.worker, running.attempt, {
        status: "needs-user-input",
        resultStatus: "needs-user-input",
        summary: "Demand execution needs confirmed planning artifacts before role agents can run.",
        failureReason: "The demand worker was queued without confirmed spec, plan, tasks, and AC map artifacts.",
      });
      scheduleDemandWorkerPump(project, skillNative);
      return { status: completed.worker.status, worker: completed.worker, attempt: completed.attempt, decision: completed.decision };
    }
    const beforeTasks = await listAgentTasks(memory, changeId).catch(() => []);
    const result = await runTopLevelRoleChainWorkflow({ project, changeId, prompt, live, continuation: false });
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
    scheduleDemandWorkerPump(project, skillNative);
    return { status: completed.worker.status, worker: completed.worker, attempt: completed.attempt, orchestrationResult: result, rolePipeline: result, decision: completed.decision };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const completed = await completeDemandWorkerAttempt(memory, running.worker, running.attempt, {
      status: "failed",
      resultStatus: "failed",
      summary: `Workflow Runtime top-level role-chain execution failed: ${message}`,
      failureReason: message,
    });
    scheduleDemandWorkerPump(project, skillNative);
    throw Object.assign(error instanceof Error ? error : new Error(message), { demandWorker: completed.worker.id });
  }
}

async function hasConfirmedPlanningArtifacts(
  changeId: string,
  skillNative: SkillNativeDemandWorkerRuntime,
): Promise<boolean> {
  try {
    const changeDir = await skillNative.changeRoot(changeId);
    if (!existsSync(join(changeDir, "ac-map.json"))) return false;
    for (const file of ["spec.md", "plan.md", "tasks.md"]) {
      const path = join(changeDir, file);
      if (!existsSync(path)) return false;
      if (hasUnresolvedPlanningPlaceholder(await readFile(path, "utf8"))) return false;
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
  memory: DemandWorkerRuntimeStore,
  claimed: ClaimedDemandWorker,
  skillNative: SkillNativeDemandWorkerRuntime,
): void {
  setTimeout(() => {
    void runClaimedDemandWorker(project, memory, claimed, undefined, undefined, skillNative).catch(() => undefined);
  }, 0);
}

function scheduleDemandWorkerPump(project: ManagedProject, skillNative: SkillNativeDemandWorkerRuntime): void {
  setTimeout(() => {
    void pumpDemandWorkersForRuntime(project, undefined, undefined, undefined, skillNative).catch(() => undefined);
  }, 0);
}

async function resolveDemandWorkerStore(
  project: ManagedProject,
  skillNative: SkillNativeDemandWorkerRuntime,
): Promise<DemandWorkerRuntimeStore> {
  if (project.id !== skillNative.runtime.projectId) throw new Error("Demand worker project identity is stale.");
  return skillNative.runtime;
}

function workerStatusFromPipelineResult(result: unknown): "result-ready" | "needs-user-input" | "failed" {
  if (!isRecord(result)) return "result-ready";
  if (result.status === "failed") return "failed";
  if (result.status === "needs-user-input" || result.requiresUserInput) return "needs-user-input";
  return "result-ready";
}

function summarizePipelineResult(result: unknown): string {
  if (!isRecord(result)) return "Workflow Runtime top-level role-chain execution completed and produced result review evidence.";
  if (typeof result.status === "string") {
    if (result.status === "completed") return "Workflow Runtime top-level role-chain execution completed and produced result review evidence.";
    if (result.status === "needs-user-input") return `Workflow Runtime top-level role-chain execution needs user input${typeof result.stoppedAt === "string" ? ` after ${result.stoppedAt}` : ""}.`;
    if (result.status === "failed") return "Workflow Runtime top-level role-chain execution failed before result review.";
  }
  return "Workflow Runtime top-level role-chain execution finished with recorded evidence.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
