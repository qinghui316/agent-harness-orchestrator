import {
  createMainAgentOrchestrationState,
  decideNextMainAgentOrchestration,
  type MainAgentOrchestrationDecision,
  type MainAgentOrchestrationRole,
  type MainAgentOrchestrationState,
} from "../agent-task/orchestration-engine.js";
import type { ManagedProject } from "../types/index.js";
import type { WorkbenchLiveSink } from "../workbench/types.js";
import { emitAssistantEvent } from "../workflow-runtime/kernel/live-events.js";
import type { CodeExecutionGateOptions } from "../code/manager.js";
import { resolveProjectMemory } from "../memory/resolver.js";
import { createMainAgentLoopRunId, finishMainAgentLoopRun } from "./loop-evidence.js";
import { runMainAgentStepLoop, type MainAgentLeafAttemptResult } from "./step-loop.js";

export type { MainAgentLeafAttemptResult } from "./step-loop.js";

export interface MainAgentOrchestrationAttempt {
  kind: "initial" | "automatic-rework";
  result: MainAgentLeafAttemptResult;
}

export interface MainAgentOrchestrationResult {
  status: "completed" | "failed" | "needs-user-input";
  attempts: MainAgentOrchestrationAttempt[];
  reworkUsed: number;
  requiresUserInput?: boolean;
  stoppedAt?: "boundary" | "code" | "validation" | "audit";
  orchestration: MainAgentOrchestrationState;
}

