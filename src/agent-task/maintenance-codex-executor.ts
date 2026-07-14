import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { writeJsonFile } from "../fs/json.js";
import { executeProcessStreaming } from "../run/process.js";
import { getSystemSkillsRoot } from "../template-source/paths.js";
import { getActiveCodexAppServerTurn, runCodexAppServerTurn } from "../codex/app-server.js";
import type { CodexAppServerRealtimeEvent } from "../codex/app-server-realtime.js";
import { getRuntimeAssignedHarnessSkillContext } from "../skill/catalog.js";
import type { ManagedProject, ResolvedMemory } from "../types/index.js";
import { WorkbenchStore } from "../workbench/store.js";
import type { HarnessEngineeringAssignment } from "./harness-engineering-contract.js";
import {
  EvolutionScoreBlockedError,
  runMaintenanceProviderAssignment,
  type MaintenanceProviderExecutionRequest,
  type MaintenanceProviderExecutionResult,
  type MaintenanceProviderExecutor,
  type MaintenanceTaskLineage,
} from "./maintenance-provider-runner.js";

export function createCodexMaintenanceProviderExecutor(memory: ResolvedMemory): MaintenanceProviderExecutor {
  return async (request) => executeCodexMaintenanceRequest(memory, request);
}

export async function runCodexMaintenanceAssignment(
  memory: ResolvedMemory,
  project: ManagedProject,
  assignment: HarnessEngineeringAssignment,
  signal?: AbortSignal,
  onRealtimeEvent?: (event: CodexAppServerRealtimeEvent) => void,
  taskLineage?: MaintenanceTaskLineage,
): Promise<{ summary: string; artifactRefs: string[] }> {
  const evidencePath = join(memory.workbenchRoot, "maintenance", "evidence", `${assignment.taskId}.json`);
  let evidence;
  try {
    evidence = await runMaintenanceProviderAssignment({
      project,
      assignment,
      executor: createCodexMaintenanceProviderExecutor(memory),
      signal,
      onRealtimeEvent,
      taskLineage,
    });
  } catch (error) {
    if (error instanceof EvolutionScoreBlockedError) {
      await writeJsonFile(evidencePath, error.evidence);
      error.artifactRefs = [evidencePath];
    }
    throw error;
  }
  for (let verificationAttempt = 1; verificationAttempt <= 2; verificationAttempt += 1) {
    evidence.verification = await runRequiredVerification(memory, assignment, verificationAttempt, signal);
    evidence.verificationAttempts = [...(evidence.verificationAttempts ?? []), evidence.verification];
    await writeJsonFile(evidencePath, evidence);
    const failed = evidence.verification.find((item) => !item.passed);
    if (!failed) {
      return { summary: evidence.producer.summary, artifactRefs: [evidencePath] };
    }
    if (verificationAttempt === 1) {
      const repair = await continueAfterVerificationFailure(memory, project, assignment, evidence, signal, onRealtimeEvent, taskLineage);
      evidence.producer = {
        ...evidence.producer,
        summary: repair.finalText.trim() || evidence.producer.summary,
        changedFiles: [...new Set([...evidence.producer.changedFiles, ...repair.changedFiles])],
      };
      continue;
    }
    throw new MaintenanceVerificationError(
      `Required maintenance verification failed after one repair continuation: ${failed.name}.`,
      [
        evidencePath,
        ...(evidence.verificationAttempts ?? []).flatMap((attempt) =>
          attempt.flatMap((item) => [item.stdoutPath, item.stderrPath])),
      ],
    );
  }
  throw new Error("Maintenance verification loop exited unexpectedly.");
}

async function continueAfterVerificationFailure(
  memory: ResolvedMemory,
  project: ManagedProject,
  assignment: HarnessEngineeringAssignment,
  evidence: Awaited<ReturnType<typeof runMaintenanceProviderAssignment>>,
  signal?: AbortSignal,
  onRealtimeEvent?: (event: CodexAppServerRealtimeEvent) => void,
  taskLineage?: MaintenanceTaskLineage,
): Promise<MaintenanceProviderExecutionResult> {
  const failures = (evidence.verification ?? []).filter((item) => !item.passed);
  const prompt = [
    "Runtime mechanical verification failed after your direct edits.",
    "Read the current files and the verification logs below, repair the evidence-backed problem, and return a concise result.",
    "Do not widen the assigned Change or Evolution window.",
    ...failures.flatMap((item) => [
      `Verification: ${item.name}`,
      `Command: ${item.command.join(" ")}`,
      `Exit code: ${item.exitCode ?? "none"}`,
      `Stdout: ${item.stdoutPath}`,
      `Stderr: ${item.stderrPath}`,
    ]),
  ].join("\n");
  return executeCodexMaintenanceRequest(memory, {
    project,
    role: assignment.mode === "evolve-assigned-window" ? "evolution-agent" : "maintenance-agent",
    prompt,
    skillContext: await getRuntimeAssignedHarnessSkillContext(project, assignment),
    parentThreadId: null,
    cwd: assignment.memoryRoot,
    runtimeWorkspaceRoots: [assignment.projectRoot, assignment.memoryRoot],
    writable: true,
    writableRoots: [...new Set([assignment.projectRoot, assignment.memoryRoot])],
    existingThreadId: evidence.producer.threadId,
    signal,
    onRealtimeEvent,
    taskLineage,
  });
}

