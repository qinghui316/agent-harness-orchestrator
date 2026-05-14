import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createChange } from "../../src/change/manager.js";
import { initHarness } from "../../src/harness/init.js";
import { getSpecTestStatus, linkSpecTest, unlinkSpecTest } from "../../src/spec-test/manager.js";
import { writeJsonFile } from "../../src/fs/json.js";
import type { ManagedProject, ValidationResult } from "../../src/types/index.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "aho-spec-test-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

function project(path: string): ManagedProject {
  return {
    id: "repo",
    name: "Repo",
    path,
    addedAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
  };
}

async function setupChange(): Promise<ManagedProject> {
  const item = project(tempDir);
  await initHarness(item);
  await createChange(item, { title: "Spec Test Mapping" });
  return item;
}

describe("spec-test manager", () => {
  it("creates empty spec-tests.json for new changes", async () => {
    const item = await setupChange();
    const raw = await readFile(join(tempDir, "harness", "changes", "active", "spec-test-mapping", "spec-tests.json"), "utf8");
    const parsed = JSON.parse(raw);

    expect(parsed).toMatchObject({ version: "1.0", changeId: "spec-test-mapping", mappings: [] });
    expect((await getSpecTestStatus(item)).acceptanceCriteria[0]).toMatchObject({ acId: "AC-001", linkedEvidence: false, confidence: "none" });
  });

  it("links file, test name, command, and note evidence", async () => {
    const item = await setupChange();
    await mkdir(join(tempDir, "test"), { recursive: true });
    await writeFile(join(tempDir, "test", "sample.test.js"), "test\n", "utf8");

    const status = await linkSpecTest(item, {
      ac: "ac-001",
      file: "test/sample.test.js",
      testName: "sample behavior",
      command: "test",
      note: "manual note",
    });

    expect(status.acceptanceCriteria[0]).toMatchObject({ linkedEvidence: true, evidenceFilesExist: true, confidence: "stale" });
    expect(status.acceptanceCriteria[0]?.refs).toHaveLength(4);
  });

  it("rejects unsafe paths, unknown ACs, and standalone test names", async () => {
    const item = await setupChange();

    await expect(linkSpecTest(item, { ac: "AC-999", command: "test" })).rejects.toThrow("Unknown Acceptance Criterion");
    await expect(linkSpecTest(item, { ac: "AC-001", file: join(tempDir, "test.js") })).rejects.toThrow("repo-relative");
    await expect(linkSpecTest(item, { ac: "AC-001", file: "../test.js" })).rejects.toThrow("must not escape");
    await expect(linkSpecTest(item, { ac: "AC-001", testName: "name" })).rejects.toThrow("Provide at least one evidence option");
  });

  it("allows command-only evidence and joins latest validation status", async () => {
    const item = await setupChange();
    await linkSpecTest(item, { ac: "AC-001", command: "test" });
    await writeValidation("run-1", { commandName: "test", commandStatus: "passed" });

    const status = await getSpecTestStatus(item);

    expect(status.acceptanceCriteria[0]).toMatchObject({ linkedEvidence: true, confidence: "validation-passed" });
    expect(status.acceptanceCriteria[0]?.commandEvidence).toEqual([{ commandName: "test", validationStatus: "passed" }]);
  });

  it("reports missing files as blocking and missing commands as warning", async () => {
    const item = await setupChange();
    await linkSpecTest(item, { ac: "AC-001", file: "test/missing.test.js", command: "missing" });
    await writeValidation("run-1", { commandName: "test", commandStatus: "passed" });

    const status = await getSpecTestStatus(item);

    expect(status.blockingIssues[0]).toContain("missing evidence file");
    expect(status.warnings[0]).toContain("validation command not found");
    expect(status.acceptanceCriteria[0]?.confidence).toBe("invalid");
  });

  it("dedupes and unlinks refs", async () => {
    const item = await setupChange();
    await linkSpecTest(item, { ac: "AC-001", command: "test" });
    await linkSpecTest(item, { ac: "AC-001", command: "test" });
    let status = await getSpecTestStatus(item);
    expect(status.mappings[0]?.refs).toHaveLength(1);

    status = await unlinkSpecTest(item, { ac: "AC-001", command: "test" });
    expect(status.mappings).toHaveLength(0);
  });
});

async function writeValidation(runId: string, options: { commandName: string; commandStatus: "passed" | "failed" }): Promise<void> {
  const runDir = join(tempDir, ".agent-harness", "runs", runId);
  await mkdir(runDir, { recursive: true });
  const now = new Date().toISOString();
  const validation: ValidationResult = {
    version: "1.0",
    id: runId,
    runId,
    changeId: "spec-test-mapping",
    profile: "default",
    status: options.commandStatus,
    executionMode: "direct",
    startedAt: now,
    finishedAt: now,
    commands: [{
      name: options.commandName,
      command: ["npm", "run", options.commandName],
      cwd: tempDir,
      status: options.commandStatus,
      exitCode: options.commandStatus === "passed" ? 0 : 1,
      signal: null,
      startedAt: now,
      finishedAt: now,
      stdout: "stdout.log",
      stderr: "stderr.log",
    }],
  };
  await writeJsonFile(join(runDir, "validation.json"), validation);
}
