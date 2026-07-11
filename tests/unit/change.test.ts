import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildAcMap, parseAcceptanceCriteria, parseReviewStatus, parseTasks } from "../../src/ecl/anchors.js";
import { abandonChangeForChange, assertChangeFinalizationReady, closeChange, closeChangeForChange, createChange, createConcurrentChange, getChangeStatus, getChangeStatusForChange, recoverChangeCloseTransactions } from "../../src/change/manager.js";
import { resolveCloseableChangeTarget, resolveRunnableChangeTarget } from "../../src/change/target.js";
import { initHarness } from "../../src/harness/init.js";
import { resolveProjectMemory } from "../../src/memory/resolver.js";
import { claimTransitionExecution, issueLocalExecutionAuthorization, markTransitionExecutionStarted, readTransitionExecution, reserveTransitionExecutionCommitPoint, revokeLocalExecutionAuthorization } from "../../src/workflow-runtime/execution-authorization.js";
import type { ExecutionAuthorizationSnapshot, ManagedProject } from "../../src/types/index.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "aho-change-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

function project(path: string): ManagedProject {
  return {
    id: "repo",
    name: "Repo",
    path,
    addedAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
  };
}

async function rewriteChangeMetadata(changeId: string, update: Record<string, unknown>): Promise<void> {
  const path = join(tempDir, "harness", "changes", "active", changeId, "change.json");
  const metadata = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  await writeFile(path, `${JSON.stringify({ ...metadata, ...update }, null, 2)}\n`, "utf8");
}

describe("change parsing", () => {
  it("parses and normalizes AC IDs", () => {
    const parsed = parseAcceptanceCriteria("- ac-001: First\n- AC-002: Second\n- AC-001: Duplicate");

    expect(parsed.criteria.map((item) => item.id)).toEqual(["AC-001", "AC-002", "AC-001"]);
    expect(parsed.duplicateIds).toEqual(["AC-001"]);
  });

  it("parses task AC mappings", () => {
    const parsed = parseTasks("- [ ] T-001: Do it\n  - Covers: ac-001, AC-002\n- [x] T-002: Done");

    expect(parsed.tasks[0]).toMatchObject({ id: "T-001", acIds: ["AC-001", "AC-002"], done: false });
    expect(parsed.tasks[1]).toMatchObject({ id: "T-002", acIds: [], done: true });
  });

  it("builds AC map warnings and blocking issues", () => {
    const map = buildAcMap({
      changeId: "demo",
      specContent: "- AC-001: Exists",
      tasksContent: "- [ ] T-001: Bad ref\n  - Covers: AC-999",
      placeholderFiles: [{ path: "plan.md", content: "TBD" }],
    });

    expect(map.blockingIssues).toContain("Task T-001 references unknown Acceptance Criterion AC-999.");
    expect(map.warnings).toContain("plan.md:1 unresolved placeholder: TBD");
  });

  it("parses review status", () => {
    expect(parseReviewStatus("Status: approved-with-notes\n")).toBe("approved-with-notes");
    expect(parseReviewStatus("\uFEFFStatus: approved\n")).toBe("approved");
    expect(parseReviewStatus("Status: not-required\n")).toBe("unknown");
    expect(parseReviewStatus(null)).toBe("missing");
  });
});

