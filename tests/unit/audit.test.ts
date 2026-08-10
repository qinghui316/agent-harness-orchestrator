import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseAuditMessage } from "../../src/audit/parser.js";
import { composeAuditPrompt } from "../../src/audit/prompt.js";
import { acceptAudit, startAuditRun } from "../../src/audit/manager.js";
import { listAuditResults, readAuditResult } from "../../src/audit/artifacts.js";
import { getChangeStatus } from "../../src/change/manager.js";
import { writeJsonFile } from "../../src/fs/json.js";
import type { AuditResult, ManagedProject } from "../../src/types/index.js";
import type { ValidationResult } from "../../src/types/index.js";
import type { ProviderCapabilitySnapshot } from "../../src/provider-runtime/contracts.js";
import { bindProviderAttemptThread, startProviderAttempt } from "../../src/workbench/provider-attempts.js";
import { createConversationChangeFixture } from "../helpers/conversation-change-fixture.js";
import {
  prepareSkillNativeWorkbenchFixture,
  skillNativeChangeRoot,
  writeSkillNativeAcceptedSpecAndTasks,
  type SkillNativeWorkbenchFixture,
} from "../helpers/skill-native-workbench-fixture.js";

const providerRequire = vi.hoisted(() => vi.fn());

vi.mock("../../src/provider-runtime/index.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../src/provider-runtime/index.js")>(),
  defaultProviderRegistry: {
    list: () => [{ id: "test-provider" }],
    requireOnly: () => ({ id: "test-provider" }),
    require: providerRequire,
  },
}));

let tempDir: string;
let fixture: SkillNativeWorkbenchFixture;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "aho-audit-"));
  fixture = await prepareSkillNativeWorkbenchFixture({
    project: project(tempDir),
    ahoHome: join(tempDir, ".aho-home"),
  });
  providerRequire.mockReset();
  providerRequire.mockRejectedValue(new Error("The selected provider does not satisfy the auditor capability profile."));
});