export async function runMainAgentOrchestration(input: {
  project: ManagedProject;
  changeId: string;
  prompt?: string;
  live?: WorkbenchLiveSink;
  continuation?: boolean;
  taskIds?: string[];
  readinessManifestId?: string;
}): Promise<MainAgentOrchestrationResult> {
  emitAssistantEvent(input.live, {
    runId: input.changeId,
    kind: "status",
    phase: "main-agent-tool-orchestration",
    title: input.continuation ? "Main-agent orchestration continued" : "Main-agent orchestration started",
    summary: "主 agent 将按当前证据逐步委派角色任务；每一步都经过 ToolPolicyGate、RoleDispatcher 和 AgentTaskResult。",
  });
  let orchestration = createMainAgentOrchestrationState({ changeId: input.changeId });
  const loopRunId = createMainAgentLoopRunId(input.changeId);
  const firstDecision = decideNextMainAgentOrchestration(orchestration);
  assertDelegateDecision(firstDecision, "coder-agent");
  const first = await runMainAgentStepLoop({
    project: input.project,
    changeId: input.changeId,
    prompt: input.prompt,
    live: input.live,
    taskIds: input.taskIds,
    entrypoint: "top-level",
    initialRole: firstDecision.roleId,
    orchestrationState: orchestration,
    initialDecision: firstDecision,
    executionGate: input.readinessManifestId ? { mode: "single-change-readiness", readinessManifestId: input.readinessManifestId } : undefined,
    loopRunId,
    finalizeLoop: false,
  });
  orchestration = first.orchestration;
  const next = decideNextMainAgentOrchestration(orchestration);
  if (next.kind === "completed") {
    await finishTopLevelLoop(input.project, loopRunId, "completed", "Top-level main-agent orchestration completed.", null);
    return { status: "completed", attempts: [{ kind: "initial", result: first }], reworkUsed: 0, orchestration };
  }
  if (next.kind === "failed") {
    await finishTopLevelLoop(input.project, loopRunId, "stopped", next.reason, next.stoppedAt);
    return { status: "failed", attempts: [{ kind: "initial", result: first }], reworkUsed: 0, requiresUserInput: true, stoppedAt: next.stoppedAt, orchestration };
  }
  if (next.kind === "needs-user-input") {
    await finishTopLevelLoop(input.project, loopRunId, "stopped", next.reason, next.stoppedAt);
    return { status: "needs-user-input", attempts: [{ kind: "initial", result: first }], reworkUsed: 0, requiresUserInput: true, stoppedAt: next.stoppedAt, orchestration };
  }
  assertDelegateDecision(next, "rework-coder");
  emitAssistantEvent(input.live, {
    runId: input.changeId,
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
    input.prompt ?? "",
  ].join("\n\n");
  const second = await runMainAgentStepLoop({
    project: input.project,
    changeId: input.changeId,
    prompt: reworkPrompt,
    live: input.live,
    entrypoint: "top-level",
    initialRole: next.roleId,
    orchestrationState: orchestration,
    initialDecision: next,
    loopRunId,
  });
  orchestration = second.orchestration;
  const finalDecision = decideNextMainAgentOrchestration(orchestration);
  const finalStatus = finalDecision.kind === "completed"
    ? "completed"
    : finalDecision.kind === "failed" || finalDecision.kind === "needs-user-input"
      ? finalDecision.kind
      : "needs-user-input";
  return {
    status: finalStatus,
    attempts: [
      { kind: "initial", result: first },
      { kind: "automatic-rework", result: second },
    ],
    reworkUsed: 1,
    requiresUserInput: finalStatus !== "completed",
    stoppedAt: finalDecision.kind === "needs-user-input" || finalDecision.kind === "failed" ? finalDecision.stoppedAt : undefined,
    orchestration,
  };
}

export async function runMainAgentTaskRunAttempt(input: {
  project: ManagedProject;
  changeId: string;
  prompt?: string;
  live?: WorkbenchLiveSink;
  taskIds?: string[];
  taskRunId?: string;
  executionGate?: CodeExecutionGateOptions;
  initialRole?: MainAgentOrchestrationRole;
  orchestrationState?: MainAgentOrchestrationState;
  initialDecision?: Extract<MainAgentOrchestrationDecision, { kind: "delegate-role" }>;
  loopRunId?: string;
  finalizeLoop?: boolean;
}): Promise<MainAgentLeafAttemptResult> {
  return runMainAgentStepLoop({
    project: input.project,
    changeId: input.changeId,
    prompt: input.prompt,
    live: input.live,
    taskIds: input.taskIds,
    taskRunId: input.taskRunId,
    entrypoint: "task-run",
    initialRole: input.initialRole ?? "coder-agent",
    orchestrationState: input.orchestrationState,
    initialDecision: input.initialDecision,
    executionGate: input.executionGate,
    loopRunId: input.loopRunId,
    finalizeLoop: input.finalizeLoop,
  });
}

export async function runMainAgentSourceRefreshRework(input: {
  project: ManagedProject;
  changeId: string;
  prompt?: string;
  live?: WorkbenchLiveSink;
}): Promise<MainAgentLeafAttemptResult> {
  return runMainAgentStepLoop({
    project: input.project,
    changeId: input.changeId,
    prompt: input.prompt,
    live: input.live,
    entrypoint: "source-refresh-rework",
    initialRole: "rework-coder",
  });
}

export async function runMainAgentFeedbackRework(input: {
  project: ManagedProject;
  changeId: string;
  prompt?: string;
  live?: WorkbenchLiveSink;
}): Promise<MainAgentLeafAttemptResult> {
  return runMainAgentStepLoop({
    project: input.project,
    changeId: input.changeId,
    prompt: input.prompt,
    live: input.live,
    entrypoint: "feedback-rework",
    initialRole: "rework-coder",
  });
}

function assertDelegateDecision(decision: MainAgentOrchestrationDecision, roleId: MainAgentOrchestrationRole): asserts decision is Extract<MainAgentOrchestrationDecision, { kind: "delegate-role" }> {
  if (decision.kind !== "delegate-role" || decision.roleId !== roleId) {
    throw new Error(`Main-agent decision engine expected ${roleId}, got ${decision.kind}${decision.kind === "delegate-role" ? `:${decision.roleId}` : ""}.`);
  }
}

async function finishTopLevelLoop(
  project: ManagedProject,
  loopRunId: string,
  status: "completed" | "stopped",
  summary: string,
  stoppedAt: "boundary" | "code" | "validation" | "audit" | null,
): Promise<void> {
  const memory = await resolveProjectMemory(project);
  await finishMainAgentLoopRun(memory, loopRunId, { status, summary, stoppedAt });
}
