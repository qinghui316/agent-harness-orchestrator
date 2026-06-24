import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type { ResolvedMemory } from "../types/index.js";
import type { AutomationAcceptedArtifactHashes, AutomationSourceState } from "./types.js";

const execFileAsync = promisify(execFile);

export async function captureAutomationSourceState(memory: ResolvedMemory): Promise<AutomationSourceState> {
  const capturedAt = new Date().toISOString();
  try {
    const [{ stdout: headStdout }, { stdout: statusStdout }] = await Promise.all([
      execFileAsync("git", ["-C", memory.projectRoot, "rev-parse", "HEAD"], { windowsHide: true }),
      execFileAsync("git", ["-C", memory.projectRoot, "status", "--short"], { windowsHide: true }),
    ]);
    return {
      gitHead: headStdout.trim() || undefined,
      statusShort: statusStdout.split(/\r?\n/).map((line) => line.trimEnd()).filter(Boolean),
      capturedAt,
    };
  } catch {
    return { capturedAt };
  }
}

export async function captureAcceptedArtifactHashes(memory: ResolvedMemory, changePath: string): Promise<AutomationAcceptedArtifactHashes> {
  const root = join(memory.memoryRoot, changePath);
  return {
    spec: await hashFileIfExists(join(root, "spec.md")),
    plan: await hashFileIfExists(join(root, "plan.md")),
    tasks: await hashFileIfExists(join(root, "tasks.md")),
    acMap: await hashFileIfExists(join(root, "ac-map.json")),
  };
}

async function hashFileIfExists(path: string): Promise<string | null> {
  if (!existsSync(path)) return null;
  const data = await readFile(path);
  return createHash("sha256").update(data).digest("hex");
}