afterEach(async () => {
  fixture.restoreEnvironment();
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

describe("audit parser and prompt", () => {
  it("parses approved, approved-with-notes, blocked, and missing statuses", () => {
    expect(parseAuditMessage("Status: approved\n").status).toBe("approved");
    expect(parseAuditMessage("Status: approved-with-notes\n").status).toBe("approved-with-notes");
    expect(parseAuditMessage("Status: blocked\n").status).toBe("blocked");
    expect(parseAuditMessage("Status: not-real\n").status).toBe("failed");
    expect(parseAuditMessage("No status here").status).toBe("failed");
  });

  it("parses structured findings", () => {
    const parsed = parseAuditMessage([
      "Status: blocked",
      "",
      "Finding: Missing validation",
      "- Severity: blocking",
      "- Area: validation",
      "- Evidence: validation.json missing",
      "- Recommendation: run aho validate run",
    ].join("\n"));

    expect(parsed.findings[0]).toMatchObject({
      severity: "blocking",
      area: "validation",
      evidence: "validation.json missing",
      recommendation: "run aho validate run",
    });
  });

  it("composes an auditor prompt with context, validation, profile, and diff", async () => {
    const prompt = await composeAuditPrompt({
      context: "- AC-001: Audit evidence",
      latestValidation: "{\"status\":\"passed\"}",
      diffStat: "README.md | 1 +",
      diff: "diff --git a/README.md b/README.md",
      extraPrompt: "Focus on spec drift.",
    });

    expect(prompt).toContain("Auditor Agent Profile");
    expect(prompt).toContain("Status: approved | approved-with-notes | blocked");
    expect(prompt.match(/Status: approved \| approved-with-notes \| blocked/g)).toHaveLength(1);
    expect(prompt).toContain("Use `approved` only when no risk");
    expect(prompt).toContain("Passing validation and other positive evidence belong in the");
    expect(prompt).toContain("Authoritative Audit Packet");
    expect(prompt).toContain("Do not block only because the project Harness or runtime sidecar is outside the provider working directory.");
    expect(prompt).toContain("AC-001");
    expect(prompt).toContain("README.md | 1 +");
    expect(prompt).toContain("Focus on spec drift.");
  });
});

describe("audit close gate", () => {
  it("warns on no or failed audit and blocks explicit blocked audit", async () => {
    const changeId = await activateChange("Audit Gate");
    const changeDir = skillNativeChangeRoot(fixture, changeId);
    await writeFile(join(changeDir, "reviews", "review.md"), "Status: approved\n", "utf8");

    const noAudit = await getChangeStatus(project(tempDir));
    expect(noAudit.closeGate.warnings).toContain("No audit run recorded for this change.");

    await mkdir(join(fixture.runtime.runsRoot, "audit-failed"), { recursive: true });
    await writeAudit("audit-failed", changeId, "failed");
    const failed = await getChangeStatus(project(tempDir));
    expect(failed.closeGate.warnings).toContain("Latest audit failed or could not be parsed: audit-failed.");

    await mkdir(join(fixture.runtime.runsRoot, "audit-blocked"), { recursive: true });
    await writeAudit("audit-blocked", changeId, "blocked", "2099-01-01T00:00:00.000Z");
    const blocked = await getChangeStatus(project(tempDir));
    expect(blocked.closeGate.blockingIssues).toContain("Latest audit blocked close: audit-blocked.");
  });

  it("rejects forged audit evidence on direct read and skips it in list paths", async () => {
    const changeId = await activateChange("Audit Scope");
    const runtime = fixture.runtime;

    await mkdir(join(runtime.runsRoot, "audit-good"), { recursive: true });
    await writeAudit("audit-good", changeId, "approved");
    await mkdir(join(runtime.runsRoot, "audit-forged"), { recursive: true });
    await writeAuditAt("audit-forged", "audit-other-id", changeId, "blocked");
    await mkdir(join(runtime.runsRoot, "audit-malformed"), { recursive: true });
    await writeFile(join(runtime.runsRoot, "audit-malformed", "audit.json"), "{", "utf8");

    await expect(readAuditResult(runtime, "audit-forged")).rejects.toThrow("does not match run directory");
    await expect(readAuditResult(runtime, "audit-good", { changeId: "other-change" })).rejects.toThrow("does not match requested change");
    const listed = await listAuditResults(runtime, changeId);
    expect(listed.map((item) => item.id)).toEqual(["audit-good"]);

    const status = await getChangeStatus(project(tempDir));
    expect(status.latestAudit?.id).toBe("audit-good");
  });

  it("rejects audit acceptance when referenced validation evidence is missing or cross-change", async () => {
    const changeId = await activateChange("Audit Accept Scope");
    const changeDir = skillNativeChangeRoot(fixture, changeId);
    await writeFile(join(changeDir, "reviews", "review.md"), "Status: approved\n", "utf8");
    await mkdir(join(fixture.runtime.runsRoot, "audit-with-missing-validation"), { recursive: true });
    await writeAudit("audit-with-missing-validation", changeId, "approved", "2026-01-01T00:00:00.000Z", "missing-validation");
    await expect(acceptAudit(project(tempDir), "audit-with-missing-validation")).rejects.toThrow();

    await mkdir(join(fixture.runtime.runsRoot, "cross-validation"), { recursive: true });
    await writeValidation("cross-validation", "other-change", "passed");
    await mkdir(join(fixture.runtime.runsRoot, "audit-with-cross-validation"), { recursive: true });
    await writeAudit("audit-with-cross-validation", changeId, "approved", "2026-01-02T00:00:00.000Z", "cross-validation");
    await expect(acceptAudit(project(tempDir), "audit-with-cross-validation")).rejects.toThrow("does not match requested change");
  });

  it("records runtime continuity sidecars for direct audit capability failures", async () => {
    const changeId = await activateChange("Audit Runtime Continuity");

    const result = await startAuditRun(project(tempDir));
    const runDir = join(fixture.runtime.runArtifactRoot, result.run.artifacts.directory);
    const workerSession = JSON.parse(await readFile(join(runDir, "worker-session.json"), "utf8"));
    const runtimeWorkspace = JSON.parse(await readFile(join(runDir, "runtime-workspace.json"), "utf8"));
    const eventSource = JSON.parse(await readFile(join(runDir, "event-source.json"), "utf8"));
    const agentEvents = (await readFile(join(runDir, "agent-events.jsonl"), "utf8")).trim().split(/\r?\n/).map((line) => JSON.parse(line));

    expect(result.run.status).toBe("failed");
    expect(result.audit.status).toBe("failed");
    expect(workerSession).toMatchObject({ adapter: "provider-readonly", changeId, runId: result.run.id, roleId: "auditor-agent", status: "failed" });
    expect(runtimeWorkspace).toMatchObject({ workspaceKind: "source-root", cwd: tempDir, roleId: "auditor-agent" });
    expect(runtimeWorkspace.worktreeId).toBeUndefined();
    expect(eventSource).toMatchObject({ adapter: "provider-readonly", status: "failed", workerSessionId: workerSession.id });
    expect(agentEvents.map((event) => event.eventType)).toEqual(expect.arrayContaining([
      "permission.profile.attached",
      "provider.exited",
      "external-execution.failed",
    ]));
    expect(agentEvents[0]).toMatchObject({ changeId, runId: result.run.id, roleId: "auditor-agent" });
    expect(agentEvents[0].raw.changeId).toBeUndefined();
  });

  it("executes Auditor through the selected provider readonly leaf port", async () => {
    const runTurn = vi.fn(async () => ({
      providerId: "test-provider",
      status: "completed" as const,
      session: { providerId: "test-provider", sessionId: "session-audit" },
      turnId: "turn-audit",
      lastMessage: "Status: approved\n",
      childThreads: [],
      changedFiles: [],
    }));
    providerRequire.mockResolvedValue({
      id: "codex",
      displayName: "Test Provider",
      capabilitySnapshot: vi.fn(async () => ({
        providerId: "codex",
        displayName: "Test Provider",
        productMode: "harness" as const,
        status: "ready" as const,
        runnable: true,
        checkedAt: "2026-07-15T00:00:00.000Z",
        snapshotHash: "snapshot",
        snapshotVersion: 1,
        effectiveModel: "test-model",
        effectiveModelSource: "provider-default" as const,
        degradedReasons: [],
        capabilities: [],
      })),
      leafExecution: { runTurn },
    });
    await activateChange("Provider Auditor");

    const result = await startAuditRun(project(tempDir));

    expect(providerRequire).toHaveBeenCalledWith("codex", "auditor", "harness", expect.objectContaining({ id: "repo" }), tempDir);
    expect(runTurn).toHaveBeenCalledWith(expect.objectContaining({
      providerId: "codex",
      operationProfile: "auditor",
      roleId: "auditor-agent",
      cwd: tempDir,
      skillInputs: [expect.objectContaining({ id: "repo-harness", source: "project-harness", required: true })],
      sandboxPolicy: "read-only",
      writableRoots: [],
    }));
    expect(result.run).toMatchObject({ status: "completed", command: ["provider", "turn.start"] });
    expect(result.audit.status).toBe("approved");
  });

  it("binds scheduler audit to the explicitly requested validation evidence", async () => {
    const changeId = await activateChange("Audit Exact Validation");
    await writeValidation("validation-old", changeId, "passed", "2026-01-01T00:00:00.000Z");
    await writeValidation("validation-selected", changeId, "passed", "2026-01-02T00:00:00.000Z");

    const result = await startAuditRun(project(tempDir), { validationId: "validation-old" });
    expect(result.audit).toMatchObject({
      changeId,
      validationId: "validation-old",
      status: "failed",
    });

    await writeValidation("validation-cross", "other-change", "passed", "2026-01-03T00:00:00.000Z");
    await expect(startAuditRun(project(tempDir), { validationId: "validation-cross" })).rejects.toThrow("does not match requested change");
  });
});

async function writeAudit(
  id: string,
  changeId: string,
  status: AuditResult["status"],
  startedAt = "2026-01-01T00:00:00.000Z",
  validationId?: string,
): Promise<void> {
  await writeAuditAt(id, id, changeId, status, startedAt, validationId);
}

async function writeAuditAt(
  directoryId: string,
  id: string,
  changeId: string,
  status: AuditResult["status"],
  startedAt = "2026-01-01T00:00:00.000Z",
  validationId?: string,
): Promise<void> {
  const audit: AuditResult = {
    version: "1.0",
    id,
    runId: id,
    changeId,
    status,
    validationId,
    startedAt,
    finishedAt: startedAt,
    findings: [],
    artifacts: {
      audit: `runs/${id}/audit.json`,
      auditMarkdown: `runs/${id}/audit.md`,
      lastMessage: `runs/${id}/last-message.md`,
    },
  };
  await writeJsonFile(join(fixture.runtime.runsRoot, directoryId, "audit.json"), audit);
}

async function writeValidation(id: string, changeId: string, status: ValidationResult["status"], startedAt = "2026-01-01T00:00:00.000Z"): Promise<void> {
  const validation: ValidationResult = {
    version: "1.0",
    id,
    runId: id,
    changeId,
    profile: "default",
    status,
    executionMode: "direct",
    startedAt,
    finishedAt: startedAt,
    commands: [],
  };
  await writeJsonFile(join(fixture.runtime.runsRoot, id, "validation.json"), validation);
}

async function activateChange(title: string): Promise<string> {
  const change = await createConversationChangeFixture(project(tempDir), { title });
  await writeSkillNativeAcceptedSpecAndTasks(fixture, change.changeId);
  await startProviderAttempt(fixture.runtime, {
    attemptId: `attempt-main-${change.conversationId}`,
    providerId: "codex",
    capabilitySnapshot: {
      providerId: "codex",
      effectiveModel: null,
    } as unknown as ProviderCapabilitySnapshot,
    operationProfile: "main",
    roleId: "main-agent",
    handoffHash: "a".repeat(64),
    conversationId: change.conversationId,
    changeId: change.changeId,
    graphScopeId: `graph:${change.conversationId}`,
  });
  await bindProviderAttemptThread(fixture.runtime, {
    attemptId: `attempt-main-${change.conversationId}`,
    threadId: `thread-main-${change.conversationId}`,
    parentThreadId: null,
    parentAgentSurfaceId: null,
  });
  return change.changeId;
}
