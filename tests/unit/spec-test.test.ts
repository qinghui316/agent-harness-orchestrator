import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createChange } from "../../src/change/manager.js";
import { initHarness } from "../../src/harness/init.js";
import { getSpecTestStatus, linkSpecTest, unlinkSpecTest } from "../../src/spec-test/manager.js";
import { parseSpecTestProposalMessage } from "../../src/spec-test/proposal.js";
import { classifySpecTestDiff, composeSpecTestGeneratorPrompt, selectAcsForGeneration } from "../../src/spec-test/generate.js";
import { getSpecTestDriftReport } from "../../src/spec-test/drift.js";
import { writeJsonFile } from "../../src/fs/json.js";
import type { ChangeStatus, ManagedProject, RunWorktreeInfo, SpecTestAcStatus, ValidationResult } from "../../src/types/index.js";

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

describe("spec-test drift", () => {
  it("reports missing evidence as warning-only drift", async () => {
    const item = await setupChange();

    const report = await getSpecTestDriftReport(item);

    expect(report.acceptanceCriteria[0]).toMatchObject({ acId: "AC-001", status: "missing" });
    expect(report.strict.passed).toBe(true);
  });

  it("reports missing linked files as invalid", async () => {
    const item = await setupChange();
    await linkSpecTest(item, { ac: "AC-001", file: "test/missing.test.js" });

    const report = await getSpecTestDriftReport(item);

    expect(report.acceptanceCriteria[0]).toMatchObject({ status: "invalid" });
    expect(report.strict.passed).toBe(false);
    expect(report.strict.failingStatuses).toContain("invalid");
  });

  it("reports failed validation as failed", async () => {
    const item = await setupChange();
    await linkSpecTest(item, { ac: "AC-001", command: "test" });
    await writeValidation("run-1", { commandName: "test", commandStatus: "failed" });

    const report = await getSpecTestDriftReport(item);

    expect(report.acceptanceCriteria[0]).toMatchObject({ status: "failed" });
    expect(report.strict.failingStatuses).toContain("failed");
  });

  it("reports missing validation commands as stale", async () => {
    const item = await setupChange();
    await linkSpecTest(item, { ac: "AC-001", command: "test" });
    await writeValidation("run-1", { commandName: "build", commandStatus: "passed" });

    const report = await getSpecTestDriftReport(item);

    expect(report.acceptanceCriteria[0]).toMatchObject({ status: "stale" });
    expect(report.strict.failingStatuses).toContain("stale");
  });

  it("reports passed command evidence as ok", async () => {
    const item = await setupChange();
    await linkSpecTest(item, { ac: "AC-001", command: "test" });
    await writeValidation("run-1", { commandName: "test", commandStatus: "passed" });

    const report = await getSpecTestDriftReport(item);

    expect(report.acceptanceCriteria[0]).toMatchObject({ status: "ok" });
    expect(report.latestValidationId).toBe("run-1");
    expect(report.selectedRootType).toBe("source-root");
    expect(report.strict.passed).toBe(true);
  });

  it("reports spec changes after evidence as stale mtime risk", async () => {
    const item = await setupChange();
    await linkSpecTest(item, { ac: "AC-001", command: "test" });
    await writeValidation("run-1", { commandName: "test", commandStatus: "passed" });
    const future = new Date(Date.now() + 5000);
    await utimes(join(tempDir, "harness", "changes", "active", "spec-test-mapping", "spec.md"), future, future);

    const report = await getSpecTestDriftReport(item);

    expect(report.freshness.specChangedAfterEvidence).toBe(true);
    expect(report.acceptanceCriteria[0]).toMatchObject({ status: "stale" });
    expect(report.warnings.some((warning) => warning.includes("mtime-based"))).toBe(true);
  });
});

