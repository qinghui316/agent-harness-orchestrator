import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectExecutionRuntimePort, ProjectHarnessExecutionPort } from "../../src/project-runtime/execution-ports.js";
import type { ManagedProject } from "../../src/types/index.js";

const statuses: Array<{ worktreeId: string; status: string }> = [];
const gates = new Map<string, unknown>();

vi.mock("../../src/worktree/manager.js", () => ({
  listWorktreeStatuses: vi.fn(async () => statuses),
}));

vi.mock("../../src/apply/gate.js", () => ({
  canApplyResultFromGate: vi.fn(() => true),
  classifyApplyReadiness: vi.fn(() => ({ kind: "ready" })),
  evaluateSkillNativeCandidateGate: vi.fn(async (
    _project: ManagedProject,
    _runtime: ProjectExecutionRuntimePort,
    _harness: ProjectHarnessExecutionPort,
    worktreeId: string,
  ) => gates.get(worktreeId)),
}));

const project: ManagedProject = { id: "project-1", path: "project-root" };
const runtime = {
  projectId: "project-1",
} as ProjectExecutionRuntimePort;
const harness = {
  evidenceRoot: "project-skill/state/changes/active/change-a",
} as ProjectHarnessExecutionPort;

describe("IntegrationCheck candidate Change boundary", () => {
  beforeEach(() => {
    statuses.length = 0;
    gates.clear();
  });

  it("groups candidates by Change and only returns the selected Change group", async () => {
    const { findSkillNativeIntegrationCheckCandidate } = await import("../../src/integration-check/candidates.js");
    addReadyGate("wt-a1", "change-a");
    addReadyGate("wt-b1", "change-b");
    addReadyGate("wt-b2", "change-b");

    await expect(findSkillNativeIntegrationCheckCandidate(project, runtime, harness, "change-a")).resolves.toBeNull();
    await expect(findSkillNativeIntegrationCheckCandidate(project, runtime, harness, "change-b")).resolves.toMatchObject({
      targets: [
        expect.objectContaining({ changeId: "change-b", worktreeId: "wt-b1" }),
        expect.objectContaining({ changeId: "change-b", worktreeId: "wt-b2" }),
      ],
    });
  });

  it("rejects explicit IntegrationCheck targets from different Changes", async () => {
    const { collectSkillNativeReadyTargets } = await import("../../src/integration-check/candidates.js");
    addReadyGate("wt-a1", "change-a");
    addReadyGate("wt-b1", "change-b");

    await expect(collectSkillNativeReadyTargets(project, runtime, harness, ["wt-a1", "wt-b1"], "change-a")).rejects.toThrow(/same Change/i);
  });

  it("rejects same-group worktrees when they do not belong to the requested Change", async () => {
    const { collectSkillNativeReadyTargets } = await import("../../src/integration-check/candidates.js");
    addReadyGate("wt-b1", "change-b");
    addReadyGate("wt-b2", "change-b");

    await expect(collectSkillNativeReadyTargets(project, runtime, harness, ["wt-b1", "wt-b2"], "change-a")).rejects.toThrow(/requested Change/i);
    await expect(collectSkillNativeReadyTargets(project, runtime, harness, ["wt-b1", "wt-b2"], "change-b")).resolves.toHaveLength(2);
  });
});

function addReadyGate(worktreeId: string, changeId: string): void {
  statuses.push({ worktreeId, status: "ready" });
  gates.set(worktreeId, {
    changeId,
    worktree: { worktreeId },
    diffHash: `diff-${worktreeId}`,
    diffStat: `${worktreeId}.ts | 1 +`,
    sourceHead: `head-${changeId}`,
    validation: { id: `validation-${worktreeId}` },
    audit: { id: `audit-${worktreeId}` },
  });
}
