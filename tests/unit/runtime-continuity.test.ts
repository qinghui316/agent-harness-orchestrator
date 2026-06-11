import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runtimeContinuityPaths } from "../../src/runtime-continuity/paths.js";
import {
  appendExternalExecutionCompleted,
  appendExternalExecutionFailed,
  appendExternalExecutionRequested,
  appendPermissionDecisionRecorded,
  appendPermissionProfileAttached,
} from "../../src/runtime-continuity/events.js";
import {
  appendAgentEventEnvelope,
  createRuntimeContinuityArtifacts,
  readAgentEventEnvelopes,
  readEventSource,
  readRuntimeWorkspace,
  readWorkerSession,
} from "../../src/runtime-continuity/repository.js";
import type { WorkerPermissionProfile } from "../../src/types/index.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "aho-runtime-continuity-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

const permissionProfile: WorkerPermissionProfile = {
  version: "1.0",
  roleId: "coder-agent",
  allowedReadRoots: ["current-demand", "source-root"],
  allowedWriteRoots: ["aho-owned-worktree"],
  deniedPaths: [".git/**"],
  allowedCommands: ["npm test"],
  sandboxPolicy: "workspace-write",
  mayDelegate: false,
};

describe("runtime continuity evidence", () => {
  it("writes scoped session, workspace, event source, and canonical event envelopes", async () => {
    const paths = runtimeContinuityPaths(tempDir);
    const artifacts = await createRuntimeContinuityArtifacts(paths, {
      projectId: "project-1",
      changeId: "change-1",
      runId: "run-1",
      roleId: "coder-agent",
      adapter: "codex-exec",
      worktree: {
        worktreeId: "wt-1",
        branchName: "aho/wt-1",
        baseRef: "main",
        baseCommit: "abc123",
        checkoutPath: join(tempDir, "checkout"),
        metadataPath: join(tempDir, "wt-1.json"),
      },
      permissionProfile,
      rawArtifactRefs: ["runs/run-1/codex-events.jsonl"],
      sandboxPolicy: "workspace-write",
      createdAt: "2026-06-11T00:00:00.000Z",
    });

    await appendAgentEventEnvelope(paths, artifacts.session, artifacts.eventSource, {
      eventType: "text_delta",
      summary: "hello",
      raw: { changeId: "forged", runId: "other", roleId: "other-role", delta: "hello" },
      timestamp: "2026-06-11T00:00:01.000Z",
    });

    const session = await readWorkerSession(paths, { projectId: "project-1", changeId: "change-1", runId: "run-1", roleId: "coder-agent" });
    const workspace = await readRuntimeWorkspace(paths, session);
    const eventSource = await readEventSource(paths, session);
    const envelopes = await readAgentEventEnvelopes(paths, session, eventSource);

    expect(session).toMatchObject({ changeId: "change-1", runId: "run-1", roleId: "coder-agent", status: "initialized" });
    expect(workspace).toMatchObject({ workspaceKind: "local-worktree", worktreeId: "wt-1", sandboxPolicy: "workspace-write" });
    expect(eventSource.rawArtifactRefs).toEqual(["runs/run-1/codex-events.jsonl"]);
    expect(envelopes).toHaveLength(1);
    expect(envelopes[0]).toMatchObject({
      projectId: "project-1",
      changeId: "change-1",
      runId: "run-1",
      roleId: "coder-agent",
      eventType: "text_delta",
    });
    expect(envelopes[0].raw).toMatchObject({ changeId: "forged", runId: "other", roleId: "other-role" });
    expect(await readFile(paths.agentEvents, "utf8")).toContain("\"agent-event-envelope\"");
  });

  it("rejects cross-change and cross-role direct reads", async () => {
    const paths = runtimeContinuityPaths(tempDir);
    await createRuntimeContinuityArtifacts(paths, {
      projectId: "project-1",
      changeId: "change-1",
      runId: "run-1",
      roleId: "coder-agent",
      adapter: "codex-exec",
      worktree: {
        worktreeId: "wt-1",
        branchName: "aho/wt-1",
        baseRef: "main",
        baseCommit: "abc123",
        checkoutPath: join(tempDir, "checkout"),
        metadataPath: join(tempDir, "wt-1.json"),
      },
      permissionProfile,
      rawArtifactRefs: [],
      sandboxPolicy: "workspace-write",
    });

    await expect(readWorkerSession(paths, { projectId: "project-1", changeId: "other-change", runId: "run-1", roleId: "coder-agent" }))
      .rejects.toThrow("WorkerSession scope mismatch");
    await expect(readWorkerSession(paths, { projectId: "project-1", changeId: "change-1", runId: "run-1", roleId: "rework-coder" }))
      .rejects.toThrow("WorkerSession scope mismatch");
  });

  it("supports source-root workspaces without worktree scope", async () => {
    const paths = runtimeContinuityPaths(tempDir);
    const artifacts = await createRuntimeContinuityArtifacts(paths, {
      projectId: "project-1",
      changeId: "change-1",
      runId: "run-1",
      roleId: "validator",
      adapter: "validation-command",
      workspace: {
        workspaceKind: "source-root",
        cwd: join(tempDir, "source"),
      },
      permissionProfile: {
        ...permissionProfile,
        roleId: "validator",
        sandboxPolicy: "read-only",
      },
      rawArtifactRefs: ["runs/run-1/validation.json"],
      sandboxPolicy: "read-only",
    });

    const workspace = await readRuntimeWorkspace(paths, artifacts.session);

    expect(artifacts.session).toMatchObject({
      adapter: "validation-command",
      roleId: "validator",
      sandboxPolicy: "read-only",
    });
    expect(artifacts.session.worktreeId).toBeUndefined();
    expect(workspace).toMatchObject({
      workspaceKind: "source-root",
      cwd: join(tempDir, "source"),
      sandboxPolicy: "read-only",
    });
    expect(workspace.worktreeId).toBeUndefined();
    expect(workspace.checkoutPath).toBeUndefined();
  });

  it("rejects source-root workspace descriptors that also carry worktree scope", async () => {
    const paths = runtimeContinuityPaths(tempDir);

    await expect(createRuntimeContinuityArtifacts(paths, {
      projectId: "project-1",
      changeId: "change-1",
      runId: "run-1",
      roleId: "validator",
      adapter: "validation-command",
      workspace: {
        workspaceKind: "source-root",
        cwd: join(tempDir, "source"),
      },
      worktree: {
        worktreeId: "wt-1",
        branchName: "aho/wt-1",
        baseRef: "main",
        baseCommit: "abc123",
        checkoutPath: join(tempDir, "checkout"),
        metadataPath: join(tempDir, "wt-1.json"),
      },
      permissionProfile,
      rawArtifactRefs: [],
      sandboxPolicy: "read-only",
    })).rejects.toThrow("source-root runtime continuity workspace must not include worktree scope");
  });

  it("writes permission and external-execution events with WorkerSession canonical scope", async () => {
    const paths = runtimeContinuityPaths(tempDir);
    const artifacts = await createRuntimeContinuityArtifacts(paths, {
      projectId: "project-1",
      changeId: "change-1",
      runId: "run-1",
      roleId: "coder-agent",
      adapter: "codex-exec",
      worktree: {
        worktreeId: "wt-1",
        branchName: "aho/wt-1",
        baseRef: "main",
        baseCommit: "abc123",
        checkoutPath: join(tempDir, "checkout"),
        metadataPath: join(tempDir, "wt-1.json"),
      },
      permissionProfile,
      rawArtifactRefs: ["runs/run-1/codex-events.jsonl"],
      sandboxPolicy: "workspace-write",
    });

    await appendPermissionProfileAttached(paths, artifacts, { changeId: "forged", source: "test" });
    await appendPermissionDecisionRecorded(paths, artifacts, {
      version: "1.0",
      id: "policy-1",
      actionType: "delegateTask",
      actorRoleId: "coder-agent",
      status: "denied",
      enforcementMode: "broker-enforced",
      reason: "coder cannot delegate",
      readableMessage: "denied",
      createdAt: "2026-06-11T00:00:00.000Z",
    }, { runId: "forged-run" });
    await appendExternalExecutionRequested(paths, artifacts, {
      requestId: "request-1",
      command: "codex",
      args: ["exec", "--json"],
      cwd: join(tempDir, "checkout"),
      raw: { roleId: "forged-role" },
    });
    await appendExternalExecutionCompleted(paths, artifacts, {
      requestId: "request-1",
      exitCode: 0,
      signal: null,
    });
    await appendExternalExecutionFailed(paths, artifacts, {
      requestId: "request-2",
      exitCode: 1,
      error: "boom",
    });

    const envelopes = await readAgentEventEnvelopes(paths, artifacts.session, artifacts.eventSource);
    expect(envelopes.map((event) => event.eventType)).toEqual([
      "permission.profile.attached",
      "permission.decision.recorded",
      "external-execution.requested",
      "external-execution.completed",
      "external-execution.failed",
    ]);
    for (const event of envelopes) {
      expect(event).toMatchObject({ projectId: "project-1", changeId: "change-1", runId: "run-1", roleId: "coder-agent" });
      expect(event.raw.changeId).toBeUndefined();
      expect(event.raw.runId).toBeUndefined();
      expect(event.raw.roleId).toBeUndefined();
    }
    expect(envelopes[0].raw.permissionProfile).toMatchObject({ roleId: "coder-agent" });
    expect(envelopes[1].raw.decision).toMatchObject({ actionType: "delegateTask", status: "denied" });
    expect(envelopes[2].raw).toMatchObject({ requestId: "request-1", command: "codex" });
  });
});
