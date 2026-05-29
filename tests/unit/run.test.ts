import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CodexCompletionTracker } from "../../src/codex/completion.js";
import { createCodexJsonlStreamParser } from "../../src/codex/jsonl.js";
import { createChange } from "../../src/change/manager.js";
import { initHarness } from "../../src/harness/init.js";
import { listRuns, readRun, startLocalCommandRun } from "../../src/run/manager.js";
import { executeProcessStreaming } from "../../src/run/process.js";
import type { ManagedProject } from "../../src/types/index.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "aho-run-"));
});

afterEach(async () => {
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
    await initHarness(project(tempDir));
    await createChange(project(tempDir), { title: "Run Evidence" });

    const result = await startLocalCommandRun(project(tempDir), [process.execPath, "-e", "console.log('ok')"]);
    const runDir = join(tempDir, result.run.artifacts.directory);
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
    await initHarness(project(tempDir));
    await createChange(project(tempDir), { title: "Failed Run" });

    const result = await startLocalCommandRun(project(tempDir), [process.execPath, "-e", "console.error('bad'); process.exit(2)"]);
    const runDir = join(tempDir, result.run.artifacts.directory);

    expect(result.run.status).toBe("failed");
    expect(result.run.exitCode).toBe(2);
    expect(await readFile(join(runDir, "stderr.log"), "utf8")).toContain("bad");
  });

  it("lists and reads recorded runs", async () => {
    await initHarness(project(tempDir));
    await createChange(project(tempDir), { title: "List Runs" });
    const result = await startLocalCommandRun(project(tempDir), [process.execPath, "-e", ""]);

    const runs = await listRuns(tempDir);
    const read = await readRun(tempDir, result.run.id);

    expect(runs).toHaveLength(1);
    expect(read.id).toBe(result.run.id);
  });

  it("blocks run start without exactly one active change", async () => {
    await initHarness(project(tempDir));
    await expect(startLocalCommandRun(project(tempDir), [process.execPath, "-e", ""])).rejects.toThrow("no active change");

    await mkdir(join(tempDir, "harness", "changes", "active", "one"), { recursive: true });
    await mkdir(join(tempDir, "harness", "changes", "active", "two"), { recursive: true });
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
      timeoutMs: 2000,
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
