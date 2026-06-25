import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ManagedProject, ResolvedMemory } from "../../src/types/index.js";

const statuses: Array<{ worktreeId: string; status: string }> = [];
const gates = new Map<string, unknown>();

vi.mock("../../src/memory/resolver.js", () => ({
  resolveProjectMemory: vi.fn(async () => memory),
}));

vi.mock("../../src/worktree/manager.js", () => ({
  listWorktreeStatuses: vi.fn(async () => statuses),
}));

vi.mock("../../src/apply/manager.js", () => ({
  canApplyResultFromGate: vi.fn(() => true),
  classifyApplyReadiness: vi.fn(() => ({ kind: "ready" })),
  previewWorktreeApply: vi.fn(async (_project: ManagedProject, worktreeId: string) => gates.get(worktreeId)),
}));

const project: ManagedProject = { id: "project-1", path: "E:/tmp/project" };
const memory = {
  mode: "repo-local",
  supported: true,
  writable: true,
  projectId: "project-1",
  memoryRoot: "E:/tmp/project/.agent-harness",
} as ResolvedMemory;

describe("IntegrationCheck candidate Change boundary", () => {
  beforeEach(() => {
    statuses.length = 0;
    gates.clear();
  });

  it("groups candidates by Change and only returns the selected Change group", async () => {
    const { findIntegrationCheckCandidate } = await import("../../src/integration-check/candidates.js");
    addReadyGate("wt-a1", "change-a");
    addReadyGate("wt-b1", "change-b");
    addReadyGate("wt-b2", "change-b");

    await expect(findIntegrationCheckCandidate(project, "change-a")).resolves.toBeNull();
    await expect(findIntegrationCheckCandidate(project, "change-b")).resolves.toMatchObject({
      targets: [
        expect.objectContaining({ changeId: "change-b", worktreeId: "wt-b1" }),
        expect.objectContaining({ changeId: "change-b", worktreeId: "wt-b2" }),
      ],
    });
  });

  it("rejects explicit IntegrationCheck targets from different Changes", async () => {
    const { collectReadyTargets } = await import("../../src/integration-check/candidates.js");
    addReadyGate("wt-a1", "change-a");
    addReadyGate("wt-b1", "change-b");

    await expect(collectReadyTargets(project, memory, ["wt-a1", "wt-b1"], "change-a")).rejects.toThrow(/same Change/i);
  });

  it("rejects same-group worktrees when they do not belong to the requested Change", async () => {
    const { collectReadyTargets } = await import("../../src/integration-check/candidates.js");
    addReadyGate("wt-b1", "change-b");
    addReadyGate("wt-b2", "change-b");

    await expect(collectReadyTargets(project, memory, ["wt-b1", "wt-b2"], "change-a")).rejects.toThrow(/requested Change/i);
    await expect(collectReadyTargets(project, memory, ["wt-b1", "wt-b2"], "change-b")).resolves.toHaveLength(2);
  });
});

function addReadyGate(worktreeId: string, changeId: string): void {
  statuses.push({ worktreeId, status: "ready" });
  gates.set(worktreeId, { gate: {
    changeId,
    worktree: { worktreeId },
    diffHash: `diff-${worktreeId}`,
    diffStat: `${worktreeId}.ts | 1 +`,
    sourceHead: `head-${changeId}`,
  } });
}
