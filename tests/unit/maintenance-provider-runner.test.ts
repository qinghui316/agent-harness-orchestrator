import { describe, expect, it, vi } from "vitest";
import {
  EvolutionScoreBlockedError,
  runMaintenanceProviderAssignment,
  type MaintenanceProviderExecutionRequest,
  type MaintenanceProviderExecutor,
} from "../../src/agent-task/maintenance-provider-runner.js";
import type { HarnessEngineeringAssignment } from "../../src/agent-task/harness-engineering-contract.js";
import type { ManagedProject } from "../../src/types/index.js";

describe("maintenance provider runner", () => {
  it("lets Maintenance Agent edit canonical Markdown directly without review or apply", async () => {
    const requests: MaintenanceProviderExecutionRequest[] = [];
    const executor = vi.fn<MaintenanceProviderExecutor>(async (request) => {
      requests.push(request);
      return { threadId: `maintenance-${requests.length}`, parentThreadId: null, finalText: "Updated canonical docs.", changedFiles: request.cwd === "C:/project" ? ["AGENTS.md"] : ["docs/STATUS.md"] };
    });
    const assignment = makeAssignment("maintain-assigned-closeout");
    assignment.canonicalTarget.additionalSources = [{ key: "project", root: "C:/project", namespaces: ["AGENTS.md"] }];

    const evidence = await runMaintenanceProviderAssignment({
      project: project(), assignment, executor, getSkillContext: fakeSkillContext,
    });

    expect(evidence).toMatchObject({
      version: "3.0", canonicalRoot: "C:/memory", application: "direct-canonical-edit",
      producer: { role: "maintenance-agent", threadIds: ["maintenance-1", "maintenance-2"] },
    });
    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatchObject({ cwd: "C:/memory", writable: true, role: "maintenance-agent" });
    expect(requests[1]).toMatchObject({ cwd: "C:/project", writable: true, role: "maintenance-agent" });
    expect(requests[1]?.prompt).toContain("AGENTS.md");
    expect(requests[0]?.prompt).toContain("Do not create a proposal, reviewer, diff manifest");
  });

  it("requires a native scorer score of at least 80 before Evolution edits target docs", async () => {
    const requests: MaintenanceProviderExecutionRequest[] = [];
    const executor: MaintenanceProviderExecutor = async (request) => {
      requests.push(request);
      if (request.role === "evolution-scorer") {
        return { threadId: "scorer-child", parentThreadId: "proposal", finalText: JSON.stringify(score(86, "supported")), changedFiles: [] };
      }
      if (!request.writable) return { threadId: "proposal", parentThreadId: null, finalText: "Proposal: update docs/ECL.md.", changedFiles: [] };
      return { threadId: "proposal", parentThreadId: null, finalText: "Applied accepted evolution.", changedFiles: ["docs/ECL.md"] };
    };

    const evidence = await runMaintenanceProviderAssignment({
      project: project(), assignment: makeAssignment("evolve-assigned-window"), executor, getSkillContext: fakeSkillContext,
    });

    expect(requests.map(({ role, writable }) => [role, writable])).toEqual([
      ["evolution-agent", false], ["evolution-scorer", false], ["evolution-agent", true],
    ]);
    expect(requests[1]).toMatchObject({ parentThreadId: "proposal" });
    expect(evidence.scoring).toMatchObject({ score: 86, threadId: "scorer-child", parentThreadId: "proposal" });
    expect(evidence.application).toBe("direct-canonical-edit");
  });

  it("does not grant canonical write access when Evolution scores below 80", async () => {
    const executor = vi.fn<MaintenanceProviderExecutor>(async (request) => request.role === "evolution-scorer"
      ? { threadId: `scorer-${executor.mock.calls.length}`, parentThreadId: "proposal", finalText: JSON.stringify(score(79, "insufficient evidence")), changedFiles: [] }
      : { threadId: "proposal", parentThreadId: null, finalText: request.existingThreadId ? "Revised proposal." : "Weak proposal.", changedFiles: [] });

    await expect(runMaintenanceProviderAssignment({
      project: project(), assignment: makeAssignment("evolve-assigned-window"), executor, getSkillContext: fakeSkillContext,
    })).rejects.toBeInstanceOf(EvolutionScoreBlockedError);
    expect(executor).toHaveBeenCalledTimes(4);
    expect(executor.mock.calls.some(([request]) => request.writable)).toBe(false);
  });

  it("rejects scorer output that is not a native child of the proposal", async () => {
    const executor: MaintenanceProviderExecutor = async (request) => request.role === "evolution-scorer"
      ? { threadId: "scorer", parentThreadId: "other", finalText: JSON.stringify(score(90, "ok")), changedFiles: [] }
      : { threadId: "proposal", parentThreadId: null, finalText: "Proposal.", changedFiles: [] };
    await expect(runMaintenanceProviderAssignment({
      project: project(), assignment: makeAssignment("evolve-assigned-window"), executor, getSkillContext: fakeSkillContext,
    })).rejects.toThrow("native child of the proposal thread");
  });

  it("rejects canonical edits outside the assigned Markdown namespaces", async () => {
    const executor: MaintenanceProviderExecutor = async () => ({
      threadId: "maintenance", parentThreadId: null, finalText: "Changed source.", changedFiles: ["src/runtime.ts"],
    });
    await expect(runMaintenanceProviderAssignment({
      project: project(), assignment: makeAssignment("maintain-assigned-closeout"), executor, getSkillContext: fakeSkillContext,
    })).rejects.toThrow("outside its assigned Markdown namespaces");
  });
});

function makeAssignment(mode: HarnessEngineeringAssignment["mode"]): HarnessEngineeringAssignment {
  return {
    mode, projectId: "project-1", assignmentId: "assignment-1", inputCheckpoint: "checkpoint-1",
    policyVersion: "policy-v1", sourceWindowHash: "window-1", evidenceRefs: ["evidence-1"],
    currentDocumentRefs: [], currentStableMemoryRefs: [], namespaceClasses: ["content"], requiredVerification: ["verify-1"],
    canonicalTarget: {
      version: "1.0", assignmentId: "assignment-1", mode: "canonical-direct", memoryMode: "external-local",
      baseRoot: "C:/memory", namespaces: ["docs"],
    },
  };
}

const fakeSkillContext = vi.fn(async () => ({ records: [], promptSection: "typed assignment context", warnings: [] }));
function project(): ManagedProject { return { id: "project-1", name: "Project", path: "C:/project", addedAt: "2026-07-11T00:00:00.000Z", lastSeenAt: "2026-07-11T00:00:00.000Z" }; }

function score(total: 79 | 86 | 90, summary: string) {
  const dimensions = total === 79
    ? { evidenceGrounding: 24, projectRelevance: 20, mechanicalEnforceability: 12, regressionSafety: 16, contextCost: 7 }
    : total === 86
      ? { evidenceGrounding: 26, projectRelevance: 22, mechanicalEnforceability: 13, regressionSafety: 17, contextCost: 8 }
      : { evidenceGrounding: 27, projectRelevance: 23, mechanicalEnforceability: 14, regressionSafety: 18, contextCost: 8 };
  return { score: total, dimensions, hardIssues: [], summary };
}
