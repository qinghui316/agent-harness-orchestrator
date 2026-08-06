import { readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CodexCompletionTracker } from "../../src/codex/completion.js";
import { createCodexJsonlStreamParser } from "../../src/codex/jsonl.js";
import { resolveProjectRuntimePaths } from "../../src/project-runtime/paths.js";
import { listRuns, readRun, startLocalCommandRun } from "../../src/run/manager.js";
import { executeProcessStreaming } from "../../src/run/process.js";
import type { ManagedProject } from "../../src/types/index.js";
import { createConversationChangeFixture } from "../helpers/conversation-change-fixture.js";
import { summarizeRunArtifacts } from "../../src/workbench/projections/artifact-preview.js";
import {
  prepareSkillNativeWorkbenchFixture,
  writeSkillNativeAcceptedSpecAndTasks,
  type SkillNativeWorkbenchFixture,
} from "../helpers/skill-native-workbench-fixture.js";

let tempDir: string;
let harnessFixture: SkillNativeWorkbenchFixture;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "aho-run-"));
  harnessFixture = await prepareSkillNativeWorkbenchFixture({
    project: project(tempDir),
    ahoHome: join(tempDir, "aho-home"),
  });
});

afterEach(async () => {
  harnessFixture.restoreEnvironment();
  await removeTempDir(tempDir);
});

async function removeTempDir(path: string): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rm(path, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === 4) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

function project(path: string): ManagedProject {
  return {
    id: "repo",
    name: "Repo",
    path,
    addedAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
  };
}