describe("change manager", () => {
  it("creates an active change and generated ac-map", async () => {
    await initHarness(project(tempDir));
    const result = await createChange(project(tempDir), { title: "Add Sample Workflow", body: "Raw user request" });

    expect(result.change.id).toBe("add-sample-workflow");
    expect(result.acMap.acceptanceCriteria[0]?.id).toBe("AC-001");
    expect(await readFile(join(tempDir, "harness", "changes", "active", "add-sample-workflow", "summary.md"), "utf8")).toContain("Raw user request");
    expect(JSON.parse(await readFile(join(tempDir, "harness", "changes", "active", "add-sample-workflow", "spec-tests.json"), "utf8"))).toMatchObject({ changeId: "add-sample-workflow", mappings: [] });
  });

  it("falls back to bundled templates when target change templates are missing", async () => {
    await initHarness(project(tempDir));
    await rm(join(tempDir, "harness", "templates", "change"), { recursive: true, force: true });

    const result = await createChange(project(tempDir), { title: "Fallback Template" });

    expect(result.change.id).toBe("fallback-template");
    expect(result.acMap.acceptanceCriteria).toHaveLength(1);
  });

  it("aborts creating a second active change", async () => {
    await initHarness(project(tempDir));
    await createChange(project(tempDir), { title: "First" });

    await expect(createChange(project(tempDir), { title: "Second" })).rejects.toThrow("active change");
  });

  it("resolves explicit Change targets without requiring a single active change", async () => {
    await initHarness(project(tempDir));
    await createChange(project(tempDir), { title: "First Target" });
    await createConcurrentChange(project(tempDir), { title: "Second Target" });

    await expect(resolveRunnableChangeTarget(project(tempDir))).rejects.toThrow("expected exactly one active change");
    const target = await resolveRunnableChangeTarget(project(tempDir), { changeId: "second-target" });

    expect(target).toMatchObject({
      changeId: "second-target",
      source: "explicit-change-id",
      capability: "runnable",
    });
    expect(target.status.change?.id).toBe("second-target");
  });

  it("rejects missing scoped Change targets and disabled legacy fallback", async () => {
    await initHarness(project(tempDir));

    await expect(resolveRunnableChangeTarget(project(tempDir))).rejects.toThrow("no active change");
    await expect(resolveRunnableChangeTarget(project(tempDir), { allowLegacyActiveFallback: false })).rejects.toThrow("explicit changeId required");
    await expect(resolveCloseableChangeTarget(project(tempDir), { changeId: "missing-demand" })).rejects.toThrow("Active demand conversation not found for scoped run: missing-demand");
  });

  it("rejects archived Change targets for scoped writable capabilities", async () => {
    await initHarness(project(tempDir));
    await createChange(project(tempDir), { title: "Archived Target" });
    await writeFile(join(tempDir, "harness", "changes", "active", "archived-target", "reviews", "review.md"), "Status: approved\n", "utf8");
    await closeChangeForChange(project(tempDir), "archived-target");

    await expect(resolveRunnableChangeTarget(project(tempDir), { changeId: "archived-target" })).rejects.toThrow("Active demand conversation not found for scoped run: archived-target");
    await expect(resolveCloseableChangeTarget(project(tempDir), { changeId: "archived-target" })).rejects.toThrow("Active demand conversation not found for scoped run: archived-target");
  });

  it("fails closed when active Change metadata id does not match its directory", async () => {
    await initHarness(project(tempDir));
    await createChange(project(tempDir), { title: "Forged Metadata Target" });
    await rewriteChangeMetadata("forged-metadata-target", { id: "forged-demand", title: "Forged demand" });

    const scoped = await getChangeStatusForChange(project(tempDir), "forged-metadata-target");
    const legacy = await getChangeStatus(project(tempDir));

    expect(scoped.change).toBeNull();
    expect(scoped.closeGate.ready).toBe(false);
    expect(scoped.closeGate.blockingIssues).toEqual(expect.arrayContaining([
      "Change metadata id mismatch: directory forged-metadata-target contains forged-demand.",
    ]));
    expect(legacy.change).toBeNull();
    expect(legacy.closeGate.blockingIssues).toEqual(expect.arrayContaining([
      "Change metadata id mismatch: directory forged-metadata-target contains forged-demand.",
    ]));

    await expect(closeChangeForChange(project(tempDir), "forged-metadata-target")).rejects.toThrow("Change metadata id mismatch");
    await expect(abandonChangeForChange(project(tempDir), "forged-metadata-target")).rejects.toThrow("Change metadata id mismatch");
  });

  it("blocks close while review is pending and archives when approved", async () => {
    await initHarness(project(tempDir));
    await createChange(project(tempDir), { title: "Closable" });

    await expect(closeChange(tempDir)).rejects.toThrow("Review status is pending");

    const reviewPath = join(tempDir, "harness", "changes", "active", "closable", "reviews", "review.md");
    await writeFile(reviewPath, "# Review\n\nStatus: approved\n", "utf8");
    const closed = await closeChange(tempDir);
    const status = await getChangeStatus(tempDir);

    expect(closed.archivePath).toMatch(/harness\/changes\/archive\/\d{8}-closable/);
    expect(status.activeChanges).toHaveLength(0);
  });

  it("uses archive collision suffix", async () => {
    await initHarness(project(tempDir));
    await mkdir(join(tempDir, "harness", "changes", "archive", `${localDate()}-collision`), { recursive: true });
    await createChange(project(tempDir), { title: "Collision" });
    await writeFile(join(tempDir, "harness", "changes", "active", "collision", "reviews", "review.md"), "Status: approved\n", "utf8");

    const closed = await closeChange(tempDir);

    expect(closed.archivePath).toMatch(/collision-\d{6}$/);
  });

  it("keeps automatic finalization stricter than the administrative close gate", async () => {
    await initHarness(project(tempDir));
    await createChange(project(tempDir), { title: "Strict Finalization" });
    await writeFile(join(tempDir, "harness", "changes", "active", "strict-finalization", "reviews", "review.md"), "Status: approved\n", "utf8");

    await expect(assertChangeFinalizationReady(project(tempDir), "strict-finalization"))
      .rejects.toThrow(/passed latest validation/);
    await expect(closeChangeForChange(project(tempDir), "strict-finalization")).resolves.toMatchObject({
      change: { id: "strict-finalization" },
    });
  });

  it("returns one close receipt on duplicate close and recovers post-rename side effects", async () => {
    await initHarness(project(tempDir));
    await createChange(project(tempDir), { title: "Recover Close" });
    await writeFile(join(tempDir, "harness", "changes", "active", "recover-close", "reviews", "review.md"), "Status: approved\n", "utf8");
    const closed = await closeChangeForChange(project(tempDir), "recover-close");
    const markerPath = join(tempDir, "harness", "changes", ".close-transactions", "recover-close.json");
    const marker = JSON.parse(await readFile(markerPath, "utf8")) as Record<string, unknown>;
    expect(marker.stage).toBe("completed");
    expect(closed.receiptPath).toBe(`${closed.archivePath}/close-receipt.json`);

    await rm(join(tempDir, closed.receiptPath as string), { force: true });
    await rm(marker.outboxPath as string, { force: true });
    const recovered = await closeChangeForChange(project(tempDir), "recover-close");

    expect(recovered.transactionId).toBe(closed.transactionId);
    expect(JSON.parse(await readFile(markerPath, "utf8"))).toMatchObject({ stage: "completed" });
    expect(JSON.parse(await readFile(marker.outboxPath as string, "utf8"))).toMatchObject({ type: "change.closed", changeId: "recover-close" });
  });

  it.each(["expired", "revoked"] as const)("does not write Change metadata from prepared close when authority is %s", async (mode) => {
    const fixture = await prepareAuthorizedCloseRecovery(mode);
    const before = await readFile(fixture.changeMetadataPath);

    await expect(recoverChangeCloseTransactions(project(tempDir))).rejects.toThrow(mode === "expired" ? "claim is expired" : /epoch|revoked/);

    expect(await readFile(fixture.changeMetadataPath)).toEqual(before);
    expect(JSON.parse(await readFile(fixture.changeMetadataPath, "utf8"))).toMatchObject({ state: "active" });
    expect((await readTransitionExecution(fixture.memory, fixture.operationId)).commitPointReservedAt).toBeFalsy();
  });

  it("continues a prepared close after its reserved commit point is revoked", async () => {
    const fixture = await prepareAuthorizedCloseRecovery("reserved-revoked");

    await expect(recoverChangeCloseTransactions(project(tempDir))).resolves.toHaveLength(1);

    expect(JSON.parse(await readFile(fixture.archiveMetadataPath, "utf8"))).toMatchObject({ state: "archived" });
    expect(await readTransitionExecution(fixture.memory, fixture.operationId)).toMatchObject({
      status: "completed",
      commitPointReservedAt: expect.any(String),
    });
  });

  it("allocates stable unique ids for non-latin concurrent demand titles", async () => {
    await initHarness(project(tempDir));

    const first = await createConcurrentChange(project(tempDir), { title: "验证左侧会话历史第一条" });
    const second = await createConcurrentChange(project(tempDir), { title: "验证左侧会话历史第二条" });

    expect(first.change.id).toMatch(/^project-[a-f0-9]{8}$/);
    expect(second.change.id).toMatch(/^project-[a-f0-9]{8}$/);
    expect(second.change.id).not.toBe(first.change.id);
  });
});

