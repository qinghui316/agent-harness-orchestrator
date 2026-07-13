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
  it("lets one Maintenance Agent inspect both roots and edit the actual Harness directly", async () => {
    const requests: MaintenanceProviderExecutionRequest[] = [];
    const executor = vi.fn<MaintenanceProviderExecutor>(async (request) => {
      requests.push(request);
      return { threadId: "maintenance", parentThreadId: null, finalText: "Updated current Harness.", changedFiles: ["docs/STATUS.md", "AGENTS.md"] };
    });

    const evidence = await runMaintenanceProviderAssignment({
      project: project(), assignment: makeAssignment("maintain-assigned-closeout"), executor, getSkillContext: fakeSkillContext,
    });

    expect(evidence).toMatchObject({
      version: "4.0",
      taskId: "task-1",
      roots: { project: "C:/project", memory: "C:/memory" },
      application: "agent-direct-edit",
      producer: { role: "maintenance-agent", threadId: "maintenance", changedFiles: ["docs/STATUS.md", "AGENTS.md"] },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      cwd: "C:/memory",
      writable: true,
      writableRoots: ["C:/project", "C:/memory"],
      role: "maintenance-agent",
    });
    expect(requests[0]?.prompt).toContain("Inspect the actual Harness structure");
    expect(requests[0]?.prompt).not.toMatch(/namespace|allowed target|canonical target/i);
  });

  it("requires a native scorer score of at least 80 before Evolution edits", async () => {
    const requests: MaintenanceProviderExecutionRequest[] = [];
    const executor: MaintenanceProviderExecutor = async (request) => {
      requests.push(request);
      if (request.role === "evolution-scorer") {
        return { threadId: "scorer-child", parentThreadId: "proposal", finalText: JSON.stringify(score(86, "supported")), changedFiles: [] };
      }
      if (!request.writable) return { threadId: "proposal", parentThreadId: null, finalText: "Proposal: merge duplicate guidance.", changedFiles: [] };
      return { threadId: "proposal", parentThreadId: null, finalText: "Completed accepted evolution.", changedFiles: ["current-guidance.md"] };
    };

    const evidence = await runMaintenanceProviderAssignment({
      project: project(), assignment: makeAssignment("evolve-assigned-window"), executor, getSkillContext: fakeSkillContext,
    });

    expect(requests.map(({ role, writable }) => [role, writable])).toEqual([
      ["evolution-agent", false], ["evolution-scorer", false], ["evolution-agent", true],
    ]);
    expect(requests[1]).toMatchObject({ parentThreadId: "proposal" });
    expect(requests[1]?.prompt).toContain("Window evidence: evidence-1");
    expect(evidence.scoring).toMatchObject({ score: 86, threadId: "scorer-child", parentThreadId: "proposal" });
    expect(evidence.application).toBe("agent-direct-edit");
  });

  it("allows only one proposal revision and never grants write access below 80", async () => {
    const executor = vi.fn<MaintenanceProviderExecutor>(async (request) => request.role === "evolution-scorer"
      ? { threadId: `scorer-${executor.mock.calls.length}`, parentThreadId: "proposal", finalText: JSON.stringify(nestedScore(79, "insufficient evidence")), changedFiles: [] }
      : { threadId: "proposal", parentThreadId: null, finalText: request.existingThreadId ? "Revised proposal." : "Weak proposal.", changedFiles: [] });

    const error = await runMaintenanceProviderAssignment({
      project: project(), assignment: makeAssignment("evolve-assigned-window"), executor, getSkillContext: fakeSkillContext,
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(EvolutionScoreBlockedError);
    expect((error as EvolutionScoreBlockedError).evidence).toMatchObject({
      status: "blocked",
      application: "not-applied",
      proposal: "Revised proposal.",
      scoringAttempts: [{ score: 79 }, { score: 79 }],
    });
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

  it("keeps changed files as evidence instead of authorization", async () => {
    const executor: MaintenanceProviderExecutor = async () => ({
      threadId: "maintenance", parentThreadId: null, finalText: "Agent judged the delta.", changedFiles: ["unusual-project-guide.md"],
    });
    const result = await runMaintenanceProviderAssignment({
      project: project(), assignment: makeAssignment("maintain-assigned-closeout"), executor, getSkillContext: fakeSkillContext,
    });
    expect(result.producer.changedFiles).toEqual(["unusual-project-guide.md"]);
  });
});

function makeAssignment(mode: HarnessEngineeringAssignment["mode"]): HarnessEngineeringAssignment {
  return {
    mode,
    taskId: "task-1",
    projectRoot: "C:/project",
    memoryRoot: "C:/memory",
    evidenceRefs: ["evidence-1"],
    ...(mode === "evolve-assigned-window" ? { sourceWindow: { hash: "window-1", evidenceRefs: ["evidence-1"] } } : {}),
    requiredVerification: [{ name: "verify", command: ["npm", "run", "verify"] }],
  };
}

const fakeSkillContext = vi.fn(async () => ({ records: [], promptSection: "task packet", warnings: [] }));
function project(): ManagedProject { return { id: "project-1", name: "Project", path: "C:/project", addedAt: "2026-07-11T00:00:00.000Z", lastSeenAt: "2026-07-11T00:00:00.000Z" }; }

function score(total: 79 | 86 | 90, summary: string) {
  const dimensions = total === 79
    ? { evidenceGrounding: 24, projectRelevance: 20, mechanicalEnforceability: 12, regressionSafety: 16, contextCost: 7 }
    : total === 86
      ? { evidenceGrounding: 26, projectRelevance: 22, mechanicalEnforceability: 13, regressionSafety: 17, contextCost: 8 }
      : { evidenceGrounding: 27, projectRelevance: 23, mechanicalEnforceability: 14, regressionSafety: 18, contextCost: 8 };
  return { score: total, dimensions, hardIssues: [], summary };
}

function nestedScore(total: 79, summary: string) {
  const flat = score(total, summary);
  return {
    ...flat,
    dimensions: Object.fromEntries(Object.entries(flat.dimensions).map(([name, value]) => [name, {
      score: value,
      reason: `${name} evidence`,
    }])),
  };
}
