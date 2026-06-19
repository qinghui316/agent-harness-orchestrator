import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { existsSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, afterEach, beforeEach } from "vitest";
import { initHarness } from "../../src/harness/init.js";
import { resolveProjectMemory } from "../../src/memory/resolver.js";
import { buildMaintenanceSummary } from "../../src/workbench/projections/read-model/maintenance-summary.js";
import { candidateSchema, canonicalUpdateProposalSchema, resolutionSchema } from "../../src/agent-task/schemas.js";
import { buildCanonicalPatchTargetDescriptor } from "../../src/agent-task/canonical-patch-targets.js";
import { normalizeDocsDriftCandidates } from "../../src/agent-task/closeout-store.js";
import type { CandidateReview, CandidateScore, EvolutionCandidate, ManagedProject } from "../../src/types/index.js";
import type { MaintenanceCanonicalPatchApplicationGateRecord, MaintenanceCanonicalPatchApplicationManifest, MaintenanceCanonicalPatchProposal, ResolvedMemory } from "../../src/types/index.js";
import {
  applyMaintenanceCanonicalPatchApplicationManifest,
  buildRoleScopedContextProjection,
  checkDocBudgets,
  claimAgentTask,
  completeAgentTask,
  createAgentTask,
  generateMaintenanceCanonicalPatchApplicationManifest,
  generateMaintenanceCanonicalPatchApplicationReport,
  listAgentTasks,
  listMaintenanceCanonicalPatchApplicationManifests,
  listMaintenanceCanonicalPatchApplicationReports,
  listMaintenanceCanonicalPatchApplicationResults,
  listMaintenanceCanonicalPatchApplicationGateRecords,
  listMaintenanceCanonicalPatchProposals,
  listMaintenanceCanonicalUpdateProposals,
  listMaintenanceCanonicalUpdateDecisions,
  maintenanceCanonicalPatchApplicationGateArtifactRef,
  maintenanceCanonicalPatchApplicationManifestArtifactRef,
  maintenanceCanonicalPatchApplicationReportArtifactRef,
  maintenanceCanonicalPatchApplicationResultArtifactRef,
  maintenanceCanonicalPatchProposalArtifactRef,
  maintenanceCanonicalUpdateDecisionArtifactRef,
  maintenanceCanonicalUpdateProposalArtifactRef,
  listMaintenanceCandidateResolutions,
  listDemandMemoryCloseouts,
  listMaintenanceLedgerEntries,
  maybeRunMaintenanceReviewWindow,
  proposeMaintenanceCanonicalPatch,
  proposeMaintenanceCanonicalUpdate,
  readAgentTaskResult,
  readMaintenanceCanonicalPatchApplicationManifest,
  readMaintenanceCanonicalPatchApplicationReport,
  readMaintenanceCanonicalPatchApplicationResult,
  readMaintenanceCanonicalPatchApplicationGate,
  readMaintenanceCanonicalPatchProposal,
  readMaintenanceCanonicalUpdateDecision,
  recordMaintenanceCanonicalPatchApplicationGate,
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
    expect(typeof generateMaintenanceCanonicalPatchApplicationManifest).toBe("function");
    expect(typeof listMaintenanceCanonicalPatchApplicationManifests).toBe("function");
    expect(typeof applyMaintenanceCanonicalPatchApplicationManifest).toBe("function");
    expect(typeof listMaintenanceCanonicalPatchApplicationResults).toBe("function");
    expect(typeof generateMaintenanceCanonicalPatchApplicationReport).toBe("function");
    expect(typeof listMaintenanceCanonicalPatchApplicationReports).toBe("function");

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
    const gateRecord = await recordMaintenanceCanonicalPatchApplicationGate(memory, patchProposal.id);
    const repeatedGateRecord = await recordMaintenanceCanonicalPatchApplicationGate(memory, patchProposal.id);
    const manifest = await generateMaintenanceCanonicalPatchApplicationManifest(memory, gateRecord.id);
    const repeatedManifest = await generateMaintenanceCanonicalPatchApplicationManifest(memory, gateRecord.id);
    const decisions = await listMaintenanceCanonicalUpdateDecisions(memory);
    const patchProposals = await listMaintenanceCanonicalPatchProposals(memory);
    const gateRecords = await listMaintenanceCanonicalPatchApplicationGateRecords(memory);
    const manifests = await listMaintenanceCanonicalPatchApplicationManifests(memory);
    const decisionMarkdown = await readFile(join(memory.workbenchRoot, "maintenance", "canonical-update-decisions", `${decision.id}.md`), "utf8");
    const patchProposalMarkdown = await readFile(join(memory.workbenchRoot, "maintenance", "canonical-patch-proposals", `${patchProposal.id}.md`), "utf8");
    const gateRecordMarkdown = await readFile(join(memory.workbenchRoot, "maintenance", "canonical-patch-application-gates", `${gateRecord.id}.md`), "utf8");
    const manifestMarkdown = await readFile(join(memory.workbenchRoot, "maintenance", "canonical-patch-application-manifests", `${manifest.id}.md`), "utf8");
    const decisionLedgerCount = (await listMaintenanceLedgerEntries(memory)).filter((entry) => entry.eventType === "canonical-update-decision").length;
    const patchProposalLedgerCount = (await listMaintenanceLedgerEntries(memory)).filter((entry) => entry.eventType === "canonical-patch-proposal").length;
    const gateLedgerCount = (await listMaintenanceLedgerEntries(memory)).filter((entry) => entry.eventType === "canonical-patch-application-gate").length;
    const manifestLedgerCount = (await listMaintenanceLedgerEntries(memory)).filter((entry) => entry.eventType === "canonical-patch-application-manifest").length;
    const canonicalLedgerEntries = await listMaintenanceLedgerEntries(memory);
    const proposalLedgerEntry = canonicalLedgerEntries.find((entry) => entry.eventType === "canonical-update-proposal");
    const decisionLedgerEntry = canonicalLedgerEntries.find((entry) => entry.eventType === "canonical-update-decision");
    const patchProposalLedgerEntry = canonicalLedgerEntries.find((entry) => entry.eventType === "canonical-patch-proposal");
    const gateLedgerEntry = canonicalLedgerEntries.find((entry) => entry.eventType === "canonical-patch-application-gate");
    const manifestLedgerEntry = canonicalLedgerEntries.find((entry) => entry.eventType === "canonical-patch-application-manifest");

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
    expect(proposalLedgerEntry?.artifactRefs[0]).toBe(maintenanceCanonicalUpdateProposalArtifactRef(memory, proposals[0].id));
    expect(proposalLedgerEntry?.artifactRefs.slice(0, 2)).toEqual([
      maintenanceCanonicalUpdateProposalArtifactRef(memory, proposals[0].id),
      expect.stringMatching(new RegExp(`maintenance/canonical-update-proposals/${proposals[0].id}\\.md$`)),
    ]);
    expect(proposalLedgerEntry?.artifactRefs.some((ref) => ref.endsWith(`maintenance/canonical-update-proposals/${proposals[0].id}.md`))).toBe(true);
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
    expect(decisionLedgerEntry?.artifactRefs[0]).toBe(maintenanceCanonicalUpdateDecisionArtifactRef(memory, decision.id));
    expect(decisionLedgerEntry?.artifactRefs.slice(0, 2)).toEqual([
      maintenanceCanonicalUpdateDecisionArtifactRef(memory, decision.id),
      expect.stringMatching(new RegExp(`maintenance/canonical-update-decisions/${decision.id}\\.md$`)),
    ]);
    expect(decisionLedgerEntry?.artifactRefs.some((ref) => ref.endsWith(`maintenance/canonical-update-decisions/${decision.id}.md`))).toBe(true);
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
    expect(patchProposalLedgerEntry?.artifactRefs[0]).toBe(maintenanceCanonicalPatchProposalArtifactRef(memory, patchProposal.id));
    expect(patchProposalLedgerEntry?.artifactRefs.slice(0, 2)).toEqual([
      maintenanceCanonicalPatchProposalArtifactRef(memory, patchProposal.id),
      expect.stringMatching(new RegExp(`maintenance/canonical-patch-proposals/${patchProposal.id}\\.md$`)),
    ]);
    expect(patchProposalLedgerEntry?.artifactRefs.some((ref) => ref.endsWith(`maintenance/canonical-patch-proposals/${patchProposal.id}.md`))).toBe(true);
    expect(repeatedGateRecord.id).toBe(gateRecord.id);
    expect(gateRecords).toHaveLength(1);
    expect(gateRecord).toMatchObject({
      patchProposalId: patchProposal.id,
      proposalId: proposals[0].id,
      decisionId: decision.id,
      decisionStatus: "accepted-for-application-follow-up",
      sourceMutationAuthorized: false,
      canonicalUpdateApplied: false,
      canonicalPatchApplied: false,
      executionStarted: false,
      operationCount: patchProposal.operationCount,
    });
    expect(gateRecordMarkdown).toContain("canonical patch application follow-up evidence");
    expect(gateRecordMarkdown).toContain("Canonical update applied: false");
    expect(gateRecordMarkdown).toContain("Canonical patch applied: false");
    expect(gateRecordMarkdown).toContain("This gate record does not modify stable memory");
    expect(gateLedgerCount).toBe(1);
    expect(gateLedgerEntry?.artifactRefs[0]).toBe(maintenanceCanonicalPatchApplicationGateArtifactRef(memory, gateRecord.id));
    expect(gateLedgerEntry?.artifactRefs.slice(0, 2)).toEqual([
      maintenanceCanonicalPatchApplicationGateArtifactRef(memory, gateRecord.id),
      expect.stringMatching(new RegExp(`maintenance/canonical-patch-application-gates/${gateRecord.id}\\.md$`)),
    ]);
    expect(gateLedgerEntry?.artifactRefs.some((ref) => ref.endsWith(`maintenance/canonical-patch-application-gates/${gateRecord.id}.md`))).toBe(true);
    expect(repeatedManifest.id).toBe(manifest.id);
    expect(manifests).toHaveLength(1);
    expect(manifest).toMatchObject({
      patchProposalId: patchProposal.id,
      gateRecordId: gateRecord.id,
      proposalId: proposals[0].id,
      decisionId: decision.id,
      status: "application-manifest",
      applicationStatus: "blocked-needs-concrete-targets",
      sourceMutationAuthorized: false,
      canonicalUpdateApplied: false,
      canonicalPatchApplied: false,
      executionStarted: false,
      operationCount: patchProposal.operationCount,
    });
    expect(manifest.operations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        targetDescriptor: null,
        readiness: "blocked-needs-concrete-target",
        blockedReasons: expect.arrayContaining([expect.stringContaining("deterministic target descriptor")]),
      }),
    ]));
    expect(manifestMarkdown).toContain("non-executing canonical patch application readiness evidence");
    expect(manifestMarkdown).toContain("Application status: blocked-needs-concrete-targets");
    expect(manifestMarkdown).toContain("Canonical patch applied: false");
    expect(manifestLedgerCount).toBe(1);
    expect(manifestLedgerEntry?.artifactRefs[0]).toBe(maintenanceCanonicalPatchApplicationManifestArtifactRef(memory, manifest.id));
    expect(manifestLedgerEntry?.artifactRefs.slice(0, 2)).toEqual([
      maintenanceCanonicalPatchApplicationManifestArtifactRef(memory, manifest.id),
      expect.stringMatching(new RegExp(`maintenance/canonical-patch-application-manifests/${manifest.id}\\.md$`)),
    ]);
    expect(manifestLedgerEntry?.artifactRefs.some((ref) => ref.endsWith(`maintenance/canonical-patch-application-manifests/${manifest.id}.md`))).toBe(true);
    await expect(readMaintenanceCanonicalPatchProposal(memory, patchProposal.id)).resolves.toMatchObject({
      id: patchProposal.id,
      proposalId: proposals[0].id,
      decisionId: decision.id,
    });
    await expect(readMaintenanceCanonicalPatchApplicationGate(memory, gateRecord.id)).resolves.toMatchObject({
      id: gateRecord.id,
      patchProposalId: patchProposal.id,
    });
    await expect(readMaintenanceCanonicalPatchApplicationManifest(memory, manifest.id)).resolves.toMatchObject({
      id: manifest.id,
      patchProposalId: patchProposal.id,
      gateRecordId: gateRecord.id,
    });
    await expect(proposeMaintenanceCanonicalPatch(memory, "missing-decision")).rejects.toThrow("Maintenance canonical update decision not found");
    await expect(recordMaintenanceCanonicalPatchApplicationGate(memory, "missing-patch-proposal")).rejects.toThrow("Maintenance canonical patch proposal not found");
    await expect(generateMaintenanceCanonicalPatchApplicationManifest(memory, "missing-gate")).rejects.toThrow("Maintenance canonical patch application gate not found");
    expect(await readFile(memory.agentGuidePath, "utf8")).toBe(originalGuide);
  });

  it("builds canonical patch target descriptors only from explicit safe patch evidence", async () => {
    await initHarness(project());
    const memory = await resolveProjectMemory(project());
    const memoryDocPath = join(memory.memoryRoot, "docs", "MEMORY.md");
    const originalMemoryDoc = "# Memory\n\nKeep old memory guidance.\n";
    await writeFile(memoryDocPath, originalMemoryDoc, "utf8");

    for (let index = 1; index <= 5; index += 1) {
      await recordDemandMemoryCloseout(memory, {
        changeId: `descriptor-closeout-${index}`,
        title: `Descriptor demand ${index}`,
        terminalKind: "archived",
        finalResult: `Descriptor demand ${index} completed.`,
        userDecision: "archived",
        evidenceRefs: [`harness/changes/archive/descriptor-${index}/summary.md`],
        docsDriftCandidates: [{
          document: "docs/MEMORY.md",
          summary: "Memory guidance needs a concrete canonical patch target descriptor.",
          patch: {
            patchKind: "hunks",
            hunks: [{
              oldText: "Keep old memory guidance.",
              newText: "Keep updated memory guidance.",
            }],
          },
          evidenceRefs: [`memory-descriptor-${index}.md`],
        }],
      });
    }

    const proposal = (await listMaintenanceCanonicalUpdateProposals(memory))[0];
    const decision = await recordMaintenanceCanonicalUpdateDecision(memory, proposal.id);
    const patchProposal = await proposeMaintenanceCanonicalPatch(memory, decision.id);
    const gateRecord = await recordMaintenanceCanonicalPatchApplicationGate(memory, patchProposal.id);
    const manifest = await generateMaintenanceCanonicalPatchApplicationManifest(memory, gateRecord.id);
    const patchProposalMarkdown = await readFile(join(memory.workbenchRoot, "maintenance", "canonical-patch-proposals", `${patchProposal.id}.md`), "utf8");
    const manifestMarkdown = await readFile(join(memory.workbenchRoot, "maintenance", "canonical-patch-application-manifests", `${manifest.id}.md`), "utf8");
    const summary = await buildMaintenanceSummary(memory);
    const expectedHash = createHash("sha256").update(Buffer.from(originalMemoryDoc)).digest("hex");
    const operation = patchProposal.operations.find((item) => item.targetDescriptor?.targetPath === "docs/MEMORY.md");

    expect(operation?.targetDescriptor).toMatchObject({
      targetKind: "canonical-docs",
      targetPath: "docs/MEMORY.md",
      expectedContentHash: expectedHash,
      patchKind: "hunks",
      hunks: [{
        oldText: "Keep old memory guidance.",
        newText: "Keep updated memory guidance.",
      }],
    });
    expect(operation?.targetDescriptor?.expectedContentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(operation?.targetDescriptor?.targetPath).not.toMatch(/^[a-zA-Z]:|^\/|\\/);
    expect(patchProposal).toMatchObject({
      sourceMutationAuthorized: false,
      canonicalUpdateAuthorized: false,
      applicationAuthorized: false,
      executionStarted: false,
    });
    expect(manifest).toMatchObject({
      applicationStatus: "ready-for-application",
      sourceMutationAuthorized: false,
      canonicalUpdateApplied: false,
      canonicalPatchApplied: false,
      executionStarted: false,
    });
    expect(manifest.operations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        patchOperationId: operation?.id,
        readiness: "ready",
        targetDescriptor: expect.objectContaining({
          targetPath: "docs/MEMORY.md",
          expectedContentHash: expectedHash,
        }),
      }),
    ]));
    expect(patchProposalMarkdown).toContain(`targetDescriptor: hunks docs/MEMORY.md sha256=${expectedHash}`);
    expect(manifestMarkdown).toContain("Application status: ready-for-application");
    expect(manifestMarkdown).toContain(`targetDescriptor: hunks docs/MEMORY.md sha256=${expectedHash}`);
    expect(summary.latestPatchProposal).toMatchObject({
      applicationAuthorized: false,
      canonicalUpdateAuthorized: false,
    });
    expect(summary.latestApplicationManifest).toMatchObject({
      applicationStatus: "ready-for-application",
      canonicalPatchApplied: false,
    });
    expect(summary.latestApplicationManifest).not.toHaveProperty("nextAllowedAction");
    expect(await readFile(memoryDocPath, "utf8")).toBe(originalMemoryDoc);
  });

  it("applies ready canonical patch application manifests through a separate result artifact", async () => {
    await initHarness(project());
    const memory = await resolveProjectMemory(project());
    const memoryDocPath = join(memory.memoryRoot, "docs", "MEMORY.md");
    const originalMemoryDoc = "# Memory\n\nKeep old memory guidance.\n";
    const updatedMemoryDoc = "# Memory\n\nKeep updated memory guidance.\n";
    await writeFile(memoryDocPath, originalMemoryDoc, "utf8");

    for (let index = 1; index <= 5; index += 1) {
      await recordDemandMemoryCloseout(memory, {
        changeId: `apply-descriptor-${index}`,
        title: `Apply descriptor demand ${index}`,
        terminalKind: "archived",
        finalResult: `Apply descriptor demand ${index} completed.`,
        userDecision: "archived",
        evidenceRefs: [`harness/changes/archive/apply-descriptor-${index}/summary.md`],
        docsDriftCandidates: [{
          document: "docs/MEMORY.md",
          summary: "Memory guidance needs a deterministic application result.",
          patch: {
            patchKind: "hunks",
            hunks: [{
              oldText: "Keep old memory guidance.",
              newText: "Keep updated memory guidance.",
            }],
          },
          evidenceRefs: [`memory-apply-${index}.md`],
        }],
      });
    }

    const proposal = (await listMaintenanceCanonicalUpdateProposals(memory))[0];
    const decision = await recordMaintenanceCanonicalUpdateDecision(memory, proposal.id);
    const patchProposal = await proposeMaintenanceCanonicalPatch(memory, decision.id);
    const gateRecord = await recordMaintenanceCanonicalPatchApplicationGate(memory, patchProposal.id);
    const manifest = await generateMaintenanceCanonicalPatchApplicationManifest(memory, gateRecord.id);
    const result = await applyMaintenanceCanonicalPatchApplicationManifest(memory, manifest.id, {
      policyAuditRefs: ["workbench/maintenance/policy-audit.json"],
      confirmedBy: "workbench-human-gate",
    });
    const repeatedResult = await applyMaintenanceCanonicalPatchApplicationManifest(memory, manifest.id, {
      policyAuditRefs: ["workbench/maintenance/policy-audit.json"],
      confirmedBy: "workbench-human-gate",
    });
    const results = await listMaintenanceCanonicalPatchApplicationResults(memory);
    const resultMarkdown = await readFile(join(memory.workbenchRoot, "maintenance", "canonical-patch-application-results", `${result.id}.md`), "utf8");
    const summary = await buildMaintenanceSummary(memory);
    const resultLedgerEntries = (await listMaintenanceLedgerEntries(memory)).filter((entry) => entry.eventType === "canonical-patch-application-result");
    const resultLedgerEntry = resultLedgerEntries[0];
    const originalHash = createHash("sha256").update(Buffer.from(originalMemoryDoc)).digest("hex");
    const updatedHash = createHash("sha256").update(Buffer.from(updatedMemoryDoc)).digest("hex");

    expect(await readFile(memoryDocPath, "utf8")).toBe(updatedMemoryDoc);
    expect(result).toMatchObject({
      status: "applied",
      manifestId: manifest.id,
      patchProposalId: patchProposal.id,
      gateRecordId: gateRecord.id,
      applicationAuthorized: true,
      sourceMutationAuthorized: true,
      canonicalUpdateApplied: true,
      canonicalPatchApplied: true,
      executionStarted: true,
      policyAuditRefs: ["workbench/maintenance/policy-audit.json"],
      appliedOperations: [expect.objectContaining({
        targetKind: "canonical-docs",
        targetPath: "docs/MEMORY.md",
        patchKind: "hunks",
        beforeHash: originalHash,
        afterHash: updatedHash,
        status: "applied",
      })],
    });
    expect(repeatedResult.id).toBe(result.id);
    expect(results).toEqual([expect.objectContaining({ id: result.id, manifestId: manifest.id })]);
    await expect(readMaintenanceCanonicalPatchApplicationResult(memory, result.id)).resolves.toMatchObject({
      id: result.id,
      manifestId: manifest.id,
    });
    expect(resultMarkdown).toContain("Classification: human-gated canonical patch application result evidence.");
    expect(resultMarkdown).toContain(`beforeHash: ${originalHash}`);
    expect(resultMarkdown).toContain(`afterHash: ${updatedHash}`);
    expect(resultLedgerEntries).toHaveLength(1);
    expect(resultLedgerEntry?.artifactRefs[0]).toBe(maintenanceCanonicalPatchApplicationResultArtifactRef(memory, result.id));
    expect(resultLedgerEntry?.artifactRefs.slice(0, 2)).toEqual([
      maintenanceCanonicalPatchApplicationResultArtifactRef(memory, result.id),
      expect.stringMatching(new RegExp(`maintenance/canonical-patch-application-results/${result.id}\\.md$`)),
    ]);
    expect(resultLedgerEntry?.artifactRefs.some((ref) => ref.endsWith(`maintenance/canonical-patch-application-results/${result.id}.md`))).toBe(true);
    expect(summary).toMatchObject({
      applicationResultCount: 1,
      latestApplicationResult: expect.objectContaining({
        id: result.id,
        canonicalPatchApplied: true,
      }),
    });
  });

  it("generates read-only canonical patch application observation reports without feeding new candidates", async () => {
    await initHarness(project());
    const memory = await resolveProjectMemory(project());
    const memoryDocPath = join(memory.memoryRoot, "docs", "MEMORY.md");
    const originalMemoryDoc = "# Memory\n\nKeep old observation guidance.\n";
    const updatedMemoryDoc = "# Memory\n\nKeep updated observation guidance.\n";
    await writeFile(memoryDocPath, originalMemoryDoc, "utf8");

    for (let index = 1; index <= 5; index += 1) {
      await recordDemandMemoryCloseout(memory, {
        changeId: `observation-report-${index}`,
        title: `Observation report demand ${index}`,
        terminalKind: "archived",
        finalResult: `Observation report demand ${index} completed.`,
        userDecision: "archived",
        evidenceRefs: [`harness/changes/archive/observation-report-${index}/summary.md`],
        docsDriftCandidates: [{
          document: "docs/MEMORY.md",
          summary: "Memory guidance needs an observation report after application.",
          patch: {
            patchKind: "hunks",
            hunks: [{
              oldText: "Keep old observation guidance.",
              newText: "Keep updated observation guidance.",
            }],
          },
          evidenceRefs: [`observation-report-${index}.md`],
        }],
      });
    }

    const proposal = (await listMaintenanceCanonicalUpdateProposals(memory))[0];
    const decision = await recordMaintenanceCanonicalUpdateDecision(memory, proposal.id);
    const patchProposal = await proposeMaintenanceCanonicalPatch(memory, decision.id);
    const gateRecord = await recordMaintenanceCanonicalPatchApplicationGate(memory, patchProposal.id);
    const manifest = await generateMaintenanceCanonicalPatchApplicationManifest(memory, gateRecord.id);
    const result = await applyMaintenanceCanonicalPatchApplicationManifest(memory, manifest.id, {
      policyAuditRefs: ["workbench/maintenance/policy-audit.json"],
      confirmedBy: "workbench-human-gate",
    });
    const contentAfterApplication = await readFile(memoryDocPath, "utf8");

    const manifestPath = join(memory.workbenchRoot, "maintenance", "canonical-patch-application-manifests", `${manifest.id}.json`);
    await writeFile(manifestPath, `${JSON.stringify({ ...manifest, operationCount: 0 }, null, 2)}\n`, "utf8");
    await expect(generateMaintenanceCanonicalPatchApplicationReport(memory, result.id)).rejects.toThrow("operation count mismatch");
    await writeFile(
      manifestPath,
      `${JSON.stringify({
        ...manifest,
        operations: manifest.operations.map((operation, index) => index === 0
          ? { ...operation, operation: operation.operation === "noop" ? "merge" : "noop" }
          : operation),
      }, null, 2)}\n`,
      "utf8",
    );
    await expect(generateMaintenanceCanonicalPatchApplicationReport(memory, result.id)).rejects.toThrow("operation lineage mismatch");
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    const report = await generateMaintenanceCanonicalPatchApplicationReport(memory, result.id);
    const repeatedReport = await generateMaintenanceCanonicalPatchApplicationReport(memory, result.id);
    const reports = await listMaintenanceCanonicalPatchApplicationReports(memory);
    const reportMarkdown = await readFile(join(memory.workbenchRoot, "maintenance", "canonical-patch-application-reports", `${report.id}.md`), "utf8");
    const ledgerEntries = await listMaintenanceLedgerEntries(memory);
    const reportLedgerEntries = ledgerEntries.filter((entry) => entry.eventType === "canonical-patch-application-report");
    const reportLedgerEntry = reportLedgerEntries[0];
    const pipelineResult = await runMaintenanceCandidatePipeline(memory);

    expect(contentAfterApplication).toBe(updatedMemoryDoc);
    expect(await readFile(memoryDocPath, "utf8")).toBe(contentAfterApplication);
    expect(report).toMatchObject({
      status: "observed",
      resultId: result.id,
      manifestId: manifest.id,
      patchProposalId: patchProposal.id,
      gateRecordId: gateRecord.id,
      applicationAuthorized: true,
      sourceMutationAuthorized: false,
      canonicalUpdateApplied: false,
      canonicalPatchApplied: false,
      executionStarted: false,
      policyAuditRefs: ["workbench/maintenance/policy-audit.json"],
      observedOperations: [expect.objectContaining({
        targetPath: "docs/MEMORY.md",
        status: "observed",
      })],
    });
    expect(repeatedReport.id).toBe(report.id);
    expect(reports).toEqual([expect.objectContaining({ id: report.id, resultId: result.id })]);
    await expect(readMaintenanceCanonicalPatchApplicationReport(memory, report.id)).resolves.toMatchObject({
      id: report.id,
      resultId: result.id,
    });
    expect(reportMarkdown).toContain("Classification: read-only canonical patch application observation report evidence.");
    expect(reportMarkdown).toContain("Canonical patch applied by this report: false.");
    expect(reportLedgerEntry).toBeTruthy();
    expect(reportLedgerEntries).toHaveLength(1);
    expect(reportLedgerEntry?.artifactRefs[0]).toBe(maintenanceCanonicalPatchApplicationReportArtifactRef(memory, report.id));
    expect(reportLedgerEntry?.artifactRefs.slice(0, 2)).toEqual([
      maintenanceCanonicalPatchApplicationReportArtifactRef(memory, report.id),
      expect.stringMatching(new RegExp(`maintenance/canonical-patch-application-reports/${report.id}\\.md$`)),
    ]);
    expect(reportLedgerEntry?.artifactRefs.some((ref) => ref.endsWith(`maintenance/canonical-patch-application-reports/${report.id}.md`))).toBe(true);
    expect(pipelineResult.candidate?.sourceLedgerEntryIds).not.toContain(reportLedgerEntry?.id);
    expect(pipelineResult.candidate?.summary ?? "").not.toContain("canonical-patch-application-report");
  });

  it("keeps maintenance canonical artifact IO tolerant and sorted through the shared store", async () => {
    await initHarness(project());
    const memory = await resolveProjectMemory(project());
    const memoryDocPath = join(memory.memoryRoot, "docs", "MEMORY.md");
    await writeFile(memoryDocPath, "# Memory\n\nKeep old shared store guidance.\n", "utf8");

    for (let index = 1; index <= 5; index += 1) {
      await recordDemandMemoryCloseout(memory, {
        changeId: `shared-store-${index}`,
        title: `Shared store demand ${index}`,
        terminalKind: "archived",
        finalResult: `Shared store demand ${index} completed.`,
        userDecision: "archived",
        docsDriftCandidates: [{
          document: "docs/MEMORY.md",
          summary: "Memory guidance needs shared artifact store coverage.",
          patch: {
            patchKind: "hunks",
            hunks: [{
              oldText: "Keep old shared store guidance.",
              newText: "Keep updated shared store guidance.",
            }],
          },
          evidenceRefs: [`shared-store-${index}.md`],
        }],
      });
    }

    const proposal = (await listMaintenanceCanonicalUpdateProposals(memory))[0];
    const decision = await recordMaintenanceCanonicalUpdateDecision(memory, proposal.id);
    const patchProposal = await proposeMaintenanceCanonicalPatch(memory, decision.id);
    const gateRecord = await recordMaintenanceCanonicalPatchApplicationGate(memory, patchProposal.id);
    const manifest = await generateMaintenanceCanonicalPatchApplicationManifest(memory, gateRecord.id);
    const result = await applyMaintenanceCanonicalPatchApplicationManifest(memory, manifest.id, {
      policyAuditRefs: ["workbench/maintenance/policy-audit.json"],
      confirmedBy: "workbench-human-gate",
    });
    const report = await generateMaintenanceCanonicalPatchApplicationReport(memory, result.id);

    const proposalRoot = join(memory.workbenchRoot, "maintenance", "canonical-update-proposals");
    const decisionRoot = join(memory.workbenchRoot, "maintenance", "canonical-update-decisions");
    const patchProposalRoot = join(memory.workbenchRoot, "maintenance", "canonical-patch-proposals");
    const gateRoot = join(memory.workbenchRoot, "maintenance", "canonical-patch-application-gates");
    const proposalPath = join(proposalRoot, `${proposal.id}.json`);
    const decisionPath = join(decisionRoot, `${decision.id}.json`);
    const patchProposalPath = join(patchProposalRoot, `${patchProposal.id}.json`);
    const gatePath = join(gateRoot, `${gateRecord.id}.json`);
    const manifestPath = join(memory.workbenchRoot, "maintenance", "canonical-patch-application-manifests", `${manifest.id}.json`);
    const resultPath = join(memory.workbenchRoot, "maintenance", "canonical-patch-application-results", `${result.id}.json`);
    const reportRoot = join(memory.workbenchRoot, "maintenance", "canonical-patch-application-reports");
    const reportPath = join(reportRoot, `${report.id}.json`);

    await expect(readMaintenanceCanonicalUpdateProposal(memory, "missing-proposal")).resolves.toBeNull();
    await expect(readMaintenanceCanonicalUpdateDecision(memory, "missing-decision")).resolves.toBeNull();
    await expect(readMaintenanceCanonicalPatchProposal(memory, "missing-patch-proposal")).resolves.toBeNull();
    await expect(readMaintenanceCanonicalPatchApplicationGate(memory, "missing-gate")).resolves.toBeNull();
    await expect(readMaintenanceCanonicalPatchApplicationManifest(memory, "missing-manifest")).resolves.toBeNull();
    await expect(readMaintenanceCanonicalPatchApplicationResult(memory, "missing-result")).resolves.toBeNull();
    await expect(readMaintenanceCanonicalPatchApplicationReport(memory, "missing-report")).resolves.toBeNull();

    await writeFile(proposalPath, "{ invalid json", "utf8");
    await expect(readMaintenanceCanonicalUpdateProposal(memory, proposal.id)).resolves.toBeNull();
    await writeFile(proposalPath, `${JSON.stringify({ id: "schema-invalid" }, null, 2)}\n`, "utf8");
    await expect(readMaintenanceCanonicalUpdateProposal(memory, proposal.id)).resolves.toBeNull();
    await writeFile(proposalPath, `${JSON.stringify(proposal, null, 2)}\n`, "utf8");

    await writeFile(decisionPath, "{ invalid json", "utf8");
    await expect(readMaintenanceCanonicalUpdateDecision(memory, decision.id)).resolves.toBeNull();
    await writeFile(decisionPath, `${JSON.stringify({ id: "schema-invalid" }, null, 2)}\n`, "utf8");
    await expect(readMaintenanceCanonicalUpdateDecision(memory, decision.id)).resolves.toBeNull();
    await writeFile(decisionPath, `${JSON.stringify(decision, null, 2)}\n`, "utf8");

    await writeFile(patchProposalPath, "{ invalid json", "utf8");
    await expect(readMaintenanceCanonicalPatchProposal(memory, patchProposal.id)).resolves.toBeNull();
    await writeFile(patchProposalPath, `${JSON.stringify({ id: "schema-invalid" }, null, 2)}\n`, "utf8");
    await expect(readMaintenanceCanonicalPatchProposal(memory, patchProposal.id)).resolves.toBeNull();
    await writeFile(patchProposalPath, `${JSON.stringify(patchProposal, null, 2)}\n`, "utf8");

    await writeFile(gatePath, "{ invalid json", "utf8");
    await expect(readMaintenanceCanonicalPatchApplicationGate(memory, gateRecord.id)).resolves.toBeNull();
    await writeFile(gatePath, `${JSON.stringify({ id: "schema-invalid" }, null, 2)}\n`, "utf8");
    await expect(readMaintenanceCanonicalPatchApplicationGate(memory, gateRecord.id)).resolves.toBeNull();
    await writeFile(gatePath, `${JSON.stringify(gateRecord, null, 2)}\n`, "utf8");

    await writeFile(manifestPath, "{ invalid json", "utf8");
    await expect(readMaintenanceCanonicalPatchApplicationManifest(memory, manifest.id)).resolves.toBeNull();
    await writeFile(manifestPath, `${JSON.stringify({ id: "schema-invalid" }, null, 2)}\n`, "utf8");
    await expect(readMaintenanceCanonicalPatchApplicationManifest(memory, manifest.id)).resolves.toBeNull();
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    await writeFile(resultPath, "{ invalid json", "utf8");
    await expect(readMaintenanceCanonicalPatchApplicationResult(memory, result.id)).resolves.toBeNull();
    await writeFile(resultPath, `${JSON.stringify({ id: "schema-invalid" }, null, 2)}\n`, "utf8");
    await expect(readMaintenanceCanonicalPatchApplicationResult(memory, result.id)).resolves.toBeNull();
    await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

    await writeFile(reportPath, "{ invalid json", "utf8");
    await expect(readMaintenanceCanonicalPatchApplicationReport(memory, report.id)).resolves.toBeNull();
    await writeFile(reportPath, `${JSON.stringify({ id: "schema-invalid" }, null, 2)}\n`, "utf8");
    await expect(readMaintenanceCanonicalPatchApplicationReport(memory, report.id)).resolves.toBeNull();
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

    const olderReport = {
      ...report,
      id: "canonical-patch-application-report-older",
      createdAt: "2026-06-18T00:00:00.000Z",
    };
    const olderProposal = {
      ...proposal,
      id: "canonical-update-proposal-older",
      createdAt: "2026-06-18T00:00:00.000Z",
    };
    const olderDecision = {
      ...decision,
      id: "canonical-update-decision-older",
      createdAt: "2026-06-18T00:00:00.000Z",
    };
    const olderPatchProposal = {
      ...patchProposal,
      id: "canonical-patch-proposal-older",
      createdAt: "2026-06-18T00:00:00.000Z",
    };
    const olderGateRecord = {
      ...gateRecord,
      id: "canonical-patch-application-gate-older",
      createdAt: "2026-06-18T00:00:00.000Z",
    };
    await writeFile(join(proposalRoot, `${olderProposal.id}.json`), `${JSON.stringify(olderProposal, null, 2)}\n`, "utf8");
    await writeFile(join(proposalRoot, "invalid-json.json"), "{ invalid json", "utf8");
    await writeFile(join(proposalRoot, "schema-invalid.json"), `${JSON.stringify({ id: "schema-invalid" }, null, 2)}\n`, "utf8");
    await writeFile(join(decisionRoot, `${olderDecision.id}.json`), `${JSON.stringify(olderDecision, null, 2)}\n`, "utf8");
    await writeFile(join(decisionRoot, "invalid-json.json"), "{ invalid json", "utf8");
    await writeFile(join(decisionRoot, "schema-invalid.json"), `${JSON.stringify({ id: "schema-invalid" }, null, 2)}\n`, "utf8");
    await writeFile(join(patchProposalRoot, `${olderPatchProposal.id}.json`), `${JSON.stringify(olderPatchProposal, null, 2)}\n`, "utf8");
    await writeFile(join(patchProposalRoot, "invalid-json.json"), "{ invalid json", "utf8");
    await writeFile(join(patchProposalRoot, "schema-invalid.json"), `${JSON.stringify({ id: "schema-invalid" }, null, 2)}\n`, "utf8");
    await writeFile(join(gateRoot, `${olderGateRecord.id}.json`), `${JSON.stringify(olderGateRecord, null, 2)}\n`, "utf8");
    await writeFile(join(gateRoot, "invalid-json.json"), "{ invalid json", "utf8");
    await writeFile(join(gateRoot, "schema-invalid.json"), `${JSON.stringify({ id: "schema-invalid" }, null, 2)}\n`, "utf8");
    await writeFile(join(reportRoot, `${olderReport.id}.json`), `${JSON.stringify(olderReport, null, 2)}\n`, "utf8");
    await writeFile(join(reportRoot, "invalid-json.json"), "{ invalid json", "utf8");
    await writeFile(join(reportRoot, "schema-invalid.json"), `${JSON.stringify({ id: "schema-invalid" }, null, 2)}\n`, "utf8");

    const proposals = await listMaintenanceCanonicalUpdateProposals(memory);
    const decisions = await listMaintenanceCanonicalUpdateDecisions(memory);
    const patchProposals = await listMaintenanceCanonicalPatchProposals(memory);
    const gateRecords = await listMaintenanceCanonicalPatchApplicationGateRecords(memory);
    const reports = await listMaintenanceCanonicalPatchApplicationReports(memory);
    expect(proposals.map((item) => item.id)).toEqual([olderProposal.id, proposal.id]);
    expect(decisions.map((item) => item.id)).toEqual([olderDecision.id, decision.id]);
    expect(patchProposals.map((item) => item.id)).toEqual([olderPatchProposal.id, patchProposal.id]);
    expect(gateRecords.map((item) => item.id)).toEqual([olderGateRecord.id, gateRecord.id]);
    expect(reports.map((item) => item.id)).toEqual([olderReport.id, report.id]);
    const summary = await buildMaintenanceSummary(memory);
    expect(summary.latestProposal?.id).toBe(proposal.id);
    expect(summary.latestPatchProposal?.id).toBe(patchProposal.id);
    expect(summary.latestApplicationManifest?.id).toBe(manifest.id);
    expect(summary.latestApplicationResult?.id).toBe(result.id);
    expect(summary.latestApplicationReport).toEqual({
      id: report.id,
      status: report.status,
      resultId: result.id,
      manifestId: manifest.id,
      patchProposalId: patchProposal.id,
      gateRecordId: gateRecord.id,
      targetKinds: report.targetKinds,
      operationCount: report.operationCount,
      canonicalPatchApplied: false,
      summary: report.summary,
      createdAt: report.createdAt,
    });
    expect(summary.latestApplicationReport).not.toHaveProperty("applicationAuthorized");
  });

  it("fails closed for stale or ambiguous canonical patch application manifests", async () => {
    await initHarness(project());
    const memory = await resolveProjectMemory(project());
    const memoryDocPath = join(memory.memoryRoot, "docs", "MEMORY.md");
    const originalMemoryDoc = "# Memory\n\nKeep old memory guidance.\nKeep old memory guidance.\n";
    await writeFile(memoryDocPath, originalMemoryDoc, "utf8");

    for (let index = 1; index <= 5; index += 1) {
      await recordDemandMemoryCloseout(memory, {
        changeId: `ambiguous-apply-${index}`,
        title: `Ambiguous apply demand ${index}`,
        terminalKind: "archived",
        finalResult: `Ambiguous apply demand ${index} completed.`,
        userDecision: "archived",
        docsDriftCandidates: [{
          document: "docs/MEMORY.md",
          summary: "Ambiguous hunk must not apply.",
          patch: {
            patchKind: "hunks",
            hunks: [{
              oldText: "Keep old memory guidance.",
              newText: "Keep updated memory guidance.",
            }],
          },
          evidenceRefs: [`ambiguous-apply-${index}.md`],
        }],
      });
    }

    const proposal = (await listMaintenanceCanonicalUpdateProposals(memory))[0];
    const decision = await recordMaintenanceCanonicalUpdateDecision(memory, proposal.id);
    const patchProposal = await proposeMaintenanceCanonicalPatch(memory, decision.id);
    const gateRecord = await recordMaintenanceCanonicalPatchApplicationGate(memory, patchProposal.id);
    const manifest = await generateMaintenanceCanonicalPatchApplicationManifest(memory, gateRecord.id);

    await expect(applyMaintenanceCanonicalPatchApplicationManifest(memory, manifest.id, {
      policyAuditRefs: ["workbench/maintenance/policy-audit.json"],
      confirmedBy: "workbench-human-gate",
    })).rejects.toThrow("ambiguously");
    expect(await readFile(memoryDocPath, "utf8")).toBe(originalMemoryDoc);
    expect(await listMaintenanceCanonicalPatchApplicationResults(memory)).toEqual([]);

    await writeFile(memoryDocPath, "# Memory\n\nKeep externally changed memory guidance.\n", "utf8");
    await expect(applyMaintenanceCanonicalPatchApplicationManifest(memory, manifest.id, {
      policyAuditRefs: ["workbench/maintenance/policy-audit.json"],
      confirmedBy: "workbench-human-gate",
    })).rejects.toThrow("stale");
    expect(await listMaintenanceCanonicalPatchApplicationResults(memory)).toEqual([]);
  });

  it("requires human-gate and ToolPolicy evidence before canonical patch application writes", async () => {
    await initHarness(project());
    const memory = await resolveProjectMemory(project());
    const memoryDocPath = join(memory.memoryRoot, "docs", "MEMORY.md");
    const originalMemoryDoc = "# Memory\n\nKeep old authorization guidance.\n";
    await writeFile(memoryDocPath, originalMemoryDoc, "utf8");

    for (let index = 1; index <= 5; index += 1) {
      await recordDemandMemoryCloseout(memory, {
        changeId: `auth-apply-${index}`,
        title: `Auth apply demand ${index}`,
        terminalKind: "archived",
        finalResult: `Auth apply demand ${index} completed.`,
        userDecision: "archived",
        docsDriftCandidates: [{
          document: "docs/MEMORY.md",
          summary: "Authorization must be required.",
          patch: {
            patchKind: "hunks",
            hunks: [{
              oldText: "Keep old authorization guidance.",
              newText: "Keep updated authorization guidance.",
            }],
          },
          evidenceRefs: [`auth-apply-${index}.md`],
        }],
      });
    }

    const proposal = (await listMaintenanceCanonicalUpdateProposals(memory))[0];
    const decision = await recordMaintenanceCanonicalUpdateDecision(memory, proposal.id);
    const patchProposal = await proposeMaintenanceCanonicalPatch(memory, decision.id);
    const gateRecord = await recordMaintenanceCanonicalPatchApplicationGate(memory, patchProposal.id);
    const manifest = await generateMaintenanceCanonicalPatchApplicationManifest(memory, gateRecord.id);

    await expect(applyMaintenanceCanonicalPatchApplicationManifest(memory, manifest.id, {
      policyAuditRefs: [],
      confirmedBy: "workbench-human-gate",
    })).rejects.toThrow("ToolPolicyGate audit evidence");
    await expect(applyMaintenanceCanonicalPatchApplicationManifest(memory, manifest.id, {
      policyAuditRefs: ["workbench/maintenance/policy-audit.json"],
      confirmedBy: "manual" as "workbench-human-gate",
    })).rejects.toThrow("Workbench human-gate confirmation");
    expect(await readFile(memoryDocPath, "utf8")).toBe(originalMemoryDoc);
    expect(await listMaintenanceCanonicalPatchApplicationResults(memory)).toEqual([]);
  });

  it("rejects forged canonical patch application targets outside target-kind path boundaries", async () => {
    await initHarness(project());
    const memory = await resolveProjectMemory(project());
    const sourcePath = join(memory.memoryRoot, "src", "forged-target.ts");
    const originalSource = "export const value = 'old';\n";
    await mkdir(join(memory.memoryRoot, "src"), { recursive: true });
    await writeFile(sourcePath, originalSource, "utf8");

    const forgedManifest = await writeForgedReadyApplicationChain(memory, {
      manifestId: "forged-src-target-manifest",
      targetPath: "src/forged-target.ts",
      expectedContentHash: createHash("sha256").update(Buffer.from(originalSource)).digest("hex"),
      oldText: "old",
      newText: "new",
    });

    await expect(applyMaintenanceCanonicalPatchApplicationManifest(memory, forgedManifest.id, {
      policyAuditRefs: ["workbench/maintenance/policy-audit.json"],
      confirmedBy: "workbench-human-gate",
    })).rejects.toThrow("outside docs/*.md boundary");
    expect(await readFile(sourcePath, "utf8")).toBe(originalSource);
    expect(await listMaintenanceCanonicalPatchApplicationResults(memory)).toEqual([]);
  });

  it("rejects schema-valid empty hunks without hanging canonical patch application", async () => {
    await initHarness(project());
    const memory = await resolveProjectMemory(project());
    const memoryDocPath = join(memory.memoryRoot, "docs", "MEMORY.md");
    const originalMemoryDoc = "# Memory\n\nKeep empty hunk guidance.\n";
    await writeFile(memoryDocPath, originalMemoryDoc, "utf8");

    const forgedManifest = await writeForgedReadyApplicationChain(memory, {
      manifestId: "forged-empty-hunk-manifest",
      targetPath: "docs/MEMORY.md",
      expectedContentHash: createHash("sha256").update(Buffer.from(originalMemoryDoc)).digest("hex"),
      oldText: "",
      newText: "Keep updated empty hunk guidance.",
    });

    await expect(applyMaintenanceCanonicalPatchApplicationManifest(memory, forgedManifest.id, {
      policyAuditRefs: ["workbench/maintenance/policy-audit.json"],
      confirmedBy: "workbench-human-gate",
    })).rejects.toThrow("missing concrete text");
    expect(await readFile(memoryDocPath, "utf8")).toBe(originalMemoryDoc);
    expect(await listMaintenanceCanonicalPatchApplicationResults(memory)).toEqual([]);
  });

  it("keeps concrete docs-drift patch drafts distinct from older no-payload drift fingerprints", () => {
    const [oldNoPayload] = normalizeDocsDriftCandidates("fingerprint-change", [{
      document: "docs/MEMORY.md",
      summary: "Memory guidance needs a concrete canonical patch target descriptor.",
      evidenceRefs: ["old.md"],
    }], []);
    const [withPayload] = normalizeDocsDriftCandidates("fingerprint-change", [{
      document: "docs/MEMORY.md",
      summary: "Memory guidance needs a concrete canonical patch target descriptor.",
      patch: {
        patchKind: "hunks",
        hunks: [{
          oldText: "Keep old memory guidance.",
          newText: "Keep updated memory guidance.",
        }],
      },
      evidenceRefs: ["new.md"],
    }], []);

    expect(oldNoPayload.fingerprint).not.toBe(withPayload.fingerprint);
    expect(withPayload.patch).toMatchObject({ patchKind: "hunks" });
  });

  it("keeps unsafe canonical patch target hints blocked and backward-compatible", async () => {
    await initHarness(project());
    const memory = await resolveProjectMemory(project());
    const originalGuide = await readFile(memory.agentGuidePath, "utf8");

    candidateSchema.parse({
      version: "1.0",
      id: "candidate-old",
      sourceLedgerEntryIds: ["ledger-old"],
      subtype: "docs-drift",
      title: "Old candidate",
      summary: "Old candidate without target hints.",
      artifactRefs: [],
      status: "candidate",
      createdAt: "2026-06-18T00:00:00.000Z",
    });
    resolutionSchema.parse({
      version: "1.0",
      id: "resolution-old",
      candidateId: "candidate-old",
      outcome: "merge",
      reviewRecommendation: "accept",
      candidateSubtype: "docs-drift",
      score: 80,
      rationale: "Old resolution without target hints.",
      canonicalUpdateRequired: true,
      humanGateRequired: true,
      artifactRefs: [],
      createdAt: "2026-06-18T00:00:00.000Z",
    });
    canonicalUpdateProposalSchema.parse({
      version: "1.0",
      id: "proposal-old",
      status: "proposed",
      resolutionIds: ["resolution-old"],
      candidateIds: ["candidate-old"],
      targetKinds: ["canonical-docs"],
      humanGateRequired: true,
      canonicalUpdateAuthorized: false,
      summary: "Old proposal without target hints.",
      resolutionSummaries: [{
        resolutionId: "resolution-old",
        candidateId: "candidate-old",
        outcome: "merge",
        candidateSubtype: "docs-drift",
        reviewRecommendation: "accept",
        rationale: "Old summary without target hints.",
        artifactRefs: [],
      }],
      artifactRefs: [],
      createdAt: "2026-06-18T00:00:00.000Z",
    });

    for (let index = 1; index <= 5; index += 1) {
      await recordDemandMemoryCloseout(memory, {
        changeId: `unsafe-descriptor-${index}`,
        title: `Unsafe descriptor demand ${index}`,
        terminalKind: "archived",
        finalResult: `Unsafe descriptor demand ${index} completed.`,
        userDecision: "archived",
        docsDriftCandidates: [{
          document: "../AGENTS.md",
          summary: "Unsafe target path must not become a descriptor.",
          patch: {
            patchKind: "hunks",
            hunks: [{
              oldText: "Agent Harness",
              newText: "Changed Agent Harness",
            }],
          },
          evidenceRefs: [`unsafe-${index}.md`],
        }],
      });
    }

    const proposal = (await listMaintenanceCanonicalUpdateProposals(memory))[0];
    const decision = await recordMaintenanceCanonicalUpdateDecision(memory, proposal.id);
    const patchProposal = await proposeMaintenanceCanonicalPatch(memory, decision.id);
    const gateRecord = await recordMaintenanceCanonicalPatchApplicationGate(memory, patchProposal.id);
    const manifest = await generateMaintenanceCanonicalPatchApplicationManifest(memory, gateRecord.id);

    expect(patchProposal.operations.every((operation) => operation.targetDescriptor === undefined)).toBe(true);
    expect(manifest).toMatchObject({
      applicationStatus: "blocked-needs-concrete-targets",
      sourceMutationAuthorized: false,
      canonicalUpdateApplied: false,
      canonicalPatchApplied: false,
      executionStarted: false,
    });
    expect(manifest.operations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        targetDescriptor: null,
        readiness: "blocked-needs-concrete-target",
        blockedReasons: expect.arrayContaining([expect.stringContaining("deterministic target descriptor")]),
      }),
    ]));
    expect(await readFile(memory.agentGuidePath, "utf8")).toBe(originalGuide);
  });

  it("rejects missing, directory, mismatched-kind, and symlink-escaping patch target hints", async () => {
    await initHarness(project());
    const memory = await resolveProjectMemory(project());
    await mkdir(join(memory.memoryRoot, "docs", "directory-target"), { recursive: true });
    const outsideDir = await mkdtemp(join(tmpdir(), "aho-outside-target-"));
    const outsideFile = join(outsideDir, "outside.md");
    await writeFile(outsideFile, "outside\n", "utf8");
    const validPatch = {
      patchKind: "hunks" as const,
      hunks: [{ oldText: "old", newText: "new" }],
    };

    await expect(buildCanonicalPatchTargetDescriptor(memory, "canonical-docs", [{
      targetKind: "canonical-docs",
      targetPath: "docs/missing.md",
      patch: validPatch,
      reason: "missing target",
      artifactRefs: [],
    }])).resolves.toBeNull();
    await expect(buildCanonicalPatchTargetDescriptor(memory, "canonical-docs", [{
      targetKind: "canonical-docs",
      targetPath: "docs/directory-target",
      patch: validPatch,
      reason: "directory target",
      artifactRefs: [],
    }])).resolves.toBeNull();
    await expect(buildCanonicalPatchTargetDescriptor(memory, "stable-memory", [{
      targetKind: "canonical-docs",
      targetPath: "docs/MEMORY.md",
      patch: validPatch,
      reason: "mismatched target kind",
      artifactRefs: [],
    }])).resolves.toBeNull();

    const linkPath = join(memory.memoryRoot, "docs", "outside-link.md");
    let symlinkCreated = true;
    try {
      await symlink(outsideFile, linkPath);
    } catch {
      symlinkCreated = false;
    }
    if (symlinkCreated) {
      await expect(buildCanonicalPatchTargetDescriptor(memory, "canonical-docs", [{
        targetKind: "canonical-docs",
        targetPath: "docs/outside-link.md",
        patch: validPatch,
        reason: "symlink escape",
        artifactRefs: [],
      }])).resolves.toBeNull();
    }
  });

  it("fails closed when canonical patch application manifest lineage is stale", async () => {
    await initHarness(project());
    const memory = await resolveProjectMemory(project());

    for (let index = 1; index <= 5; index += 1) {
      await recordDemandMemoryCloseout(memory, {
        changeId: `stale-lineage-${index}`,
        title: `Stale lineage demand ${index}`,
        terminalKind: "archived",
        finalResult: `Stale lineage demand ${index} completed.`,
        userDecision: "archived",
        reusableLessonCandidates: [{ summary: "Keep manifest lineage fail closed." }],
      });
    }

    const proposal = (await listMaintenanceCanonicalUpdateProposals(memory))[0];
    const decision = await recordMaintenanceCanonicalUpdateDecision(memory, proposal.id);
    const patchProposal = await proposeMaintenanceCanonicalPatch(memory, decision.id);
    const gateRecord = await recordMaintenanceCanonicalPatchApplicationGate(memory, patchProposal.id);
    const forgedGate = {
      ...gateRecord,
      id: "forged-gate",
      operationCount: gateRecord.operationCount + 1,
    };
    await writeFile(join(memory.workbenchRoot, "maintenance", "canonical-patch-application-gates", `${forgedGate.id}.json`), JSON.stringify(forgedGate, null, 2), "utf8");

    await expect(generateMaintenanceCanonicalPatchApplicationManifest(memory, forgedGate.id)).rejects.toThrow("operation count mismatch");
  });

  it("does not create maintenance candidates from canonical maintenance evidence ledger entries", async () => {
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
    await recordMaintenanceLedgerEntry(memory, {
      eventType: "canonical-patch-application-gate",
      summary: "Patch application gate evidence should not feed the maintenance candidate pipeline.",
      artifactRefs: ["workbench/maintenance/canonical-patch-application-gates/gate.json"],
    });
    await recordMaintenanceLedgerEntry(memory, {
      eventType: "canonical-patch-application-manifest",
      summary: "Patch application manifest evidence should not feed the maintenance candidate pipeline.",
      artifactRefs: ["workbench/maintenance/canonical-patch-application-manifests/manifest.json"],
    });
    await recordMaintenanceLedgerEntry(memory, {
      eventType: "canonical-patch-application-result",
      summary: "Patch application result evidence should not feed the maintenance candidate pipeline.",
      artifactRefs: ["workbench/maintenance/canonical-patch-application-results/result.json"],
    });
    await recordMaintenanceLedgerEntry(memory, {
      eventType: "canonical-patch-application-report",
      summary: "Patch application report evidence should not feed the maintenance candidate pipeline.",
      artifactRefs: ["workbench/maintenance/canonical-patch-application-reports/report.json"],
    });

    const entries = await listMaintenanceLedgerEntries(memory);
    const summary = await buildMaintenanceSummary(memory);
    expect(entries.some((entry) => entry.eventType === "canonical-patch-application-report")).toBe(true);
    expect([
      "canonical-patch-application-manifest",
      "canonical-patch-application-result",
      "canonical-patch-application-report",
    ]).toContain(summary.latest?.eventType);
    expect(summary.latest?.eventType).not.toBe("canonical-update-proposal");
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

async function writeForgedReadyApplicationChain(
  memory: ResolvedMemory,
  input: {
    manifestId: string;
    targetPath: string;
    expectedContentHash: string;
    oldText: string;
    newText: string;
  },
): Promise<MaintenanceCanonicalPatchApplicationManifest> {
  const patchProposalId = `${input.manifestId}-patch`;
  const gateRecordId = `${input.manifestId}-gate`;
  const proposalId = `${input.manifestId}-proposal`;
  const decisionId = `${input.manifestId}-decision`;
  const patchOperationId = `${patchProposalId}-operation-001`;
  const manifestOperationId = `${input.manifestId}-operation-001`;
  const createdAt = "2026-06-19T00:00:00.000Z";
  const patchProposal: MaintenanceCanonicalPatchProposal = {
    version: "1.0",
    id: patchProposalId,
    status: "patch-proposed",
    proposalId,
    decisionId,
    targetKinds: ["canonical-docs"],
    operationCount: 1,
    operations: [{
      id: patchOperationId,
      targetKind: "canonical-docs",
      operation: "merge",
      sourceResolutionId: `${input.manifestId}-resolution`,
      sourceCandidateId: `${input.manifestId}-candidate`,
      targetDescriptor: {
        targetKind: "canonical-docs",
        targetPath: input.targetPath,
        expectedContentHash: input.expectedContentHash,
        patchKind: "hunks",
        hunks: [{
          oldText: input.oldText,
          newText: input.newText,
        }],
      },
      summary: "Forged patch proposal for fail-closed test.",
      rationale: "Exercise writer revalidation.",
      artifactRefs: [],
    }],
    sourceMutationAuthorized: false,
    canonicalUpdateAuthorized: false,
    applicationAuthorized: false,
    executionStarted: false,
    humanApplicationGateRequired: true,
    summary: "Forged patch proposal for fail-closed test.",
    risks: [],
    artifactRefs: [],
    createdAt,
  };
  const gateRecord: MaintenanceCanonicalPatchApplicationGateRecord = {
    version: "1.0",
    id: gateRecordId,
    patchProposalId,
    proposalId,
    decisionId,
    decisionStatus: "accepted-for-application-follow-up",
    targetKinds: ["canonical-docs"],
    operationCount: 1,
    sourceMutationAuthorized: false,
    canonicalUpdateApplied: false,
    canonicalPatchApplied: false,
    executionStarted: false,
    summary: "Forged gate for fail-closed test.",
    risks: [],
    artifactRefs: [],
    createdAt,
  };
  const manifest: MaintenanceCanonicalPatchApplicationManifest = {
    version: "1.0",
    id: input.manifestId,
    status: "application-manifest",
    patchProposalId,
    gateRecordId,
    proposalId,
    decisionId,
    targetKinds: ["canonical-docs"],
    operationCount: 1,
    applicationStatus: "ready-for-application",
    operations: [{
      id: manifestOperationId,
      patchOperationId,
      targetKind: "canonical-docs",
      operation: "merge",
      sourceResolutionId: `${input.manifestId}-resolution`,
      sourceCandidateId: `${input.manifestId}-candidate`,
      targetDescriptor: {
        targetKind: "canonical-docs",
        targetPath: input.targetPath,
        expectedContentHash: input.expectedContentHash,
        patchKind: "hunks",
        hunks: [{
          oldText: input.oldText,
          newText: input.newText,
        }],
      },
      readiness: "ready",
      blockedReasons: [],
      summary: "Forged manifest operation for fail-closed test.",
      rationale: "Exercise writer revalidation.",
      artifactRefs: [],
    }],
    blockedReasons: [],
    sourceMutationAuthorized: false,
    canonicalUpdateApplied: false,
    canonicalPatchApplied: false,
    executionStarted: false,
    summary: "Forged ready manifest for fail-closed test.",
    artifactRefs: [],
    createdAt,
  };
  await mkdir(join(memory.workbenchRoot, "maintenance", "canonical-patch-proposals"), { recursive: true });
  await mkdir(join(memory.workbenchRoot, "maintenance", "canonical-patch-application-gates"), { recursive: true });
  await mkdir(join(memory.workbenchRoot, "maintenance", "canonical-patch-application-manifests"), { recursive: true });
  await writeFile(join(memory.workbenchRoot, "maintenance", "canonical-patch-proposals", `${patchProposal.id}.json`), JSON.stringify(patchProposal, null, 2), "utf8");
  await writeFile(join(memory.workbenchRoot, "maintenance", "canonical-patch-application-gates", `${gateRecord.id}.json`), JSON.stringify(gateRecord, null, 2), "utf8");
  await writeFile(join(memory.workbenchRoot, "maintenance", "canonical-patch-application-manifests", `${manifest.id}.json`), JSON.stringify(manifest, null, 2), "utf8");
  return manifest;
}

function readFileSyncUtf8(path: string): string {
  return statSync(path).isFile() ? readFileSync(path, "utf8") : "";
}