function localDate(date = new Date()): string {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
}

async function prepareAuthorizedCloseRecovery(mode: "expired" | "revoked" | "reserved-revoked") {
  const hash = "a".repeat(64);
  await initHarness(project(tempDir));
  await createChange(project(tempDir), { title: "Prepared Authority" });
  const memory = await resolveProjectMemory(project(tempDir));
  const changeId = "prepared-authority";
  const now = new Date();
  const claimNow = mode === "expired" ? new Date(now.getTime() - 10_000) : now;
  const authorization = await issueLocalExecutionAuthorization(memory, {
    projectId: memory.projectId,
    changeId,
    conversationId: "conversation-prepared",
    providerThreadId: "thread-prepared",
    goalIdentityHash: hash,
    mode: "stepwise",
    acceptedPlanId: "plan-prepared",
    acceptedPlanHash: hash,
    graphId: "graph-prepared",
    graphHash: hash,
    artifactManifestHash: hash,
    sourceHead: "commit-prepared",
    sourceStateHash: hash,
    permissionProfileHash: hash,
    providerScopeHash: hash,
    policyHash: hash,
    targets: [{ transition: "change.finalize", targetId: changeId, manifestHash: hash }],
    budget: { maxCompletedOperations: 1, maxReworks: 0, maxChangedFiles: 1, maxChangedBytes: 1 },
    userDecision: { decisionId: `decision-${mode}`, actorId: "user", decidedAt: claimNow.toISOString() },
    issuedAt: claimNow.toISOString(),
    expiresAt: new Date(now.getTime() + 60_000).toISOString(),
  });
  const snapshot: ExecutionAuthorizationSnapshot = {
    acceptedPlanHash: hash, graphHash: hash, artifactManifestHash: hash, sourceHead: "commit-prepared",
    sourceStateHash: hash, permissionProfileHash: hash, providerScopeHash: hash, policyHash: hash,
  };
  const claim = await claimTransitionExecution(memory, {
    authorizationId: authorization.id,
    authorizationEpoch: authorization.epoch,
    transition: "change.finalize",
    targetId: changeId,
    manifestHash: hash,
    snapshot,
    claimedBy: "change-finalization",
    claimTtlMs: mode === "expired" ? 1_000 : 60_000,
    now: claimNow,
  });
  await markTransitionExecutionStarted(memory, claim.operationId, claim.claimToken, claim.fencingToken, claimNow);
  if (mode === "reserved-revoked") {
    await reserveTransitionExecutionCommitPoint(memory, {
      operationId: claim.operationId, authorizationId: authorization.id, authorizationEpoch: authorization.epoch,
      transition: "change.finalize", targetId: changeId, manifestHash: hash,
      claimToken: claim.claimToken, fencingToken: claim.fencingToken, now,
    });
  }
  if (mode === "revoked" || mode === "reserved-revoked") {
    await revokeLocalExecutionAuthorization(memory, authorization.id, "cancel before rename", new Date(now.getTime() + 1));
  }
  const activePath = join(memory.changesRoot, "active", changeId);
  const archiveRelativePath = `harness/changes/archive/20990101-${changeId}`;
  const archivePath = join(memory.memoryRoot, archiveRelativePath);
  const marker = {
    version: "1.0", id: `close-${mode}`, projectId: memory.projectId, changeId, activePath, archivePath, archiveRelativePath,
    outboxPath: join(memory.harnessRoot, "outbox", "change-close", `close-${mode}.json`),
    receiptPath: `${archiveRelativePath}/close-receipt.json`, closeTimestamp: now.toISOString(), stage: "prepared", error: null,
    finalization: {
      requestId: `finalize-${hash}`, authorizationId: authorization.id, authorizationEpoch: authorization.epoch,
      conversationId: "conversation-prepared", providerThreadId: "thread-prepared", goalIdentityHash: hash, manifestHash: hash,
      operationId: claim.operationId, claimToken: claim.claimToken, fencingToken: claim.fencingToken,
    },
  };
  const markerRoot = join(memory.changesRoot, ".close-transactions");
  await mkdir(markerRoot, { recursive: true });
  await writeFile(join(markerRoot, `${changeId}.json`), `${JSON.stringify(marker, null, 2)}\n`, "utf8");
  return {
    changeMetadataPath: join(activePath, "change.json"),
    archiveMetadataPath: join(archivePath, "change.json"),
    memory,
    operationId: claim.operationId,
  };
}
