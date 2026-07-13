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
      evidenceRefs: [
        contextSourceRef("task-run", "task-run-1", "ref", "TaskRun evidence."),
      ],
      createdAt: "2026-05-31T00:00:00.000Z",
    });

    expect(packet.changeId).toBe("packet-change");
    expect(packet.permissionProfile.mayDelegate).toBe(false);
    expect(packet.permissionProfile.allowedWriteRoots).toContain("aho-owned-worktree");
    expect(packet.change.acceptanceCriteria).toEqual([{ id: "AC-001", text: "Packet context is scoped." }]);
    expect(packet.change.tasks[0]).toMatchObject({ id: "T-001", done: false, acIds: ["AC-001"] });
    expect(packet.includedSources.some((source) => source.kind === "selected-task-scope")).toBe(true);
    expect(packet.excludedSources).toContain("full parent transcript");
    expect(packet.excludedSources).toContain("maintenance hot/warm/cold ledger");
    expect(packet.excludedSources).toContain("delegateTask manifest for worker roles");
  });

  it("builds an auditor packet with validation and diff refs without inlining full raw logs", () => {
    const packet = buildRoleContextPacket({
      roleId: "auditor-agent",
      changeStatus: statusFixture(),
      goal: "Audit validated evidence.",
      evidenceSummary: ["Latest validation selected: passed (validation-1)."],
      evidenceRefs: [
        contextSourceRef("latest-validation", "validation-1", "inline", "Validation summary."),
        contextSourceRef("worktree-diff", ".agent-harness/runs/run-1/diff.patch", "ref", "Full diff ref."),
      ],
      createdAt: "2026-05-31T00:00:00.000Z",
    });
    const markdown = renderRoleContextPacket(packet);

    expect(packet.permissionProfile.allowedWriteRoots).toContain("audit-artifacts");
    expect(packet.evidenceRefs.map((ref) => ref.kind)).toEqual(["latest-validation", "worktree-diff"]);
    expect(markdown).toContain("Latest validation selected");
    expect(markdown).toContain("worktree-diff");
    expect(packet.excludedSources).toContain("raw stdout/stderr/jsonl unless explicitly selected");
    expect(packet.excludedSources).toContain("full Harness directory");
  });

  it("keeps maintenance roles separate from ordinary worker source-write context", () => {
    const packet = buildRoleContextPacket({
      roleId: "documentation-agent",
      changeStatus: statusFixture(),
      goal: "Review documentation drift.",
      createdAt: "2026-05-31T00:00:00.000Z",
    });

    expect(packet.permissionProfile.allowedReadRoots).toContain("assigned-memory");
    expect(packet.permissionProfile.allowedWriteRoots).toContain("assigned-project-harness");
    expect(packet.permissionProfile.allowedWriteRoots).not.toContain("aho-owned-worktree");
    expect(packet.excludedSources).toContain("source root mutation");
  });
});

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
