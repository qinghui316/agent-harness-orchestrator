import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, afterEach, beforeEach } from "vitest";
import { initHarness } from "../../src/harness/init.js";
import { resolveProjectMemory } from "../../src/memory/resolver.js";
import type { CandidateReview, CandidateScore, EvolutionCandidate, ManagedProject } from "../../src/types/index.js";
import {
  buildRoleScopedContextProjection,
  checkDocBudgets,
  claimAgentTask,
  completeAgentTask,
  createAgentTask,
  listAgentTasks,
  listMaintenanceCanonicalPatchProposals,
  listMaintenanceCanonicalUpdateProposals,
  listMaintenanceCanonicalUpdateDecisions,
  listMaintenanceCandidateResolutions,
  listDemandMemoryCloseouts,
  listMaintenanceLedgerEntries,
  maybeRunMaintenanceReviewWindow,
  proposeMaintenanceCanonicalPatch,
  proposeMaintenanceCanonicalUpdate,
  readAgentTaskResult,
  readMaintenanceCanonicalPatchProposal,
  recordMaintenanceCanonicalUpdateDecision,
  readMaintenanceCanonicalUpdateProposal,
  readMaintenanceCandidateResolution,
  readMaintenanceReviewWatermark,
  recordDemandMemoryCloseout,
  recordMaintenanceLedgerEntry,
  resolveMaintenanceCandidate,
  runMaintenanceCandidatePipeline,
} from "../../src/agent-task/manager.js";

