import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyMaintenanceCanonicalPatchApplicationManifest,
  buildRoleScopedContextProjection,
  generateMaintenanceCanonicalPatchApplicationManifest,
  generateMaintenanceCanonicalPatchApplicationReport,
  listDemandMemoryCloseouts,
  listMaintenanceCanonicalPatchApplicationGateRecords,
  listMaintenanceCanonicalPatchApplicationReports,
  listMaintenanceCanonicalPatchApplicationResults,
  listMaintenanceCanonicalPatchProposals,
  listMaintenanceCanonicalUpdateDecisions,
  listMaintenanceCanonicalUpdateProposals,
  maybeRunMaintenanceReviewWindow,
  proposeMaintenanceCanonicalPatch,
  readMaintenanceReviewWatermark,
  recordDemandMemoryCloseout,
  recordMaintenanceCanonicalPatchApplicationGate,
  recordMaintenanceCanonicalUpdateDecision,
  recordMaintenanceLedgerEntry,
  runMaintenanceCandidatePipeline,
} from "../../src/agent-task/manager.js";
import { initHarness } from "../../src/harness/init.js";
import { resolveProjectMemory } from "../../src/memory/resolver.js";
import { executeWorkbenchAction } from "../../src/server/workbench-server.js";
import { getWorkbenchMaintenanceProjection, getWorkbenchSnapshot } from "../../src/workbench/manager.js";
import { getTempDir, project } from "../unit/workbench/fixtures.js";
import type { ResolvedMemory } from "../../src/types/index.js";

type MaintenanceCanonicalUpdateProposalFixture = Awaited<ReturnType<typeof listMaintenanceCanonicalUpdateProposals>>[number];

async function writeMaintenanceArtifactCreatedAt(
  memory: ResolvedMemory,
  directory: string,
  artifactId: string,
  createdAt: string,
): Promise<void> {
  const artifactPath = join(memory.workbenchRoot, "maintenance", directory, `${artifactId}.json`);
  const artifact = JSON.parse(await readFile(artifactPath, "utf8")) as Record<string, unknown>;
  artifact.createdAt = createdAt;
  await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
}

async function createMaintenanceCanonicalUpdateProposalFixture(
  memory: ResolvedMemory,
  key: string,
  options: {
    document: string;
    originalText: string;
    updatedText?: string;
  },
): Promise<MaintenanceCanonicalUpdateProposalFixture> {
  const targetPath = join(memory.memoryRoot, options.document);
  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, options.originalText, "utf8");

  const beforeIds = new Set((await listMaintenanceCanonicalUpdateProposals(memory)).map((proposal) => proposal.id));
  for (let index = 1; index <= 5; index += 1) {
    await recordDemandMemoryCloseout(memory, {
      changeId: `${key}-${index}`,
      title: `Maintenance projection fixture ${key} ${index}`,
      terminalKind: "archived",
      finalResult: `Maintenance projection fixture ${key} ${index} completed.`,
      userDecision: "archived",
      evidenceRefs: [`harness/changes/archive/${key}-${index}/summary.md`],
      docsDriftCandidates: [{
        document: options.document,
        summary: `Maintenance projection fixture ${key} needs a canonical update.`,
        ...(options.updatedText ? {
          patch: {
            patchKind: "hunks" as const,
            hunks: [{
              oldText: options.originalText.trimEnd(),
              newText: options.updatedText.trimEnd(),
            }],
          },
        } : {}),
        evidenceRefs: [`${key}-${index}.md`],
      }],
    });
  }

  let proposal = (await listMaintenanceCanonicalUpdateProposals(memory)).find((item) => !beforeIds.has(item.id));
  if (!proposal) {
    const result = await runMaintenanceCandidatePipeline(memory);
    if (result.status !== "reviewed") {
      throw new Error(`Maintenance fixture ${key} did not produce a reviewed candidate.`);
    }
    proposal = (await listMaintenanceCanonicalUpdateProposals(memory)).find((item) => !beforeIds.has(item.id));
  }
  if (!proposal) {
    throw new Error(`Maintenance fixture ${key} did not produce a canonical update proposal.`);
  }
  return proposal;
}

