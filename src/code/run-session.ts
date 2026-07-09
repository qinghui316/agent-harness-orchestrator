import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { writeJsonFile } from "../fs/json.js";
import { runtimeContinuityPaths } from "../runtime-continuity/paths.js";
import type { ResolvedMemory, RunMetadata, RunStatus } from "../types/index.js";
import { displayArtifactPath } from "./artifacts.js";

export interface CodeRunSession {
  directory: string;
  relativeDir: string;
  artifacts: RunMetadata["artifacts"];
  paths: CodeRunPaths;
}

export interface CodeRunPaths {
  run: string;
  context: string;
  contextPacket: string;
  events: string;
  stdout: string;
  stderr: string;
  prompt: string;
  codexEvents: string;
  appServerEvents: string;
  appServerStderr: string;
  appServerLastMessage: string;
  agentSession: string;
  lastMessage: string;
  diff: string;
  diffStat: string;
  implementation: string;
  workerSession: string;
  runtimeWorkspace: string;
  eventSource: string;
  agentEvents: string;
}

export async function createCodeRunSession(memory: ResolvedMemory, runId: string): Promise<CodeRunSession> {
  const directory = join(memory.runsRoot, runId);
  const relativeDir = displayArtifactPath(memory, directory);
  const artifacts = {
    base: memory.artifactBase,
    directory: relativeDir,
    context: `${relativeDir}/context.md`,
    contextPacket: `${relativeDir}/context-packet.json`,
    events: `${relativeDir}/events.jsonl`,
    stdout: `${relativeDir}/stdout.log`,
    stderr: `${relativeDir}/stderr.log`,
    prompt: `${relativeDir}/prompt.md`,
    codexEvents: `${relativeDir}/codex-events.jsonl`,
    appServerEvents: `${relativeDir}/app-server-events.jsonl`,
    appServerStderr: `${relativeDir}/app-server-stderr.log`,
    appServerLastMessage: `${relativeDir}/app-server-last-message.md`,
    agentSession: `${relativeDir}/agent-session.json`,
    lastMessage: `${relativeDir}/last-message.md`,
    diff: `${relativeDir}/diff.patch`,
    diffStat: `${relativeDir}/diff-stat.txt`,
    implementation: `${relativeDir}/implementation.md`,
  };
  const runtimePaths = runtimeContinuityPaths(directory);
  const paths = {
    run: join(directory, "run.json"),
    context: join(directory, "context.md"),
    contextPacket: join(directory, "context-packet.json"),
    events: join(directory, "events.jsonl"),
    stdout: join(directory, "stdout.log"),
    stderr: join(directory, "stderr.log"),
    prompt: join(directory, "prompt.md"),
    codexEvents: join(directory, "codex-events.jsonl"),
    appServerEvents: join(directory, "app-server-events.jsonl"),
    appServerStderr: join(directory, "app-server-stderr.log"),
    appServerLastMessage: join(directory, "app-server-last-message.md"),
    agentSession: join(directory, "agent-session.json"),
    lastMessage: join(directory, "last-message.md"),
    diff: join(directory, "diff.patch"),
    diffStat: join(directory, "diff-stat.txt"),
    implementation: join(directory, "implementation.md"),
    workerSession: runtimePaths.workerSession,
    runtimeWorkspace: runtimePaths.runtimeWorkspace,
    eventSource: runtimePaths.eventSource,
    agentEvents: runtimePaths.agentEvents,
  };
  await mkdir(directory, { recursive: true });
  return { directory, relativeDir, artifacts, paths };
}

export async function finishRun(path: string, run: RunMetadata, status: RunStatus, exitCode: number | null, signal: NodeJS.Signals | null): Promise<RunMetadata> {
  const finished = {
    ...run,
    status,
    exitCode,
    signal,
    finishedAt: new Date().toISOString(),
  };
  await writeJsonFile(path, finished);
  return finished;
}
