import { describe, expect, it, vi } from "vitest";
import {
  MaintenanceReviewBlockedError,
  runMaintenanceProviderAssignment,
  type MaintenanceProviderExecutionRequest,
  type MaintenanceProviderExecutor,
} from "../../src/agent-task/maintenance-provider-runner.js";
import type { HarnessEngineeringAssignment } from "../../src/agent-task/harness-engineering-contract.js";
import type { MaintenanceDiffManifest, ManagedProject } from "../../src/types/index.js";

describe("maintenance provider runner", () => {
  it("captures the producer workspace diff and obtains one closeout approval", async () => {
    const requests: MaintenanceProviderExecutionRequest[] = [];
    const assignment = makeAssignment("maintain-assigned-closeout");
    const executor = vi.fn<MaintenanceProviderExecutor>(async (request) => {
      requests.push(request);
      return request.role === "maintenance-agent"
        ? { threadId: "producer", parentThreadId: null, finalText: "Updated stale handoff facts." }
        : { threadId: "reviewer", parentThreadId: "review-coordinator", finalText: review(manifest().workspaceHash) };
    });

    const evidence = await runMaintenanceProviderAssignment({
      project: project(), assignment, executor, getSkillContext: fakeSkillContext, captureDiff: vi.fn(async () => manifest()),
    });

    expect(evidence).toMatchObject({
      version: "2.0", assignmentId: "assignment-1", manifestHash: manifest().workspaceHash,
      producer: { role: "maintenance-agent", threadIds: ["producer"] },
      quorum: { required: 1, approved: 1 }, application: "not-applied",
    });
    expect(requests[0]).toMatchObject({ cwd: "C:/workspace", writable: true });
    expect(requests[0]?.prompt).toContain("Do not return a patch JSON envelope");
    expect(requests[1]).toMatchObject({ cwd: "C:/workspace", writable: false });
    expect(requests[1]?.prompt).toContain(manifest().workspaceHash);
    expect(requests[1]?.prompt).toContain(manifest().unifiedDiff);
  });

  it("requires two independent evolution reviewers bound to the exact manifest", async () => {
    const assignment = makeAssignment("evolve-assigned-window");
    let reviewer = 0;
    const executor: MaintenanceProviderExecutor = async (request) => {
      if (request.role === "evolution-agent") return { threadId: "producer", parentThreadId: null, finalText: "Evolved docs." };
      reviewer += 1;
      return { threadId: `review-${reviewer}`, parentThreadId: `coordinator-${reviewer}`, finalText: review(manifest().workspaceHash) };
    };
    const evidence = await runMaintenanceProviderAssignment({ project: project(), assignment, executor, getSkillContext: fakeSkillContext, captureDiff: async () => manifest() });
    expect(evidence.quorum).toEqual({ required: 2, approved: 2 });
    expect(evidence.reviews.map((item) => item.threadId)).toEqual(["review-1", "review-2"]);
  });

  it("fails stale reviews closed", async () => {
    const assignment = makeAssignment("maintain-assigned-closeout");
    const executor: MaintenanceProviderExecutor = async (request) => request.role === "maintenance-agent"
      ? { threadId: "producer", parentThreadId: null, finalText: "Done." }
      : { threadId: "review", parentThreadId: "coordinator", finalText: review("f".repeat(64)) };
    await expect(runMaintenanceProviderAssignment({ project: project(), assignment, executor, getSkillContext: fakeSkillContext, captureDiff: async () => manifest() }))
      .rejects.toThrow("stale or belongs to another assignment/diff");
  });

  it("allows one workspace revision and treats a reviewer block as terminal", async () => {
    const assignment = makeAssignment("maintain-assigned-closeout");
    let producer = 0;
    let reviewCount = 0;
    const reviseExecutor: MaintenanceProviderExecutor = async (request) => {
      if (request.role === "maintenance-agent") return { threadId: `producer-${++producer}`, parentThreadId: null, finalText: "Done." };
      reviewCount += 1;
      return { threadId: `review-${reviewCount}`, parentThreadId: `coordinator-${reviewCount}`, finalText: review(manifest().workspaceHash, reviewCount === 1 ? "revise" : "approve") };
    };
    const revised = await runMaintenanceProviderAssignment({ project: project(), assignment, executor: reviseExecutor, getSkillContext: fakeSkillContext, captureDiff: async () => manifest() });
    expect(revised.producer.threadIds).toEqual(["producer-1", "producer-2"]);

    const blockedExecutor: MaintenanceProviderExecutor = async (request) => request.role === "maintenance-agent"
      ? { threadId: "producer", parentThreadId: null, finalText: "Done." }
      : { threadId: "review", parentThreadId: "coordinator", finalText: review(manifest().workspaceHash, "block") };
    await expect(runMaintenanceProviderAssignment({ project: project(), assignment, executor: blockedExecutor, getSkillContext: fakeSkillContext, captureDiff: async () => manifest() }))
      .rejects.toBeInstanceOf(MaintenanceReviewBlockedError);
  });
});

function makeAssignment(mode: HarnessEngineeringAssignment["mode"]): HarnessEngineeringAssignment {
  return {
    mode, projectId: "project-1", assignmentId: "assignment-1", inputCheckpoint: "checkpoint-1",
    policyVersion: "policy-v1", sourceWindowHash: "window-1", evidenceRefs: ["evidence-1"],
    currentDocumentRefs: [], currentStableMemoryRefs: [], namespaceClasses: ["content"], requiredVerification: ["verify-1"],
    workspace: {
      version: "1.0", assignmentId: "assignment-1", mode: "immutable-snapshot", memoryMode: "external-local",
      maintenanceRoot: "C:/maintenance",
      baseRoot: "C:/memory", baseSnapshotRoot: "C:/workspace.base", workspaceRoot: "C:/workspace", namespaces: ["docs"],
      baseRef: "snapshot", baseHash: "base-hash", baseTreeHash: "base-tree-hash",
    },
  };
}

function manifest(): MaintenanceDiffManifest {
  return {
    version: "1.0", assignmentId: "assignment-1", baseHash: "base-hash", workspaceHash: "a".repeat(64), treeHash: "tree-hash",
    added: [], modified: [{ path: "docs/STATUS.md", hash: "after" }], deleted: [], renamed: [],
    unifiedDiff: "--- a/docs/STATUS.md\n+++ b/docs/STATUS.md\n-old\n+new\n",
  };
}

function review(manifestHash: string, decision: "approve" | "revise" | "block" = "approve"): string {
  return JSON.stringify({ decision, assignmentId: "assignment-1", manifestHash, summary: "independent review", findings: [] });
}

const fakeSkillContext = vi.fn(async () => ({ records: [], promptSection: "typed assignment context", warnings: [] }));
function project(): ManagedProject { return { id: "project-1", name: "Project", path: "C:/project", addedAt: "2026-07-11T00:00:00.000Z", lastSeenAt: "2026-07-11T00:00:00.000Z" }; }