describe("workbench maintenance slow flows", () => {
  it("records background maintenance ledger entries and creates human-gated candidate reviews", async () => {
    await initHarness(project());
    const memory = await resolveProjectMemory(project());

    await recordMaintenanceLedgerEntry(memory, {
      eventType: "apply",
      changeId: "maintenance-demand",
      summary: "Applied demand created reusable documentation evidence.",
      artifactRefs: ["harness/changes/archive/maintenance/summary.md"],
    });
    const result = await runMaintenanceCandidatePipeline(memory);
    const snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() });
    const maintenance = await getWorkbenchMaintenanceProjection({ project: project(), path: getTempDir() });

    expect(result.status).toBe("reviewed");
    expect(result.candidate).toMatchObject({
      status: "candidate",
      sourceLedgerEntryIds: expect.any(Array),
      subtype: expect.any(String),
      fingerprint: expect.any(String),
    });
    expect(result.score).toMatchObject({ confidence: expect.any(String), dimensions: expect.any(Object) });
    expect(result.review).toMatchObject({ recommendation: expect.stringMatching(/accept|defer|reject|needs-human-review/) });
    expect(snapshot.center.workpad.maintenance).toBeUndefined();
    expect(maintenance).toMatchObject({
      ledgerCount: 2,
      resolutionCount: 1,
      proposalCount: 1,
      latestProposal: expect.objectContaining({
        status: "proposed",
        humanGateRequired: true,
        canonicalUpdateAuthorized: false,
        resolutionCount: 1,
      }),
      latestResolution: expect.objectContaining({
        outcome: expect.stringMatching(/archive-only|merge|noop|promote|retire/),
      }),
      latest: expect.objectContaining({ eventType: "apply" }),
    });
    expect(snapshot.right.confirmationQueue.current.flatMap((item) => item.actions).some((action) => action.actionType === "maintenance.canonical-update.decision.record")).toBe(false);
    expect(snapshot.right.confirmationQueue.maintenance).toEqual([
      expect.objectContaining({
        kind: "maintenance",
        maintenanceProposalId: maintenance?.latestProposal?.id,
        actions: [expect.objectContaining({
          actionType: "maintenance.canonical-update.decision.record",
          maintenanceProposalId: maintenance?.latestProposal?.id,
          requiresConfirmation: true,
        })],
      }),
    ]);
  });

  it("records terminal demand closeouts, runs five-change maintenance review, and keeps maintenance out of the current confirmation queue", async () => {
    await initHarness(project());
    const memory = await resolveProjectMemory(project());

    for (let index = 1; index <= 4; index += 1) {
      await recordDemandMemoryCloseout(memory, {
        changeId: `closeout-${index}`,
        title: `Demand ${index}`,
        terminalKind: "archived",
        finalResult: `Demand ${index} completed.`,
        userDecision: "archived",
        evidenceRefs: [`harness/changes/archive/closeout-${index}/summary.md`],
        reusableLessonCandidates: [{ summary: "Keep validation evidence linked.", evidenceRefs: [`evidence-${index}.md`] }],
        docsDriftCandidates: [{ document: "docs/STATUS.md", summary: "Status handoff needs a refresh.", evidenceRefs: [`status-${index}.md`] }],
      });
    }

    expect(await maybeRunMaintenanceReviewWindow(memory)).toMatchObject({ status: "skipped" });

    await recordDemandMemoryCloseout(memory, {
      changeId: "closeout-5",
      title: "Demand 5",
      terminalKind: "applied",
      finalResult: "Demand 5 applied.",
      userDecision: "applied",
      changedFiles: ["src/pricing.ts"],
      evidenceRefs: ["harness/changes/archive/closeout-5/summary.md"],
      reusableLessonCandidates: [{ summary: "Keep source apply decisions scoped to explicit result targets." }],
      docsDriftCandidates: [{ document: "docs/MEMORY.md", summary: "Memory tier rules need update." }],
    });
    await recordDemandMemoryCloseout(memory, {
      changeId: "closeout-5",
      title: "Demand 5 duplicate applied event",
      terminalKind: "applied",
      finalResult: "Duplicate terminal event should not create a second closeout.",
      userDecision: "applied",
    });

    const closeouts = await listDemandMemoryCloseouts(memory);
    const watermark = await readMaintenanceReviewWatermark(memory);
    const snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() });
    const maintenance = await getWorkbenchMaintenanceProjection({ project: project(), path: getTempDir() });

    expect(closeouts).toHaveLength(5);
    expect(watermark?.lastReviewedChangeIds).toEqual(["closeout-1:archived", "closeout-2:archived", "closeout-3:archived", "closeout-4:archived", "closeout-5:applied"]);
    expect(watermark?.lastReviewWindowId).toMatch(/^maintenance-review-/);
    expect(snapshot.center.workpad.maintenance).toBeUndefined();
    expect(maintenance).toMatchObject({
      closeoutCount: 5,
      resolutionCount: expect.any(Number),
      proposalCount: expect.any(Number),
      latestProposal: expect.objectContaining({
        status: "proposed",
        humanGateRequired: true,
        canonicalUpdateAuthorized: false,
      }),
      latestResolution: expect.objectContaining({
        humanGateRequired: expect.any(Boolean),
      }),
      status: "reviewed",
      unreviewedTerminalCount: 0,
      latestReviewWindowId: watermark?.lastReviewWindowId,
    });
    expect(maintenance?.resolutionCount ?? 0).toBeGreaterThan(0);
    expect(maintenance?.proposalCount ?? 0).toBeGreaterThan(0);
    const maintenanceProposalId = maintenance?.latestProposal?.id;
    expect(maintenanceProposalId).toBeTruthy();
    expect(snapshot.right.confirmationQueue.current.flatMap((item) => item.actions).some((action) => action.actionType === "maintenance.canonical-update.decision.record")).toBe(false);
    expect(snapshot.right.confirmationQueue.maintenance).toEqual([
      expect.objectContaining({
        kind: "maintenance",
        maintenanceProposalId,
        actions: [expect.objectContaining({
          actionType: "maintenance.canonical-update.decision.record",
          maintenanceProposalId,
          requiresConfirmation: true,
        })],
      }),
    ]);
    await expect(executeWorkbenchAction({ project: project(), path: getTempDir() }, {
      actionType: "maintenance.canonical-update.decision.record",
      maintenanceProposalId: maintenanceProposalId ?? "",
      confirm: false,
    })).rejects.toThrow("Mutating Workbench workflow actions require confirm: true.");
    await expect(executeWorkbenchAction({ project: project(), path: getTempDir() }, {
      actionType: "maintenance.canonical-update.decision.record",
      maintenanceProposalId: "forged-proposal",
      confirm: true,
    })).rejects.toThrow("Workflow action target is stale or no longer available.");
    const decisionResult = await executeWorkbenchAction({ project: project(), path: getTempDir() }, {
      actionType: "maintenance.canonical-update.decision.record",
      maintenanceProposalId: maintenanceProposalId ?? "",
      confirm: true,
    });
    const decisions = await listMaintenanceCanonicalUpdateDecisions(memory);
    expect(decisions).toEqual([
      expect.objectContaining({
        proposalId: maintenanceProposalId,
        sourceMutationAuthorized: false,
        canonicalUpdateAuthorized: false,
        executionStarted: false,
      }),
    ]);
    expect((decisionResult.snapshot as Awaited<ReturnType<typeof getWorkbenchSnapshot>>).right.confirmationQueue.maintenance).toEqual([]);
    const patchProposal = await proposeMaintenanceCanonicalPatch(memory, decisions[0].id);
    const patchProposals = await listMaintenanceCanonicalPatchProposals(memory);
    const maintenanceAfterPatch = await getWorkbenchMaintenanceProjection({ project: project(), path: getTempDir() });
    const snapshotAfterPatch = await getWorkbenchSnapshot({ project: project(), path: getTempDir() });
    expect(patchProposals).toEqual([expect.objectContaining({
      id: patchProposal.id,
      proposalId: maintenanceProposalId,
      decisionId: decisions[0].id,
      applicationAuthorized: false,
      canonicalUpdateAuthorized: false,
    })]);
    expect(maintenanceAfterPatch).toMatchObject({
      patchProposalCount: 1,
      latestPatchProposal: expect.objectContaining({
        id: patchProposal.id,
        status: "patch-proposed",
        applicationAuthorized: false,
        canonicalUpdateAuthorized: false,
      }),
    });
    expect(snapshotAfterPatch.right.confirmationQueue.current.flatMap((item) => item.actions).some((action) => action.actionType.includes("maintenance") && action.actionType.includes("apply"))).toBe(false);
    expect(snapshotAfterPatch.right.confirmationQueue.maintenance).toEqual([
      expect.objectContaining({
        kind: "maintenance",
        maintenancePatchProposalId: patchProposal.id,
        actions: [expect.objectContaining({
          actionType: "maintenance.canonical-patch.application-gate.record",
          maintenancePatchProposalId: patchProposal.id,
          requiresConfirmation: true,
        })],
      }),
    ]);
    await expect(executeWorkbenchAction({ project: project(), path: getTempDir() }, {
      actionType: "maintenance.canonical-patch.application-gate.record",
      maintenancePatchProposalId: patchProposal.id,
      confirm: false,
    })).rejects.toThrow("Mutating Workbench workflow actions require confirm: true.");
    await expect(executeWorkbenchAction({ project: project(), path: getTempDir() }, {
      actionType: "maintenance.canonical-patch.application-gate.record",
      maintenancePatchProposalId: "forged-patch-proposal",
      confirm: true,
    })).rejects.toThrow("Workflow action target is stale or no longer available.");
    const gateResult = await executeWorkbenchAction({ project: project(), path: getTempDir() }, {
      actionType: "maintenance.canonical-patch.application-gate.record",
      maintenancePatchProposalId: patchProposal.id,
      confirm: true,
    });
    const gateRecords = await listMaintenanceCanonicalPatchApplicationGateRecords(memory);
    expect(gateRecords).toEqual([expect.objectContaining({
      patchProposalId: patchProposal.id,
      decisionStatus: "accepted-for-application-follow-up",
      sourceMutationAuthorized: false,
      canonicalUpdateApplied: false,
      canonicalPatchApplied: false,
      executionStarted: false,
    })]);
    expect((gateResult.snapshot as Awaited<ReturnType<typeof getWorkbenchSnapshot>>).right.confirmationQueue.maintenance).toEqual([]);
    const manifest = await generateMaintenanceCanonicalPatchApplicationManifest(memory, gateRecords[0].id);
    const maintenanceAfterManifest = await getWorkbenchMaintenanceProjection({ project: project(), path: getTempDir() });
    const snapshotAfterManifest = await getWorkbenchSnapshot({ project: project(), path: getTempDir() });
    expect(manifest).toMatchObject({
      gateRecordId: gateRecords[0].id,
      patchProposalId: patchProposal.id,
      applicationStatus: "blocked-needs-concrete-targets",
      canonicalPatchApplied: false,
      executionStarted: false,
    });
    expect(maintenanceAfterManifest).toMatchObject({
      applicationManifestCount: 1,
      latestApplicationManifest: expect.objectContaining({
        id: manifest.id,
        applicationStatus: "blocked-needs-concrete-targets",
        canonicalPatchApplied: false,
      }),
    });
    expect(snapshotAfterManifest.right.confirmationQueue.maintenance).toEqual([]);

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

  it("returns review-ready when five new closeouts arrive after an older maintenance watermark", async () => {
    await initHarness(project());
    const memory = await resolveProjectMemory(project());

    for (let index = 1; index <= 5; index += 1) {
      await recordDemandMemoryCloseout(memory, {
        changeId: `old-closeout-${index}`,
        title: `Old demand ${index}`,
        terminalKind: "archived",
        finalResult: `Old demand ${index} completed.`,
        userDecision: "archived",
        reusableLessonCandidates: [{ summary: "Keep maintenance review windows evidence-backed." }],
      });
    }
    await maybeRunMaintenanceReviewWindow(memory);
    const oldWatermark = await readMaintenanceReviewWatermark(memory);
    expect(oldWatermark).toMatchObject({ lastReviewWindowId: expect.any(String) });

    for (let index = 1; index <= 5; index += 1) {
      await recordDemandMemoryCloseout(memory, {
        changeId: `new-closeout-${index}`,
        title: `New demand ${index}`,
        terminalKind: "archived",
        finalResult: `New demand ${index} completed.`,
        userDecision: "archived",
      });
    }
    await writeFile(join(memory.workbenchRoot, "maintenance", "review-watermark.json"), JSON.stringify(oldWatermark, null, 2), "utf8");

    await expect(getWorkbenchMaintenanceProjection({ project: project(), path: getTempDir() })).resolves.toMatchObject({
      status: "review-ready",
      unreviewedTerminalCount: 5,
    });
  });

  it("selects newest eligible maintenance confirmation records with projection summary helper semantics", async () => {
    await initHarness(project());
    const memory = await resolveProjectMemory(project());
    const olderUpdateProposal = await createMaintenanceCanonicalUpdateProposalFixture(memory, "queue-update-older", {
      document: "docs/QUEUE-UPDATE-OLDER.md",
      originalText: "# Queue Update Older\n\nKeep older guidance.\n",
      updatedText: "# Queue Update Older\n\nKeep older updated guidance.\n",
    });
    const selectedUpdateProposal = await createMaintenanceCanonicalUpdateProposalFixture(memory, "queue-update-selected", {
      document: "docs/QUEUE-UPDATE-SELECTED.md",
      originalText: "# Queue Update Selected\n\nKeep selected guidance.\n",
      updatedText: "# Queue Update Selected\n\nKeep selected updated guidance.\n",
    });
    const handledUpdateProposal = await createMaintenanceCanonicalUpdateProposalFixture(memory, "queue-update-handled", {
      document: "docs/QUEUE-UPDATE-HANDLED.md",
      originalText: "# Queue Update Handled\n\nKeep handled guidance.\n",
      updatedText: "# Queue Update Handled\n\nKeep handled updated guidance.\n",
    });
    await writeMaintenanceArtifactCreatedAt(memory, "canonical-update-proposals", olderUpdateProposal.id, "2026-06-19T00:00:00.000Z");
    await writeMaintenanceArtifactCreatedAt(memory, "canonical-update-proposals", selectedUpdateProposal.id, "2026-06-19T00:01:00.000Z");
    await writeMaintenanceArtifactCreatedAt(memory, "canonical-update-proposals", handledUpdateProposal.id, "2026-06-19T00:02:00.000Z");
    const handledUpdateDecision = await recordMaintenanceCanonicalUpdateDecision(memory, handledUpdateProposal.id);

    const updateSnapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() });
    expect(updateSnapshot.right.confirmationQueue.maintenance).toEqual([
      expect.objectContaining({
        maintenanceProposalId: selectedUpdateProposal.id,
        actions: [expect.objectContaining({
          actionType: "maintenance.canonical-update.decision.record",
          maintenanceProposalId: selectedUpdateProposal.id,
        })],
      }),
    ]);

    const olderUpdateDecision = await recordMaintenanceCanonicalUpdateDecision(memory, olderUpdateProposal.id);
    const selectedUpdateDecision = await recordMaintenanceCanonicalUpdateDecision(memory, selectedUpdateProposal.id);
    for (const proposal of await listMaintenanceCanonicalUpdateProposals(memory)) {
      await recordMaintenanceCanonicalUpdateDecision(memory, proposal.id);
    }
    const olderPatchProposal = await proposeMaintenanceCanonicalPatch(memory, olderUpdateDecision.id);
    const selectedPatchProposal = await proposeMaintenanceCanonicalPatch(memory, selectedUpdateDecision.id);
    const handledPatchProposal = await proposeMaintenanceCanonicalPatch(memory, handledUpdateDecision.id);
    await writeMaintenanceArtifactCreatedAt(memory, "canonical-patch-proposals", olderPatchProposal.id, "2026-06-19T00:00:00.000Z");
    await writeMaintenanceArtifactCreatedAt(memory, "canonical-patch-proposals", selectedPatchProposal.id, "2026-06-19T00:01:00.000Z");
    await writeMaintenanceArtifactCreatedAt(memory, "canonical-patch-proposals", handledPatchProposal.id, "2026-06-19T00:02:00.000Z");
    const handledPatchGate = await recordMaintenanceCanonicalPatchApplicationGate(memory, handledPatchProposal.id);

    const patchGateSnapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() });
    expect(patchGateSnapshot.right.confirmationQueue.maintenance).toEqual([
      expect.objectContaining({
        maintenancePatchProposalId: selectedPatchProposal.id,
        actions: [expect.objectContaining({
          actionType: "maintenance.canonical-patch.application-gate.record",
          maintenancePatchProposalId: selectedPatchProposal.id,
        })],
      }),
    ]);

    const olderPatchGate = await recordMaintenanceCanonicalPatchApplicationGate(memory, olderPatchProposal.id);
    const selectedPatchGate = await recordMaintenanceCanonicalPatchApplicationGate(memory, selectedPatchProposal.id);
    const olderManifest = await generateMaintenanceCanonicalPatchApplicationManifest(memory, olderPatchGate.id);
    const selectedManifest = await generateMaintenanceCanonicalPatchApplicationManifest(memory, selectedPatchGate.id);
    const handledManifest = await generateMaintenanceCanonicalPatchApplicationManifest(memory, handledPatchGate.id);
    const blockedUpdateProposal = await createMaintenanceCanonicalUpdateProposalFixture(memory, "queue-update-blocked", {
      document: "docs/QUEUE-UPDATE-BLOCKED.md",
      originalText: "# Queue Update Blocked\n\nKeep blocked guidance.\n",
    });
    for (const proposal of await listMaintenanceCanonicalUpdateProposals(memory)) {
      await recordMaintenanceCanonicalUpdateDecision(memory, proposal.id);
    }
    const blockedUpdateDecision = await recordMaintenanceCanonicalUpdateDecision(memory, blockedUpdateProposal.id);
    const blockedPatchProposal = await proposeMaintenanceCanonicalPatch(memory, blockedUpdateDecision.id);
    const blockedPatchGate = await recordMaintenanceCanonicalPatchApplicationGate(memory, blockedPatchProposal.id);
    const blockedManifest = await generateMaintenanceCanonicalPatchApplicationManifest(memory, blockedPatchGate.id);
    await writeMaintenanceArtifactCreatedAt(memory, "canonical-patch-application-manifests", olderManifest.id, "2026-06-19T00:00:00.000Z");
    await writeMaintenanceArtifactCreatedAt(memory, "canonical-patch-application-manifests", selectedManifest.id, "2026-06-19T00:01:00.000Z");
    await writeMaintenanceArtifactCreatedAt(memory, "canonical-patch-application-manifests", handledManifest.id, "2026-06-19T00:02:00.000Z");
    await writeMaintenanceArtifactCreatedAt(memory, "canonical-patch-application-manifests", blockedManifest.id, "2026-06-19T00:03:00.000Z");
    expect(blockedManifest.applicationStatus).toBe("blocked-needs-concrete-targets");
    await applyMaintenanceCanonicalPatchApplicationManifest(memory, handledManifest.id, {
      policyAuditRefs: ["workbench/maintenance/projection-helper-policy-audit.json"],
      confirmedBy: "workbench-human-gate",
    });

    const manifestSnapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() });
    expect(manifestSnapshot.right.confirmationQueue.maintenance).toEqual([
      expect.objectContaining({
        maintenanceApplicationManifestId: selectedManifest.id,
        actions: [expect.objectContaining({
          actionType: "maintenance.canonical-patch.apply",
          maintenanceApplicationManifestId: selectedManifest.id,
        })],
      }),
    ]);
  });

  it("applies ready maintenance canonical patch manifests only through a scoped confirmation", async () => {
    await initHarness(project());
    const memory = await resolveProjectMemory(project());
    const memoryDocPath = join(memory.memoryRoot, "docs", "MEMORY.md");
    const originalMemoryDoc = "# Memory\n\nKeep old workbench memory guidance.\n";
    const updatedMemoryDoc = "# Memory\n\nKeep updated workbench memory guidance.\n";
    await writeFile(memoryDocPath, originalMemoryDoc, "utf8");

    for (let index = 1; index <= 5; index += 1) {
      await recordDemandMemoryCloseout(memory, {
        changeId: `workbench-apply-${index}`,
        title: `Workbench apply demand ${index}`,
        terminalKind: "archived",
        finalResult: `Workbench apply demand ${index} completed.`,
        userDecision: "archived",
        evidenceRefs: [`harness/changes/archive/workbench-apply-${index}/summary.md`],
        docsDriftCandidates: [{
          document: "docs/MEMORY.md",
          summary: "Workbench maintenance apply needs a concrete target.",
          patch: {
            patchKind: "hunks",
            hunks: [{
              oldText: "Keep old workbench memory guidance.",
              newText: "Keep updated workbench memory guidance.",
            }],
          },
          evidenceRefs: [`workbench-apply-${index}.md`],
        }],
      });
    }

    const maintenance = await getWorkbenchMaintenanceProjection({ project: project(), path: getTempDir() });
    const maintenanceProposalId = maintenance?.latestProposal?.id;
    expect(maintenanceProposalId).toBeTruthy();
    await executeWorkbenchAction({ project: project(), path: getTempDir() }, {
      actionType: "maintenance.canonical-update.decision.record",
      maintenanceProposalId: maintenanceProposalId ?? "",
      confirm: true,
    });
    const decisions = await listMaintenanceCanonicalUpdateDecisions(memory);
    const patchProposal = await proposeMaintenanceCanonicalPatch(memory, decisions[0].id);
    await executeWorkbenchAction({ project: project(), path: getTempDir() }, {
      actionType: "maintenance.canonical-patch.application-gate.record",
      maintenancePatchProposalId: patchProposal.id,
      confirm: true,
    });
    const gateRecords = await listMaintenanceCanonicalPatchApplicationGateRecords(memory);
    const manifest = await generateMaintenanceCanonicalPatchApplicationManifest(memory, gateRecords[0].id);
    expect(manifest.applicationStatus).toBe("ready-for-application");

    const snapshotBeforeApply = await getWorkbenchSnapshot({ project: project(), path: getTempDir() });
    expect(snapshotBeforeApply.right.confirmationQueue.current.flatMap((item) => item.actions).some((action) => action.actionType === "maintenance.canonical-patch.apply")).toBe(false);
    expect(snapshotBeforeApply.right.confirmationQueue.maintenance).toEqual([
      expect.objectContaining({
        kind: "maintenance",
        maintenanceApplicationManifestId: manifest.id,
        actions: [expect.objectContaining({
          actionType: "maintenance.canonical-patch.apply",
          maintenanceApplicationManifestId: manifest.id,
          requiresConfirmation: true,
        })],
      }),
    ]);
    await expect(executeWorkbenchAction({ project: project(), path: getTempDir() }, {
      actionType: "maintenance.canonical-patch.apply",
      maintenanceApplicationManifestId: manifest.id,
      confirm: false,
    })).rejects.toThrow("Mutating Workbench workflow actions require confirm: true.");
    await expect(executeWorkbenchAction({ project: project(), path: getTempDir() }, {
      actionType: "maintenance.canonical-patch.apply",
      maintenanceApplicationManifestId: "forged-manifest",
      confirm: true,
    })).rejects.toThrow("Workflow action target is stale or no longer available.");

    const applyResult = await executeWorkbenchAction({ project: project(), path: getTempDir() }, {
      actionType: "maintenance.canonical-patch.apply",
      maintenanceApplicationManifestId: manifest.id,
      confirm: true,
    });
    const applicationResults = await listMaintenanceCanonicalPatchApplicationResults(memory);
    const report = await generateMaintenanceCanonicalPatchApplicationReport(memory, applicationResults[0].id);
    const reports = await listMaintenanceCanonicalPatchApplicationReports(memory);

    expect(await readFile(memoryDocPath, "utf8")).toBe(updatedMemoryDoc);
    expect(applicationResults).toEqual([expect.objectContaining({
      manifestId: manifest.id,
      canonicalPatchApplied: true,
      policyAuditRefs: [expect.stringContaining("tool-events.jsonl")],
    })]);
    expect(reports).toEqual([expect.objectContaining({
      id: report.id,
      resultId: applicationResults[0].id,
      canonicalPatchApplied: false,
      executionStarted: false,
    })]);
    expect((applyResult.snapshot as Awaited<ReturnType<typeof getWorkbenchSnapshot>>).right.confirmationQueue.maintenance).toEqual([]);
    await expect(getWorkbenchMaintenanceProjection({ project: project(), path: getTempDir() })).resolves.toMatchObject({
      applicationResultCount: 1,
      applicationReportCount: 1,
      latestApplicationResult: expect.objectContaining({
        manifestId: manifest.id,
        canonicalPatchApplied: true,
      }),
      latestApplicationReport: expect.objectContaining({
        id: report.id,
        resultId: applicationResults[0].id,
        canonicalPatchApplied: false,
      }),
    });
    await expect(getWorkbenchSnapshot({ project: project(), path: getTempDir() })).resolves.toMatchObject({
      right: {
        confirmationQueue: {
          maintenance: [],
        },
      },
    });
  });
});