describe("spec-test proposal parser", () => {
  it("parses proposed evidence and normalizes AC ids", () => {
    const result = parseSpecTestProposalMessage([
      "Status: proposed",
      "",
      "```json",
      JSON.stringify({
        status: "proposed",
        evidence: [{
          refId: "ev-001",
          acId: "ac-001",
          source: "source-root",
          kind: "existingEvidence",
          refs: [
            { type: "file", path: "test/pricing.test.js" },
            { type: "testName", path: "test/pricing.test.js", name: "normal customers pay subtotal" },
            { type: "command", commandName: "test" },
          ],
          rationale: "Existing test exercises the behavior.",
        }],
        warnings: [],
      }),
      "```",
    ].join("\n"));

    expect(result.status).toBe("proposed");
    expect(result.evidence[0]).toMatchObject({ refId: "ev-001", acId: "AC-001", source: "source-root", kind: "existingEvidence" });
    expect(result.evidence[0]?.refs).toHaveLength(3);
  });

  it("treats missing or invalid JSON as failed proposal output", () => {
    expect(parseSpecTestProposalMessage("This is not JSON.")).toMatchObject({ status: "failed" });
    expect(parseSpecTestProposalMessage("Status: blocked")).toMatchObject({ status: "blocked", evidence: [] });
  });
});

describe("spec-test generator helpers", () => {
  const acStatuses: SpecTestAcStatus[] = [
    acStatus("AC-001", false, "none"),
    acStatus("AC-002", true, "linked-only"),
    acStatus("AC-003", true, "stale"),
    acStatus("AC-004", true, "invalid"),
  ];

  it("selects only ACs without linked evidence for --missing", () => {
    expect(selectAcsForGeneration(acStatuses, { missing: true })).toEqual(["AC-001"]);
  });

  it("rejects unknown ACs and accepts repeated explicit ACs once", () => {
    expect(selectAcsForGeneration(acStatuses, { acIds: ["ac-002", "AC-002"] })).toEqual(["AC-002"]);
    expect(() => selectAcsForGeneration(acStatuses, { acIds: ["AC-999"] })).toThrow("Unknown Acceptance Criterion");
  });

  it("classifies test-only diffs conservatively", () => {
    const allowed = classifySpecTestDiff([
      "diff --git a/test/pricing.test.js b/test/pricing.test.js",
      "diff --git a/src/pricing.js b/src/pricing.js",
      "diff --git a/package.json b/package.json",
      "diff --git a/__tests__/sample.spec.ts b/__tests__/sample.spec.ts",
    ].join("\n"));

    expect(allowed.allowed).toEqual(["__tests__/sample.spec.ts", "test/pricing.test.js"]);
    expect(allowed.rejected).toEqual(["package.json", "src/pricing.js"]);
  });

  it("composes generator prompt with ECL profile, selected ACs, and test-only boundary", async () => {
    const worktree: RunWorktreeInfo = {
      worktreeId: "wt-1",
      branchName: "aho/change/wt-1",
      baseRef: "main",
      baseCommit: "abc",
      checkoutPath: "C:/tmp/worktree",
      metadataPath: "C:/tmp/meta.json",
    };
    const prompt = await composeSpecTestGeneratorPrompt({
      context: "context",
      changeStatus: {
        projectPath: tempDir,
        activeChanges: [],
        change: null,
        reviewStatus: "pending",
        acMap: {
          version: "1.0",
          generatedAt: new Date().toISOString(),
          changeId: "change",
          acceptanceCriteria: [{ id: "AC-001", text: "normal customers keep price", taskIds: [], validationRefs: [], warnings: [] }],
          tasks: [],
          warnings: [],
          blockingIssues: [],
        },
        specTest: null,
        latestValidation: null,
        latestAudit: null,
        closeGate: { ready: false, warnings: [], blockingIssues: [] },
      } satisfies ChangeStatus,
      selectedAcs: ["AC-001"],
      specTestStatus: "{}",
      latestValidation: "No validation",
      sourceTests: "### test/pricing.test.js",
      worktree,
      sourceProjectPath: "C:/tmp/repo",
      extraPrompt: "keep minimal",
    });

    expect(prompt).toContain("Spec-Test Generator Agent Profile");
    expect(prompt).toContain("AC-001: normal customers keep price");
    expect(prompt).toContain("Do not modify production code");
    expect(prompt).toContain("Do not edit `spec-tests.json`");
    expect(prompt).toContain("keep minimal");
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

function acStatus(acId: string, linkedEvidence: boolean, confidence: SpecTestAcStatus["confidence"]): SpecTestAcStatus {
  return {
    acId,
    text: acId,
    linkedEvidence,
    evidenceFilesExist: confidence !== "invalid",
    latestValidationStatus: null,
    commandEvidence: [],
    confidence,
    refs: linkedEvidence ? [{ type: "command", commandName: "test" }] : [],
    warnings: [],
    blockingIssues: confidence === "invalid" ? [`${acId} missing file`] : [],
  };
}