async function runRequiredVerification(
  memory: ResolvedMemory,
  assignment: HarnessEngineeringAssignment,
  attempt: number,
  signal?: AbortSignal,
) {
  const directory = join(memory.workbenchRoot, "maintenance", "verification", assignment.taskId, `attempt-${attempt}`);
  const results = [];
  for (const [index, item] of assignment.requiredVerification.entries()) {
    const safeName = item.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
    const stdoutPath = join(directory, `${String(index + 1).padStart(2, "0")}-${safeName}.stdout.log`);
    const stderrPath = join(directory, `${String(index + 1).padStart(2, "0")}-${safeName}.stderr.log`);
    const result = await executeProcessStreaming({
      cwd: assignment.projectRoot,
      command: item.command[0]!,
      args: item.command.slice(1),
      stdoutPath,
      stderrPath,
      timeoutMs: 10 * 60_000,
      stopSignal: () => signal?.aborted ?? false,
    });
    results.push({
      name: item.name,
      command: item.command,
      exitCode: result.exitCode,
      passed: result.exitCode === 0 && !result.timedOut,
      stdoutPath,
      stderrPath,
    });
    if (result.exitCode !== 0 || result.timedOut) break;
  }
  return results;
}

export class MaintenanceVerificationError extends Error {
  constructor(message: string, readonly artifactRefs: string[]) {
    super(message);
  }
}

async function executeCodexMaintenanceRequest(
  memory: ResolvedMemory,
  request: MaintenanceProviderExecutionRequest,
): Promise<MaintenanceProviderExecutionResult> {
  const runId = `maintenance-${randomUUID()}`;
  const directory = join(memory.workbenchRoot, "maintenance", "provider-runs", runId);
  const isScorer = request.role === "evolution-scorer";
  let abortPoll: NodeJS.Timeout | null = null;
  const interrupt = (): void => {
    const active = getActiveCodexAppServerTurn(runId);
    if (active) void active.interrupt("Background AgentTask lease ended.").catch(() => undefined);
  };
  const onAbort = (): void => { interrupt(); abortPoll ??= setInterval(interrupt, 50); };
  request.signal?.addEventListener("abort", onAbort, { once: true });
  if (request.signal?.aborted) onAbort();
  let result: Awaited<ReturnType<typeof runCodexAppServerTurn>>;
  const profileId = request.role === "maintenance-agent"
    ? "memory-maintenance-agent"
    : request.role === "evolution-agent"
      ? "harness-evolution-agent"
      : null;
  try {
    const developerInstructions = profileId
      ? await readFile(join(getSystemSkillsRoot(), "..", "agent-profiles", `${profileId}.md`), "utf8")
      : undefined;
    result = await runCodexAppServerTurn({
      projectId: request.project.id,
      conversationId: request.taskLineage?.conversationId,
      changeId: request.taskLineage?.changeId,
      agentTaskId: request.taskLineage?.taskId,
      runtimeScopeId: runId, roleId: profileId ?? request.role, runId,
      cwd: request.cwd, prompt: request.prompt, sandboxPolicy: request.writable ? "workspace-write" : "read-only",
      existingThreadId: request.existingThreadId ?? (isScorer ? request.parentThreadId : null),
      writableRoots: request.writableRoots,
      runtimeWorkspaceRoots: request.runtimeWorkspaceRoots,
      nativeSkillRoots: [getSystemSkillsRoot()],
      requiredNativeSkills: isScorer ? [] : ["aho-harness-engineering"],
      skillInputs: isScorer ? undefined : [{ name: "aho-harness-engineering", path: join(getSystemSkillsRoot(), "aho-harness-engineering", "SKILL.md") }],
      additionalContext: {
        "aho.background-task": {
          kind: "application",
          value: JSON.stringify({ role: request.role, cwd: request.cwd, runtimeWorkspaceRoots: request.runtimeWorkspaceRoots ?? [] }),
        },
      },
      developerInstructions,
      paths: { events: join(directory, "events.jsonl"), stderr: join(directory, "stderr.log"), lastMessage: join(directory, "last-message.md"), session: join(directory, "session.json") },
      onRealtimeEvent: request.onRealtimeEvent,
    });
  } finally {
    request.signal?.removeEventListener("abort", onAbort);
    if (abortPoll) clearInterval(abortPoll);
  }
  if (result.status !== "completed" || !result.threadId) throw new Error(result.error ?? `Codex maintenance ${request.role} did not complete.`);
  if (!isScorer) {
    await persistMaintenanceThread(memory, request, runId, result.threadId, null, profileId ?? request.role);
    return { threadId: result.threadId, parentThreadId: null, finalText: result.lastMessage, changedFiles: result.changedFiles };
  }
  const children = result.childThreads.filter((child) => child.parentThreadId === result.threadId);
  if (children.length !== 1 || !children[0]?.threadId || !children[0].finalText) {
    throw new Error("Codex evolution scoring must produce exactly one completed native child thread.");
  }
  await persistMaintenanceThread(memory, request, runId, children[0].threadId, children[0].parentThreadId, "evolution-scorer", children[0].displayName);
  return { threadId: children[0].threadId, parentThreadId: children[0].parentThreadId, finalText: children[0].finalText, changedFiles: children[0].changedFiles };
}

async function persistMaintenanceThread(
  memory: ResolvedMemory,
  request: MaintenanceProviderExecutionRequest,
  runId: string,
  providerThreadId: string,
  parentThreadId: string | null,
  roleId: string,
  displayName?: string,
): Promise<void> {
  if (!request.taskLineage || !memory.projectId) return;
  const store = await WorkbenchStore.open(memory);
  try {
    store.writeProviderThread({
      projectId: memory.projectId,
      conversationId: request.taskLineage.conversationId,
      providerThreadId,
      roleId,
      parentThreadId,
      changeId: request.taskLineage.changeId,
      capabilityProfile: "background-agent-v1",
      displayName,
      runId,
      updatedAt: new Date().toISOString(),
    });
  } finally {
    store.close();
  }
}
