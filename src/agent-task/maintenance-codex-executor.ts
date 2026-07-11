import { randomUUID } from "node:crypto";
import { mkdir, open, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { getActiveCodexAppServerTurn, runCodexAppServerTurn } from "../codex/app-server.js";
import type { ManagedProject, ResolvedMemory } from "../types/index.js";
import type { HarnessEngineeringAssignment } from "./harness-engineering-contract.js";
import { createMaintenanceDiffManifest } from "./maintenance-diff.js";
import { applyReviewedMaintenanceAssignment, maintenanceApplyTransactionPath } from "./project-memory-apply.js";
import {
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
  const root = join(memory.workbenchRoot, "maintenance", "provider-runs", assignment.assignmentId);
  const manifestPath = join(root, "manifest.json");
  let evidence: import("./maintenance-provider-runner.js").MaintenanceProviderRunEvidence;
  let evidencePath: string;
  try {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { version: string; assignmentId: string; manifestHash: string; evidencePath: string; summary: string };
    if (manifest.version !== "2.0" || manifest.assignmentId !== assignment.assignmentId
      || !/^[a-f0-9]{64}$/.test(manifest.manifestHash)
      || manifest.evidencePath !== `${manifest.manifestHash}.json`) {
      throw new Error("Maintenance provider manifest does not match the current assignment.");
    }
    evidence = JSON.parse(await readFile(join(root, manifest.evidencePath), "utf8")) as import("./maintenance-provider-runner.js").MaintenanceProviderRunEvidence;
    const currentDiff = await createMaintenanceDiffManifest(assignment.workspace);
    const validReviews = evidence.reviews.length === evidence.quorum.required
      && evidence.reviews.every((review) => review.decision === "approve"
        && review.assignmentId === assignment.assignmentId && review.manifestHash === evidence.manifestHash);
    if (evidence.version !== "2.0" || evidence.assignmentId !== assignment.assignmentId
      || evidence.mode !== assignment.mode || evidence.application !== "not-applied"
      || evidence.manifestHash !== manifest.manifestHash || evidence.manifest.workspaceHash !== evidence.manifestHash
      || JSON.stringify(evidence.manifest) !== JSON.stringify(currentDiff)
      || currentDiff.workspaceHash !== evidence.manifestHash
      || evidence.quorum.approved !== evidence.quorum.required || !validReviews) {
      throw new Error("Maintenance provider cached evidence is stale or structurally invalid.");
    }
    evidencePath = join(root, manifest.evidencePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    evidence = await runMaintenanceProviderAssignment({
      project,
      assignment,
      executor: createCodexMaintenanceProviderExecutor(memory),
      signal,
    });
    await mkdir(root, { recursive: true });
    const evidenceName = `${evidence.manifestHash}.json`;
    evidencePath = join(root, evidenceName);
    await writeExclusive(evidencePath, evidence);
    await writeExclusive(manifestPath, { version: "2.0", assignmentId: assignment.assignmentId, manifestHash: evidence.manifestHash, evidencePath: evidenceName, summary: evidence.producer.summary });
  }
  const applied = await applyReviewedMaintenanceAssignment({
    project,
    memory,
    assignment,
    evidence,
  });
  return {
    summary: evidence.producer.summary,
    artifactRefs: [relative(memory.memoryRoot, evidencePath).replace(/\\/g, "/"), applied.artifactPath, relative(memory.memoryRoot, maintenanceApplyTransactionPath(memory, assignment.assignmentId)).replace(/\\/g, "/")],
  };
}

async function writeExclusive(path: string, value: unknown): Promise<void> {
  try {
    const handle = await open(path, "wx");
    try {
      await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const existing = JSON.parse(await readFile(path, "utf8"));
    if (JSON.stringify(existing) !== JSON.stringify(value)) throw new Error("Immutable maintenance provider evidence conflicts with existing content.");
  }
}

async function executeCodexMaintenanceRequest(
  memory: ResolvedMemory,
  request: MaintenanceProviderExecutionRequest,
): Promise<MaintenanceProviderExecutionResult> {
  const runId = `maintenance-${randomUUID()}`;
  const directory = join(memory.workbenchRoot, "maintenance", "provider-runs", runId);
  const isBlindReviewer = request.role === "blind-reviewer";
  const prompt = isBlindReviewer
    ? [
      "Use the real spawn_agent collaboration tool exactly once.",
      "Give the child only the blind review request below. Do not add another reviewer's result or recommendation.",
      "Wait for the child to finish, then return briefly.",
      "",
      request.prompt,
    ].join("\n")
    : request.prompt;
  let abortPoll: NodeJS.Timeout | null = null;
  const interrupt = (): void => {
    const active = getActiveCodexAppServerTurn(runId);
    if (active) void active.interrupt("Background worker is draining.").catch(() => undefined);
  };
  const onAbort = (): void => {
    interrupt();
    abortPoll ??= setInterval(interrupt, 50);
  };
  request.signal?.addEventListener("abort", onAbort, { once: true });
  if (request.signal?.aborted) onAbort();
  let result: Awaited<ReturnType<typeof runCodexAppServerTurn>>;
  try {
    result = await runCodexAppServerTurn({
    projectId: request.project.id,
    runtimeScopeId: runId,
    roleId: request.role,
    runId,
    cwd: request.cwd,
    prompt,
    sandboxPolicy: request.writable ? "workspace-write" : "read-only",
    existingThreadId: null,
    paths: {
      events: join(directory, "events.jsonl"),
      stderr: join(directory, "stderr.log"),
      lastMessage: join(directory, "last-message.md"),
      session: join(directory, "session.json"),
    },
    });
  } finally {
    request.signal?.removeEventListener("abort", onAbort);
    if (abortPoll) clearInterval(abortPoll);
  }
  if (result.status !== "completed" || !result.threadId) {
    throw new Error(result.error ?? `Codex maintenance ${request.role} did not complete.`);
  }
  if (!isBlindReviewer) {
    return { threadId: result.threadId, parentThreadId: null, finalText: result.lastMessage };
  }
  const children = result.childThreads.filter((child) => child.parentThreadId === result.threadId);
  if (children.length !== 1 || !children[0]?.threadId || !children[0].finalText) {
    throw new Error("Codex blind review must produce exactly one completed child thread.");
  }
  return { threadId: children[0].threadId, parentThreadId: result.threadId, finalText: children[0].finalText };
}
