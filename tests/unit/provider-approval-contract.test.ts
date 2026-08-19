import { describe, expect, it } from "vitest";
import {
  codexApprovalResponse,
  parseCodexApprovalRequest,
  type CodexAppServerTurnOptions,
} from "../../src/codex/app-server.js";
import { PROVIDER_OPERATION_CAPABILITIES } from "../../src/provider-runtime/types.js";

describe("Direct Agent Provider approval contract", () => {
  it("keeps turn.approval optional for every operation readiness profile", () => {
    for (const capabilities of Object.values(PROVIDER_OPERATION_CAPABILITIES)) {
      expect(capabilities).not.toContain("turn.approval");
    }
  });

  it("maps command approval to a redacted provider-neutral summary and supported decisions", () => {
    const request = parseCodexApprovalRequest("17", "item/commandExecution/requestApproval", {
      threadId: "thread-1",
      turnId: "turn-1",
      itemId: "item-1",
      command: "TOKEN=secret-value npm test",
      cwd: "C:\\repo",
      availableDecisions: ["accept", "acceptForSession", "decline", "cancel", "acceptWithExecpolicyAmendment"],
    }, options(), null, null);

    expect(request).toMatchObject({
      kind: "command-execution",
      summary: { command: "TOKEN=[REDACTED] npm test", cwd: "C:\\repo", includesWrite: false },
      availableDecisions: ["approve-once", "approve-for-session", "decline", "cancel-turn"],
    });
    expect(codexApprovalResponse("command-execution", {}, "approve-for-session")).toEqual({ decision: "acceptForSession" });
  });

  it("detects command additional writes and excludes session approval", () => {
    const params = {
      threadId: "thread-1",
      turnId: "turn-1",
      itemId: "item-1",
      command: "write output",
      additionalPermissions: {
        fileSystem: {
          entries: [{ path: { type: "path", path: "D:\\outside" }, access: "write" }],
        },
      },
    };
    const request = parseCodexApprovalRequest("18", "item/commandExecution/requestApproval", params, options(), null, null);

    expect(request?.summary).toMatchObject({ includesWrite: true, writePaths: ["D:\\outside"] });
    expect(request?.availableDecisions).not.toContain("approve-for-session");
  });

  it("maps file-change and permissions responses without persisting private permission objects", () => {
    const file = parseCodexApprovalRequest("19", "item/fileChange/requestApproval", {
      threadId: "thread-1", turnId: "turn-1", itemId: "item-file", reason: "Apply patch", grantRoot: "D:\\target",
    }, options(), null, null);
    expect(file).toMatchObject({
      kind: "file-change",
      summary: { paths: ["D:\\target"], includesWrite: true },
    });

    const permissions = {
      network: { enabled: true },
      fileSystem: { read: ["D:\\read"], write: ["D:\\write"] },
    };
    const request = parseCodexApprovalRequest("20", "item/permissions/requestApproval", {
      threadId: "thread-1", turnId: "turn-1", itemId: "item-permission", cwd: "C:\\repo", permissions,
    }, options(), null, null);
    expect(request).toMatchObject({
      kind: "permissions",
      availableDecisions: ["approve-once", "decline"],
      summary: { network: true, readPaths: ["D:\\read"], writePaths: ["D:\\write"], includesWrite: true },
    });
    expect(codexApprovalResponse("permissions", { permissions }, "approve-once")).toEqual({
      permissions,
      scope: "turn",
      strictAutoReview: true,
    });
    expect(codexApprovalResponse("permissions", { permissions }, "decline")).toEqual({ permissions: {}, scope: "turn" });
  });

  it("intersects permissions decisions with the provider list and fails closed on no safe overlap", () => {
    const base = {
      threadId: "thread-1",
      turnId: "turn-1",
      itemId: "item-permission",
      permissions: { network: { enabled: true } },
    };

    expect(parseCodexApprovalRequest("21", "item/permissions/requestApproval", {
      ...base,
      availableDecisions: ["accept", "decline", "cancel", "acceptForSession"],
    }, options(), null, null)?.availableDecisions).toEqual(["approve-once", "decline"]);
    expect(parseCodexApprovalRequest("22", "item/permissions/requestApproval", {
      ...base,
      availableDecisions: ["cancel", "acceptForSession"],
    }, options(), null, null)?.availableDecisions).toEqual([]);
  });

  it("redacts common CLI flags and URL query secrets from the public command summary", () => {
    const request = parseCodexApprovalRequest("23", "item/commandExecution/requestApproval", {
      threadId: "thread-1",
      turnId: "turn-1",
      itemId: "item-command",
      command: "tool --token=token-value --password password-value --api-key key-value https://example.test/run?api_key=query-value&mode=safe",
    }, options(), null, null);

    expect(request?.summary.command).toBe(
      "tool --token=[REDACTED] --password=[REDACTED] --api-key=[REDACTED] https://example.test/run?api_key=[REDACTED]&mode=safe",
    );
  });
});

function options(): CodexAppServerTurnOptions {
  return {
    projectId: "project-1",
    runtimeScopeId: "conversation-1",
    roleId: "main-agent",
    runId: "run-1",
    cwd: "C:\\repo",
    prompt: "test",
    sandboxPolicy: "workspace-write",
    approvalMode: "on-request",
    paths: { events: "events", stderr: "stderr", lastMessage: "last", session: "session" },
  };
}