describe("run manager", () => {
  it("records a completed local command run", async () => {
    await activateChange("Run Evidence");

    const result = await startLocalCommandRun(project(tempDir), [process.execPath, "-e", "console.log('ok')"]);
    const runDir = join(resolveProjectRuntimePaths("repo", process.env.AHO_HOME).sidecarRoot, result.run.artifacts.directory);
    const events = (await readFile(join(runDir, "events.jsonl"), "utf8")).trim().split("\n").map((line) => JSON.parse(line));

    expect(result.run.status).toBe("completed");
    expect(result.run.exitCode).toBe(0);
    expect(await readFile(join(runDir, "stdout.log"), "utf8")).toContain("ok");
    expect(await readFile(join(runDir, "context.md"), "utf8")).toContain("Run Context Projection");
    expect(events.map((event) => event.type)).toEqual([
      "run.created",
      "context.prepared",
      "process.started",
      "process.exited",
      "run.completed",
    ]);
  });

  it("records a failed local command run", async () => {
    await activateChange("Failed Run");

    const result = await startLocalCommandRun(project(tempDir), [process.execPath, "-e", "console.error('bad'); process.exit(2)"]);
    const runDir = join(resolveProjectRuntimePaths("repo", process.env.AHO_HOME).sidecarRoot, result.run.artifacts.directory);

    expect(result.run.status).toBe("failed");
    expect(result.run.exitCode).toBe(2);
    expect(await readFile(join(runDir, "stderr.log"), "utf8")).toContain("bad");
  });

  it("lists and reads recorded runs", async () => {
    await activateChange("List Runs");
    const result = await startLocalCommandRun(project(tempDir), [process.execPath, "-e", ""]);

    const runPaths = resolveProjectRuntimePaths("repo", process.env.AHO_HOME);
    const runs = await listRuns(runPaths);
    const read = await readRun(runPaths, result.run.id);

    expect(runs).toHaveLength(1);
    expect(read.id).toBe(result.run.id);
  });

  it("rejects non-portable and mismatched persisted Run identities", async () => {
    await activateChange("Bound Run Identity");
    const result = await startLocalCommandRun(project(tempDir), [process.execPath, "-e", ""]);
    const runPaths = resolveProjectRuntimePaths("repo", process.env.AHO_HOME);

    await expect(readRun(runPaths, "../outside")).rejects.toThrow(/not portable/);

    const metadataPath = join(runPaths.runsRoot, result.run.id, "run.json");
    const forged = JSON.parse(await readFile(metadataPath, "utf8")) as Record<string, unknown>;
    forged.id = "run-forged-identity";
    await writeFile(metadataPath, `${JSON.stringify(forged, null, 2)}\n`, "utf8");
    await expect(readRun(runPaths, result.run.id)).rejects.toThrow(/identity mismatch/);
  });

  it("rejects a persisted Run that points at another Run's artifact directory", async () => {
    await activateChange("Bound Artifact Identity");
    const first = await startLocalCommandRun(project(tempDir), [process.execPath, "-e", ""]);
    const second = await startLocalCommandRun(project(tempDir), [process.execPath, "-e", ""]);
    const runPaths = resolveProjectRuntimePaths("repo", process.env.AHO_HOME);
    const metadataPath = join(runPaths.runsRoot, first.run.id, "run.json");
    const forged = JSON.parse(await readFile(metadataPath, "utf8")) as { artifacts: { directory: string } };
    forged.artifacts.directory = second.run.artifacts.directory;
    await writeFile(metadataPath, `${JSON.stringify(forged, null, 2)}\n`, "utf8");

    await expect(readRun(runPaths, first.run.id)).rejects.toThrow(/artifact directory mismatch/);
  });

  it("rejects artifact paths outside their explicit Owner and Run directory", async () => {
    await activateChange("Bound Run Artifacts");
    const result = await startLocalCommandRun(project(tempDir), [process.execPath, "-e", ""]);
    const roots = {
      projectRoot: tempDir,
      runArtifactRoot: resolveProjectRuntimePaths("repo", process.env.AHO_HOME).sidecarRoot,
    };

    await expect(summarizeRunArtifacts(roots, {
      ...result.run,
      artifacts: { ...result.run.artifacts, directory: "../outside" },
    })).rejects.toThrow(/artifact directory mismatch/);
    await expect(summarizeRunArtifacts(roots, {
      ...result.run,
      artifacts: { ...result.run.artifacts, events: join(roots.runArtifactRoot, "events.jsonl") },
    })).rejects.toThrow(/must be relative/);
    await expect(summarizeRunArtifacts(roots, {
      ...result.run,
      artifacts: { ...result.run.artifacts, events: "runs/another-run/events.jsonl" },
    })).rejects.toThrow(/outside the run directory/);
  });

  it("blocks run start without exactly one active change", async () => {
    await expect(startLocalCommandRun(project(tempDir), [process.execPath, "-e", ""])).rejects.toThrow("no active change");

    await activateChange("One");
    await activateChange("Two");
    await expect(startLocalCommandRun(project(tempDir), [process.execPath, "-e", ""])).rejects.toThrow("expected exactly one active change");
  });

  it("streams stdout and stderr chunks to best-effort callbacks while writing artifacts", async () => {
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    const callbackErrors: string[] = [];
    const result = await executeProcessStreaming({
      cwd: process.cwd(),
      command: process.execPath,
      args: ["-e", "process.stdout.write('out'); process.stderr.write('err')"],
      stdoutPath: join(tempDir, "stdout.log"),
      stderrPath: join(tempDir, "stderr.log"),
      onStdoutChunk: (text) => {
        stdoutChunks.push(text);
        throw new Error("ignored callback failure");
      },
      onStderrChunk: (text) => stderrChunks.push(text),
      onCallbackError: (stream) => {
        callbackErrors.push(stream);
        throw new Error("ignored callback-error failure");
      },
    });

    expect(result.exitCode).toBe(0);
    expect(stdoutChunks.join("")).toContain("out");
    expect(stderrChunks.join("")).toContain("err");
    expect(callbackErrors).toEqual(["stdout"]);
    expect(await readFile(join(tempDir, "stdout.log"), "utf8")).toContain("out");
    expect(await readFile(join(tempDir, "stderr.log"), "utf8")).toContain("err");
  });

  it("terminates a hanging Codex process after completed turn and final text", async () => {
    const tracker = new CodexCompletionTracker();
    const parser = createCodexJsonlStreamParser((event) => tracker.handleEvent(event));
    const result = await executeProcessStreaming({
      cwd: process.cwd(),
      command: process.execPath,
      args: ["-e", [
        "console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'done'}}));",
        "console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:1,output_tokens:1}}));",
        "setInterval(() => {}, 1000);",
      ].join("")],
      stdoutPath: join(tempDir, "stdout-complete.log"),
      stderrPath: join(tempDir, "stderr-complete.log"),
      onStdoutChunk: (text) => parser.feed(text),
      completionSignal: () => tracker.isComplete(),
      completionGraceMs: 50,
      killGraceMs: 500,
      timeoutMs: 10000,
    });
    parser.flush();

    expect(result.timedOut).toBe(false);
    expect(result.terminated).toBe(true);
    expect(result.terminationReason).toBe("completion-grace-expired");
    expect(await readFile(join(tempDir, "stdout-complete.log"), "utf8")).toContain("agent_message");
  });

  it("does not treat turn.completed without final text as successful completion", async () => {
    const tracker = new CodexCompletionTracker();
    const parser = createCodexJsonlStreamParser((event) => tracker.handleEvent(event));
    const result = await executeProcessStreaming({
      cwd: tempDir,
      command: process.execPath,
      args: ["-e", [
        "console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:1,output_tokens:1}}));",
        "setInterval(() => {}, 1000);",
      ].join("")],
      stdoutPath: join(tempDir, "stdout-timeout.log"),
      stderrPath: join(tempDir, "stderr-timeout.log"),
      onStdoutChunk: (text) => parser.feed(text),
      completionSignal: () => tracker.isComplete(),
      completionGraceMs: 20,
      killGraceMs: 500,
      timeoutMs: 100,
    });
    parser.flush();

    expect(result.timedOut).toBe(true);
    expect(result.terminated).toBe(true);
    expect(result.terminationReason).toBe("timeout");
  });
});

async function activateChange(title: string): Promise<string> {
  const change = await createConversationChangeFixture(project(tempDir), { title });
  await writeSkillNativeAcceptedSpecAndTasks(harnessFixture, change.changeId);
  return change.changeId;
}
