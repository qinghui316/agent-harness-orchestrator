import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { writeJsonFile } from "../fs/json.js";
import { executeProcessStreaming } from "../run/process.js";
import { getSystemSkillsRoot } from "../template-source/paths.js";
import { getActiveCodexAppServerTurn, runCodexAppServerTurn } from "../codex/app-server.js";
import type { ManagedProject, ResolvedMemory } from "../types/index.js";
import type { HarnessEngineeringAssignment } from "./harness-engineering-contract.js";
import {
  EvolutionScoreBlockedError,
  runMaintenanceProviderAssignment,
  type MaintenanceProviderExecutionRequest,
  type MaintenanceProviderExecutionResult,
  type MaintenanceProviderExecutor,
} from "./maintenance-provider-runner.js";

export function createCodexMaintenanceProviderExecutor(memory: ResolvedMemory): MaintenanceProviderExecutor {
  return async (request) => executeCodexMaintenanceRequest(memory, request);
}

export async function runCodexMaintenanceAssignment(
  memory: ResolvedMemory,
  project: ManagedProject,
  assignment: HarnessEngineeringAssignment,
  signal?: AbortSignal,
): Promise<{ summary: string; artifactRefs: string[] }> {
  const evidencePath = join(memory.workbenchRoot, "maintenance", "evidence", `${assignment.taskId}.json`);
  let evidence;
  try {
    evidence = await runMaintenanceProviderAssignment({
      project,
      assignment,
      executor: createCodexMaintenanceProviderExecutor(memory),
      signal,
    });
  } catch (error) {
    if (error instanceof EvolutionScoreBlockedError) {
      await writeJsonFile(evidencePath, error.evidence);
      error.artifactRefs = [evidencePath];
    }
    throw error;
  }
  evidence.verification = await runRequiredVerification(memory, assignment, signal);
  await writeJsonFile(evidencePath, evidence);
  const failed = evidence.verification.find((item) => !item.passed);
  if (failed) {
    throw new MaintenanceVerificationError(
      `Required maintenance verification failed: ${failed.name}.`,
      [evidencePath, failed.stdoutPath, failed.stderrPath],
    );
  }
  return { summary: evidence.producer.summary, artifactRefs: [evidencePath] };
}

async function runRequiredVerification(
  memory: ResolvedMemory,
  assignment: HarnessEngineeringAssignment,
  signal?: AbortSignal,
) {
  const directory = join(memory.workbenchRoot, "maintenance", "verification", assignment.taskId);
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
  const prompt = isScorer
    ? ["Use the native spawn_agent collaboration tool exactly once.",
      "Give the child only the scoring request below, wait for it, and return briefly.", "", request.prompt].join("\n")
    : request.prompt;
  let abortPoll: NodeJS.Timeout | null = null;
  const interrupt = (): void => {
    const active = getActiveCodexAppServerTurn(runId);
    if (active) void active.interrupt("Background AgentTask lease ended.").catch(() => undefined);
  };
  const onAbort = (): void => { interrupt(); abortPoll ??= setInterval(interrupt, 50); };
  request.signal?.addEventListener("abort", onAbort, { once: true });
  if (request.signal?.aborted) onAbort();
  let result: Awaited<ReturnType<typeof runCodexAppServerTurn>>;
  try {
    const profileId = request.role === "maintenance-agent"
      ? "memory-maintenance-agent"
      : request.role === "evolution-agent"
        ? "harness-evolution-agent"
        : null;
    const developerInstructions = profileId
      ? await readFile(join(getSystemSkillsRoot(), "..", "agent-profiles", `${profileId}.md`), "utf8")
      : undefined;
    result = await runCodexAppServerTurn({
      projectId: request.project.id, runtimeScopeId: runId, roleId: request.role, runId,
      cwd: request.cwd, prompt, sandboxPolicy: request.writable ? "workspace-write" : "read-only",
      existingThreadId: request.existingThreadId ?? (isScorer ? request.parentThreadId : null),
      writableRoots: request.writableRoots,
      skillInputs: isScorer ? undefined : [{ name: "aho-harness-engineering", path: join(getSystemSkillsRoot(), "aho-harness-engineering", "SKILL.md") }],
      developerInstructions,
      paths: { events: join(directory, "events.jsonl"), stderr: join(directory, "stderr.log"), lastMessage: join(directory, "last-message.md"), session: join(directory, "session.json") },
    });
  } finally {
    request.signal?.removeEventListener("abort", onAbort);
    if (abortPoll) clearInterval(abortPoll);
  }
  if (result.status !== "completed" || !result.threadId) throw new Error(result.error ?? `Codex maintenance ${request.role} did not complete.`);
  if (!isScorer) return { threadId: result.threadId, parentThreadId: null, finalText: result.lastMessage, changedFiles: result.changedFiles };
  const children = result.childThreads.filter((child) => child.parentThreadId === result.threadId);
  if (children.length !== 1 || !children[0]?.threadId || !children[0].finalText) {
    throw new Error("Codex evolution scoring must produce exactly one completed native child thread.");
  }
  return { threadId: children[0].threadId, parentThreadId: children[0].parentThreadId, finalText: children[0].finalText, changedFiles: children[0].changedFiles };
}
