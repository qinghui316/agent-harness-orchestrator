import { describe, expect, it } from "vitest";
import { buildRoleContextPacket, contextSourceRef, renderRoleContextPacket } from "../../src/context/packets.js";
import type { ChangeStatus, RunWorktreeInfo } from "../../src/types/index.js";

describe("role context packets", () => {
  it("builds a coder packet with scoped change context and ordinary-worker exclusions", () => {
    const packet = buildRoleContextPacket({
      roleId: "coder-agent",
      changeStatus: statusFixture(),
      goal: "Implement selected tasks.",
      runId: "run-1",
      taskIds: ["T-001"],
      worktree: worktreeFixture(),
      projectHarness: harnessIdentity(),
      writableRoots: ["E:/repo/.agent-harness/worktrees/wt-1"],
      sandboxPolicy: "workspace-write",
      evidenceRefs: [
        contextSourceRef("task-run", "task-run-1", "ref", "TaskRun evidence."),
      ],
      createdAt: "2026-05-31T00:00:00.000Z",
    });

    expect(packet.changeId).toBe("packet-change");
    expect(packet.version).toBe("2.0");
    expect(packet.permissions.mayDelegate).toBe(false);
    expect(packet.permissions.writableRoots).toEqual(["E:/repo/.agent-harness/worktrees/wt-1"]);
    expect(packet.projectHarness).toEqual(harnessIdentity());
    expect(packet.change.acceptanceCriteria).toEqual([{ id: "AC-001", text: "Packet context is scoped." }]);
    expect(packet.change.tasks[0]).toMatchObject({ id: "T-001", done: false, acIds: ["AC-001"] });
    expect(packet).not.toHaveProperty("includedSources");
    expect(packet).not.toHaveProperty("excludedSources");
  });

  it("builds an auditor packet with validation and diff refs without inlining full raw logs", () => {
    const packet = buildRoleContextPacket({
      roleId: "auditor-agent",
      changeStatus: statusFixture(),
      goal: "Audit validated evidence.",
      projectHarness: harnessIdentity(),
      writableRoots: [],
      sandboxPolicy: "read-only",
      evidenceSummary: ["Latest validation selected: passed (validation-1)."],
      evidenceRefs: [
        contextSourceRef("latest-validation", "validation-1", "inline", "Validation summary."),
        contextSourceRef("worktree-diff", ".agent-harness/runs/run-1/diff.patch", "ref", "Full diff ref."),
      ],
      createdAt: "2026-05-31T00:00:00.000Z",
    });
    const markdown = renderRoleContextPacket(packet);

    expect(packet.permissions.writableRoots).toEqual([]);
    expect(packet.evidence.refs.map((ref) => ref.kind)).toEqual(["latest-validation", "worktree-diff"]);
    expect(markdown).toContain("Latest validation selected");
    expect(markdown).toContain("worktree-diff");
    expect(markdown).toContain("does not limit which project Harness Skill pages");
  });

  it("records exact permissions without creating a maintenance memory tier", () => {
    const packet = buildRoleContextPacket({
      roleId: "documentation-agent",
      changeStatus: statusFixture(),
      goal: "Review documentation drift.",
      projectHarness: harnessIdentity(),
      writableRoots: ["E:/candidate"],
      sandboxPolicy: "workspace-write",
      createdAt: "2026-05-31T00:00:00.000Z",
    });

    expect(packet.permissions.writableRoots).toEqual(["E:/candidate"]);
    expect(packet.permissions.sandboxPolicy).toBe("workspace-write");
    expect(JSON.stringify(packet)).not.toContain("maintenance-hot-warm-cold");
  });
});

function harnessIdentity() {
  return {
    projectId: "repo",
    skillName: "repo-harness",
    skillRevision: 27,
    contentFingerprint: "a".repeat(64),
  };
}

function statusFixture(): ChangeStatus {
  return {
    projectPath: "E:/repo",
    activeChanges: [{ name: "packet-change", path: "harness/changes/active/packet-change" }],
    change: {
      version: "1.0",
      id: "packet-change",
      title: "Packet Change",
      state: "active",
      createdAt: "2026-05-31T00:00:00.000Z",
      updatedAt: "2026-05-31T00:00:00.000Z",
      closedAt: null,
      archivePath: null,
    },
    reviewStatus: "approved",
    acMap: {
      version: "1.0",
      generatedAt: "2026-05-31T00:00:00.000Z",
      changeId: "packet-change",
      acceptanceCriteria: [{ id: "AC-001", text: "Packet context is scoped.", taskIds: ["T-001"], validationRefs: [], warnings: [] }],
      tasks: [{ id: "T-001", text: "Build packet.", acIds: ["AC-001"], done: false, warnings: [] }],
      warnings: [],
      blockingIssues: [],
    },
    specTest: null,
    latestValidation: {
      id: "validation-1",
      runId: "run-validation-1",
      changeId: "packet-change",
      profile: "default",
      status: "passed",
      executionMode: "direct",
      startedAt: "2026-05-31T00:00:00.000Z",
      finishedAt: "2026-05-31T00:00:01.000Z",
      commandCount: 1,
    },
    latestAudit: null,
    closeGate: { ready: false, warnings: [], blockingIssues: [] },
  };
}

function worktreeFixture(): RunWorktreeInfo {
  return {
    worktreeId: "wt-1",
    branchName: "aho/wt-1",
    baseRef: "main",
    baseCommit: "abc123",
    checkoutPath: "E:/repo/.agent-harness/worktrees/wt-1",
    metadataPath: ".agent-harness/worktrees/wt-1.json",
  };
}