describe("AgentTask domain boundaries", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "aho-agent-task-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("keeps the manager facade compatible while internal agent-task modules avoid the facade", async () => {
    expect(typeof createAgentTask).toBe("function");
    expect(typeof completeAgentTask).toBe("function");
    expect(typeof recordDemandMemoryCloseout).toBe("function");
    expect(typeof runMaintenanceCandidatePipeline).toBe("function");
    expect(typeof listMaintenanceCandidateResolutions).toBe("function");
    expect(typeof readMaintenanceCandidateResolution).toBe("function");
    expect(typeof listMaintenanceCanonicalUpdateProposals).toBe("function");
    expect(typeof readMaintenanceCanonicalUpdateProposal).toBe("function");

    const offenders = (await listSourceFiles("src/agent-task"))
      .filter((file) => !file.endsWith("manager.ts"))
      .filter((file) => /from\s+["']\.\/manager\.js["']/.test(readFileSyncUtf8(file)));
    expect(offenders).toEqual([]);
  });

  it("preserves AgentTask lifecycle and result artifact behavior", async () => {
    await initHarness(project());
    const memory = await resolveProjectMemory(project());

    const task = await createAgentTask(memory, {
      conversationId: "conversation-1",
      changeId: "change-1",
      roleId: "coder-agent",
      kind: "foreground",
      summary: "Run coder",
      inputArtifacts: ["harness/changes/active/change-1/spec.md"],
    });
    const claimed = await claimAgentTask(memory, task);
    const result = await completeAgentTask(memory, claimed, {
      status: "completed",
      summary: "Coder completed",
      artifactRefs: ["runs/code/change-1/result.md"],
    });

    expect(claimed.status).toBe("claimed");
    expect(result).toMatchObject({
      taskId: task.id,
      roleId: "coder-agent",
      status: "completed",
      artifactRefs: ["runs/code/change-1/result.md"],
    });
    await expect(readAgentTaskResult(memory, task.id)).resolves.toMatchObject({ taskId: task.id });
    await expect(listAgentTasks(memory, "change-1")).resolves.toMatchObject([
      expect.objectContaining({
        id: task.id,
        status: "completed",
        outputArtifacts: ["runs/code/change-1/result.md"],
      }),
    ]);
  });

  it("keeps maintenance review threshold and role-scoped maintenance isolation", async () => {
    await initHarness(project());
    const memory = await resolveProjectMemory(project());

    for (let index = 1; index <= 5; index += 1) {
      await recordDemandMemoryCloseout(memory, {
        changeId: `closeout-${index}`,
        title: `Demand ${index}`,
        terminalKind: "archived",
        finalResult: `Demand ${index} completed.`,
        userDecision: "archived",
        reusableLessonCandidates: [{ summary: "Keep evidence linked." }],
      });
    }

    await expect(maybeRunMaintenanceReviewWindow(memory)).resolves.toMatchObject({ status: "skipped" });
    await expect(listDemandMemoryCloseouts(memory)).resolves.toHaveLength(5);
    await expect(readMaintenanceReviewWatermark(memory)).resolves.toMatchObject({
      lastReviewedChangeIds: [
        "closeout-1:archived",
        "closeout-2:archived",
        "closeout-3:archived",
        "closeout-4:archived",
        "closeout-5:archived",
      ],
      lastReviewWindowId: expect.stringMatching(/^maintenance-review-/),
    });
    const resolutions = await listMaintenanceCandidateResolutions(memory);
    const proposals = await listMaintenanceCanonicalUpdateProposals(memory);
    expect(resolutions.length).toBeGreaterThan(0);
    expect(proposals.length).toBeGreaterThan(0);
    expect(resolutions[0]).toMatchObject({
      outcome: expect.stringMatching(/promote|merge|retire|archive-only|noop/),
      canonicalUpdateRequired: expect.any(Boolean),
      humanGateRequired: expect.any(Boolean),
      rationale: expect.stringContaining("evidence/proposal only"),
    });
    expect(proposals[0]).toMatchObject({
      status: "proposed",
      humanGateRequired: true,
      canonicalUpdateAuthorized: false,
      summary: expect.stringContaining("human-gated canonical update proposal"),
    });
    await expect(readMaintenanceCandidateResolution(memory, resolutions[0].candidateId)).resolves.toMatchObject({
      candidateId: resolutions[0].candidateId,
    });
    await expect(readMaintenanceCanonicalUpdateProposal(memory, proposals[0].id)).resolves.toMatchObject({
      id: proposals[0].id,
      resolutionIds: expect.arrayContaining([resolutions[0].id]),
    });

    const coderContext = buildRoleScopedContextProjection({
      roleId: "coder-agent",
      currentDemandRefs: ["change/current/summary.md"],
      stableMemoryRefs: ["project/stable/compact.md"],
      selectedHistoryRefs: ["hot/1.md", "hot/2.md", "hot/3.md", "hot/4.md"],
    });
    const maintenanceContext = buildRoleScopedContextProjection({
      roleId: "memory-maintenance-agent",
      currentDemandRefs: ["change/current/summary.md"],
      stableMemoryRefs: ["project/stable/compact.md"],
      selectedHistoryRefs: ["hot/1.md", "hot/2.md", "hot/3.md", "hot/4.md"],
    });

    expect(coderContext.includesMaintenanceWindow).toBe(false);
    expect(coderContext.excludedSources).toContain("hot/warm/cold maintenance window");
    expect(coderContext.includedSources).not.toContain("hot/4.md");
    expect(maintenanceContext.includesMaintenanceWindow).toBe(true);
    expect(maintenanceContext.allowedMemoryTier).toBe("maintenance-hot-warm-cold");
    expect(maintenanceContext.includedSources).toContain("hot/4.md");
  });

  it("keeps doc budget checks proposal-only and candidate pipeline evidence-only", async () => {
    await initHarness(project());
    const memory = await resolveProjectMemory(project());
    const original = "word ".repeat(12000);
    await writeFile(memory.agentGuidePath, original, "utf8");

    const report = await checkDocBudgets(memory);
    const tasks = await listAgentTasks(memory);
    const after = await readFile(memory.agentGuidePath, "utf8");

    expect(report.documents.find((doc) => doc.path === "AGENTS.md")).toMatchObject({ status: "hard-exceeded" });
    expect(tasks).toEqual([
      expect.objectContaining({
        conversationId: "maintenance",
        kind: "background",
        roleId: "documentation-agent",
        createdBy: "maintenance-policy",
        summary: expect.stringContaining("Do not edit canonical docs."),
      }),
    ]);
    expect(after).toBe(original);

    const result = await runMaintenanceCandidatePipeline(memory);
    expect(result.status).toBe("skipped");
    expect(await readFile(memory.agentGuidePath, "utf8")).toBe(original);
  });

  it("creates lifecycle resolutions for reviewed maintenance candidates without editing canonical docs", async () => {
    await initHarness(project());
    const memory = await resolveProjectMemory(project());
    const originalGuide = await readFile(memory.agentGuidePath, "utf8");

    for (let index = 1; index <= 5; index += 1) {
      await recordDemandMemoryCloseout(memory, {
        changeId: `resolution-closeout-${index}`,
        title: `Resolution demand ${index}`,
        terminalKind: "archived",
        finalResult: `Resolution demand ${index} completed.`,
        userDecision: "archived",
        evidenceRefs: [`harness/changes/archive/resolution-${index}/summary.md`],
        reusableLessonCandidates: [{ summary: "Keep repeated lessons lifecycle managed.", evidenceRefs: [`lesson-${index}.md`] }],
        docsDriftCandidates: [{ document: "docs/MEMORY.md", summary: "Stale memory guidance should be retired when superseded.", evidenceRefs: [`memory-${index}.md`] }],
      });
    }

    const watermark = await readMaintenanceReviewWatermark(memory);
    const resolutions = await listMaintenanceCandidateResolutions(memory);
    const proposals = await listMaintenanceCanonicalUpdateProposals(memory);
    const reviewMarkdown = await readFile(join(memory.workbenchRoot, "maintenance", "reviews", watermark.lastReviewWindowId!, "maintenance-review.md"), "utf8");
    const proposalMarkdown = await readFile(join(memory.workbenchRoot, "maintenance", "canonical-update-proposals", `${proposals[0].id}.md`), "utf8");
    const proposalLedgerBefore = (await listMaintenanceLedgerEntries(memory)).filter((entry) => entry.eventType === "canonical-update-proposal").length;
    await proposeMaintenanceCanonicalUpdate(memory, resolutions);
    const proposalLedgerAfter = (await listMaintenanceLedgerEntries(memory)).filter((entry) => entry.eventType === "canonical-update-proposal").length;
    const decision = await recordMaintenanceCanonicalUpdateDecision(memory, proposals[0].id);
    const repeatedDecision = await recordMaintenanceCanonicalUpdateDecision(memory, proposals[0].id);
    const patchProposal = await proposeMaintenanceCanonicalPatch(memory, decision.id);
    const repeatedPatchProposal = await proposeMaintenanceCanonicalPatch(memory, decision.id);
    const decisions = await listMaintenanceCanonicalUpdateDecisions(memory);
    const patchProposals = await listMaintenanceCanonicalPatchProposals(memory);
    const decisionMarkdown = await readFile(join(memory.workbenchRoot, "maintenance", "canonical-update-decisions", `${decision.id}.md`), "utf8");
    const patchProposalMarkdown = await readFile(join(memory.workbenchRoot, "maintenance", "canonical-patch-proposals", `${patchProposal.id}.md`), "utf8");
    const decisionLedgerCount = (await listMaintenanceLedgerEntries(memory)).filter((entry) => entry.eventType === "canonical-update-decision").length;
    const patchProposalLedgerCount = (await listMaintenanceLedgerEntries(memory)).filter((entry) => entry.eventType === "canonical-patch-proposal").length;

    expect(resolutions.length).toBeGreaterThan(0);
    expect(proposals.length).toBeGreaterThan(0);
    expect(resolutions.some((item) => item.canonicalUpdateRequired && item.humanGateRequired)).toBe(true);
    expect(resolutions[0]).toMatchObject({
      canonicalUpdateRequired: true,
      humanGateRequired: true,
    });
    expect(proposals[0]).toMatchObject({
      status: "proposed",
      resolutionIds: expect.arrayContaining([resolutions[0].id]),
      humanGateRequired: true,
      canonicalUpdateAuthorized: false,
    });
    expect(reviewMarkdown).toContain("resolution=");
    expect(reviewMarkdown).toContain("humanGateRequired=");
    expect(reviewMarkdown).toContain("Canonical Update Proposals");
    expect(proposalMarkdown).toContain("non-executing maintenance proposal evidence");
    expect(proposalMarkdown).toContain("Canonical update authorized: false");
    expect(proposalLedgerAfter).toBe(proposalLedgerBefore);
    expect(repeatedDecision.id).toBe(decision.id);
    expect(decisions).toHaveLength(1);
    expect(decision).toMatchObject({
      proposalId: proposals[0].id,
      decisionStatus: "accepted-for-follow-up",
      sourceMutationAuthorized: false,
      canonicalUpdateAuthorized: false,
      executionStarted: false,
    });
    expect(decisionMarkdown).toContain("human-gated maintenance decision evidence");
    expect(decisionMarkdown).toContain("Canonical update authorized: false");
    expect(decisionLedgerCount).toBe(1);
    expect(repeatedPatchProposal.id).toBe(patchProposal.id);
    expect(patchProposals).toHaveLength(1);
    expect(patchProposal).toMatchObject({
      proposalId: proposals[0].id,
      decisionId: decision.id,
      status: "patch-proposed",
      sourceMutationAuthorized: false,
      canonicalUpdateAuthorized: false,
      applicationAuthorized: false,
      executionStarted: false,
      humanApplicationGateRequired: true,
      operationCount: expect.any(Number),
    });
    expect(patchProposal.operationCount).toBeGreaterThan(0);
    expect(patchProposalMarkdown).toContain("non-executing canonical patch proposal evidence");
    expect(patchProposalMarkdown).toContain("Application authorized: false");
    expect(patchProposalMarkdown).toContain("This patch proposal does not modify stable memory");
    expect(patchProposalLedgerCount).toBe(1);
    await expect(readMaintenanceCanonicalPatchProposal(memory, patchProposal.id)).resolves.toMatchObject({
      id: patchProposal.id,
      proposalId: proposals[0].id,
      decisionId: decision.id,
    });
    await expect(proposeMaintenanceCanonicalPatch(memory, "missing-decision")).rejects.toThrow("Maintenance canonical update decision not found");
    expect(await readFile(memory.agentGuidePath, "utf8")).toBe(originalGuide);
  });

  it("does not create maintenance candidates from canonical update proposal, decision, or patch ledger entries", async () => {
    await initHarness(project());
    const memory = await resolveProjectMemory(project());

    await recordMaintenanceLedgerEntry(memory, {
      eventType: "canonical-update-proposal",
      summary: "Proposal evidence should not feed the maintenance candidate pipeline.",
      artifactRefs: ["workbench/maintenance/canonical-update-proposals/proposal.json"],
    });
    await recordMaintenanceLedgerEntry(memory, {
      eventType: "canonical-update-decision",
      summary: "Decision evidence should not feed the maintenance candidate pipeline.",
      artifactRefs: ["workbench/maintenance/canonical-update-decisions/decision.json"],
    });
    await recordMaintenanceLedgerEntry(memory, {
      eventType: "canonical-patch-proposal",
      summary: "Patch proposal evidence should not feed the maintenance candidate pipeline.",
      artifactRefs: ["workbench/maintenance/canonical-patch-proposals/patch.json"],
    });

    await expect(runMaintenanceCandidatePipeline(memory)).resolves.toMatchObject({ status: "skipped" });
  });

  it("maps maintenance candidate lifecycle outcomes deterministically", async () => {
    await initHarness(project());
    const memory = await resolveProjectMemory(project());

    const cases: Array<{
      id: string;
      subtype: EvolutionCandidate["subtype"];
      summary: string;
      recommendation: CandidateReview["recommendation"];
      expected: string;
    }> = [
      { id: "reject", subtype: "stable-memory", summary: "Weak one-off lesson.", recommendation: "reject", expected: "noop" },
      { id: "defer", subtype: "reusable-lesson", summary: "Needs more evidence.", recommendation: "defer", expected: "archive-only" },
      { id: "human-docs", subtype: "docs-drift", summary: "Docs overlap needs consolidation.", recommendation: "needs-human-review", expected: "merge" },
      { id: "human-memory", subtype: "stable-memory", summary: "Repeated stable lesson.", recommendation: "needs-human-review", expected: "promote" },
      { id: "accept-stale-docs", subtype: "docs-drift", summary: "Stale baseline language is superseded.", recommendation: "accept", expected: "retire" },
    ];

    for (const item of cases) {
      const candidate: EvolutionCandidate = {
        version: "1.0",
        id: `candidate-${item.id}`,
        sourceLedgerEntryIds: [`ledger-${item.id}`],
        subtype: item.subtype,
        title: `Candidate ${item.id}`,
        summary: item.summary,
        artifactRefs: [`artifact-${item.id}.md`],
        status: "candidate",
        createdAt: "2026-06-18T00:00:00.000Z",
      };
      const score: CandidateScore = {
        version: "1.0",
        candidateId: candidate.id,
        score: 75,
        rationale: "test score",
        risks: [],
        confidence: "medium",
        createdAt: "2026-06-18T00:00:00.000Z",
      };
      const review: CandidateReview = {
        version: "1.0",
        candidateId: candidate.id,
        recommendation: item.recommendation,
        summary: "test review",
        evidenceRefs: candidate.artifactRefs,
        createdAt: "2026-06-18T00:00:00.000Z",
      };

      await expect(resolveMaintenanceCandidate(memory, candidate, score, review)).resolves.toMatchObject({
        candidateId: candidate.id,
        outcome: item.expected,
      });
    }
  });

  function project(): ManagedProject {
    return {
      id: "agent-task-test",
      name: "AgentTask Test",
      path: tempDir,
      addedAt: "2026-06-09T00:00:00.000Z",
      lastSeenAt: "2026-06-09T00:00:00.000Z",
    };
  }
});

async function listSourceFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  async function walk(dir: string): Promise<void> {
    if (!existsSync(dir)) return;
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
        files.push(full);
      }
    }
  }
  await walk(root);
  return files;
}

function readFileSyncUtf8(path: string): string {
  return statSync(path).isFile() ? readFileSync(path, "utf8") : "";
}
