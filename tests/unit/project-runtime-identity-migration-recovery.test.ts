import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  recoverProjectIdentityMigration,
  type RecoverProjectIdentityMigrationOptions,
  type ProjectIdentityMigrationJournal,
} from "../../src/project-runtime/identity-migration.js";
import { renameIdentityMigrationPath } from "../../src/project-runtime/identity-migration-fs.js";

const SOURCE_ID = "aho-self";
const TARGET_ID = "agent-harness-orchestrator-a6ad344cbe4e";
const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("project identity migration Windows rename and recovery", () => {
  it("retries transient Windows rename failures without widening the target", async () => {
    const renamePath = vi.fn(async () => undefined);
    renamePath
      .mockRejectedValueOnce(Object.assign(new Error("busy"), { code: "EPERM" }))
      .mockRejectedValueOnce(Object.assign(new Error("locked"), { code: "EBUSY" }));
    const delays: number[] = [];

    await renameIdentityMigrationPath("source", "target", {
      platform: "win32",
      renamePath,
      wait: async (milliseconds) => { delays.push(milliseconds); },
    });

    expect(renamePath).toHaveBeenCalledTimes(3);
    expect(renamePath.mock.calls.every(([source, target]) => source === "source" && target === "target")).toBe(true);
    expect(delays).toEqual([10, 25]);
  });

  it("rolls back a crash after the staged sidecar was published but before structured state switched", async () => {
    const fixture = await createRecoveryFixture("recover-published", "target-sidecar-published");
    await rename(fixture.sourceSidecarRoot, fixture.previousSidecarRoot);
    await rename(fixture.stagedSidecarRoot, fixture.targetSidecarRoot);
    await writeJournal(fixture.journalPath, fixture.journal);

    const recovered = await recoverProjectIdentityMigration(fixture.recoveryOptions);

    expect(recovered.stage).toBe("rolled-back");
    expect(existsSync(fixture.sourceSidecarRoot)).toBe(true);
    expect(existsSync(fixture.targetSidecarRoot)).toBe(false);
    expect(await readFile(join(fixture.sourceSidecarRoot, "identity.txt"), "utf8")).toBe(`${SOURCE_ID}\n`);
    expect(await readFile(fixture.registryPath, "utf8")).toContain(`"id": "${SOURCE_ID}"`);
    expect(existsSync(fixture.registryStagedPath)).toBe(false);
    expect((await readJournal(fixture.journalPath)).stage).toBe("rolled-back");
  });

  it("restores an external document whose rename completed before its journal state was flushed", async () => {
    const fixture = await createRecoveryFixture("recover-document-window", "target-sidecar-published");
    await rename(fixture.sourceSidecarRoot, fixture.previousSidecarRoot);
    await rename(fixture.stagedSidecarRoot, fixture.targetSidecarRoot);
    await rename(fixture.registryPath, fixture.registryBackupPath);
    await rename(fixture.registryStagedPath, fixture.registryPath);
    await writeJournal(fixture.journalPath, fixture.journal);

    const recovered = await recoverProjectIdentityMigration(fixture.recoveryOptions);

    expect(recovered.stage).toBe("rolled-back");
    expect(await readFile(fixture.registryPath, "utf8")).toContain(`"id": "${SOURCE_ID}"`);
    expect(existsSync(fixture.registryBackupPath)).toBe(false);
    expect(existsSync(fixture.sourceSidecarRoot)).toBe(true);
  });

  it("finishes cleanup after the durable commit point instead of resurrecting the old identity", async () => {
    const fixture = await createRecoveryFixture("recover-commit", "cleanup-in-progress");
    await rename(fixture.sourceSidecarRoot, fixture.previousSidecarRoot);
    await rename(fixture.stagedSidecarRoot, fixture.targetSidecarRoot);
    await rename(fixture.registryPath, fixture.registryBackupPath);
    await rename(fixture.registryStagedPath, fixture.registryPath);
    fixture.journal.documents[0].state = "published";
    await writeJournal(fixture.journalPath, fixture.journal);

    const recovered = await recoverProjectIdentityMigration(fixture.recoveryOptions);

    expect(recovered.stage).toBe("completed");
    expect(existsSync(fixture.sourceSidecarRoot)).toBe(false);
    expect(existsSync(fixture.previousSidecarRoot)).toBe(false);
    expect(existsSync(fixture.targetSidecarRoot)).toBe(true);
    expect(await readFile(join(fixture.targetSidecarRoot, "identity.txt"), "utf8")).toBe(`${TARGET_ID}\n`);
    expect(await readFile(fixture.registryPath, "utf8")).toContain(`"id": "${TARGET_ID}"`);
    expect(existsSync(fixture.registryBackupPath)).toBe(false);
    expect((await readJournal(fixture.journalPath)).stage).toBe("completed");
  });

  it("rejects a recovery journal whose external document is not in the caller-owned descriptor set", async () => {
    const fixture = await createRecoveryFixture("recover-path-tamper", "target-sidecar-published");
    const unrelatedPath = join(fixture.registryPath, "..", "unrelated.json");
    await writeFile(unrelatedPath, "preserve\n", "utf8");
    fixture.journal.documents[0].sourcePath = unrelatedPath;
    fixture.journal.documents[0].stagedPath = `${unrelatedPath}.${fixture.journal.transactionId}.next`;
    fixture.journal.documents[0].backupPath = `${unrelatedPath}.${fixture.journal.transactionId}.previous`;
    await writeJournal(fixture.journalPath, fixture.journal);

    await expect(recoverProjectIdentityMigration(fixture.recoveryOptions)).rejects.toThrow(/document set does not match/);

    expect(await readFile(unrelatedPath, "utf8")).toBe("preserve\n");
    expect(existsSync(fixture.sourceSidecarRoot)).toBe(true);
  });

  it("refuses rollback rather than deleting a concurrently changed published document", async () => {
    const fixture = await createRecoveryFixture("recover-concurrent-document", "target-sidecar-published");
    await rename(fixture.sourceSidecarRoot, fixture.previousSidecarRoot);
    await rename(fixture.stagedSidecarRoot, fixture.targetSidecarRoot);
    await rename(fixture.registryPath, fixture.registryBackupPath);
    await rename(fixture.registryStagedPath, fixture.registryPath);
    await writeFile(fixture.registryPath, `${JSON.stringify({ projects: [{ id: TARGET_ID, concurrent: true }] }, null, 2)}\n`, "utf8");
    await writeJournal(fixture.journalPath, fixture.journal);

    await expect(recoverProjectIdentityMigration(fixture.recoveryOptions)).rejects.toThrow(/changed before rollback/);

    expect(await readFile(fixture.registryPath, "utf8")).toContain("concurrent");
    expect(existsSync(fixture.registryBackupPath)).toBe(true);
  });

  it("validates the complete rollback set before restoring any external document", async () => {
    const fixture = await createRecoveryFixture("recover-two-phase", "target-sidecar-published");
    await rename(fixture.sourceSidecarRoot, fixture.previousSidecarRoot);
    await rename(fixture.stagedSidecarRoot, fixture.targetSidecarRoot);
    await rename(fixture.registryPath, fixture.registryBackupPath);
    await rename(fixture.registryStagedPath, fixture.registryPath);
    await writeFile(join(fixture.targetSidecarRoot, "concurrent.txt"), "preserve\n", "utf8");
    await writeJournal(fixture.journalPath, fixture.journal);

    await expect(recoverProjectIdentityMigration(fixture.recoveryOptions)).rejects.toThrow(/target runtime sidecar changed/);

    expect(await readFile(fixture.registryPath, "utf8")).toContain(`"id": "${TARGET_ID}"`);
    expect(existsSync(fixture.registryBackupPath)).toBe(true);
    expect(existsSync(fixture.previousSidecarRoot)).toBe(true);
    expect(await readFile(join(fixture.targetSidecarRoot, "concurrent.txt"), "utf8")).toBe("preserve\n");
  });
});

async function createRecoveryFixture(
  transactionId: string,
  stage: ProjectIdentityMigrationJournal["stage"],
): Promise<{
  sourceSidecarRoot: string;
  targetSidecarRoot: string;
  stagedSidecarRoot: string;
  previousSidecarRoot: string;
  registryPath: string;
  registryStagedPath: string;
  registryBackupPath: string;
  journalPath: string;
  journal: ProjectIdentityMigrationJournal;
  recoveryOptions: RecoverProjectIdentityMigrationOptions;
}> {
  const root = await mkdtemp(join(tmpdir(), "aho-identity-recovery-"));
  cleanup.push(root);
  const projectsRoot = join(root, "projects");
  const sourceSidecarRoot = join(projectsRoot, SOURCE_ID);
  const targetSidecarRoot = join(projectsRoot, TARGET_ID);
  const stagedSidecarRoot = join(projectsRoot, `.${TARGET_ID}.${transactionId}.staged`);
  const previousSidecarRoot = join(projectsRoot, `.${SOURCE_ID}.${transactionId}.previous`);
  const transactionDirectory = join(projectsRoot, ".identity-transactions", transactionId);
  const journalPath = join(transactionDirectory, "journal.json");
  const manifestPath = join(root, "skill", "state", "manifest.json");
  const registryPath = join(root, "registry.json");
  const registryStagedPath = `${registryPath}.${transactionId}.next`;
  const registryBackupPath = `${registryPath}.${transactionId}.previous`;
  await mkdir(sourceSidecarRoot, { recursive: true });
  await mkdir(stagedSidecarRoot, { recursive: true });
  await mkdir(join(manifestPath, ".."), { recursive: true });
  await mkdir(transactionDirectory, { recursive: true });
  await writeFile(join(sourceSidecarRoot, "identity.txt"), `${SOURCE_ID}\n`, "utf8");
  await writeFile(join(stagedSidecarRoot, "identity.txt"), `${TARGET_ID}\n`, "utf8");
  await writeFile(manifestPath, `${JSON.stringify({ schema_version: "2.0", project_id: TARGET_ID })}\n`, "utf8");
  await writeFile(registryPath, `${JSON.stringify({ projects: [{ id: SOURCE_ID }] }, null, 2)}\n`, "utf8");
  await writeFile(registryStagedPath, `${JSON.stringify({ projects: [{ id: TARGET_ID }] }, null, 2)}\n`, "utf8");
  const manifestContentHash = await hashFile(manifestPath);
  const sourceSidecarFingerprint = await hashTree(sourceSidecarRoot);
  const stagedSidecarFingerprint = await hashTree(stagedSidecarRoot);
  const beforeContentHash = await hashFile(registryPath);
  const afterContentHash = await hashFile(registryStagedPath);
  const now = new Date().toISOString();
  const journal: ProjectIdentityMigrationJournal = {
    schemaVersion: "1.0",
    transactionId,
    sourceProjectId: SOURCE_ID,
    targetProjectId: TARGET_ID,
    manifestPath,
    sourceSidecarRoot,
    targetSidecarRoot,
    stagedSidecarRoot,
    previousSidecarRoot,
    journalPath,
    manifestContentHash,
    sourceSidecarFingerprint,
    stagedSidecarFingerprint,
    stage,
    sqliteProofs: [],
    documents: [{
      kind: "registry",
      scope: "external",
      sourcePath: registryPath,
      stagedPath: registryStagedPath,
      backupPath: registryBackupPath,
      allowedIdentityPaths: ["/projects/*/id"],
      required: true,
      matchCount: 1,
      beforeContentHash,
      afterContentHash,
      beforeIdentityNeutralHash: "a".repeat(64),
      afterIdentityNeutralHash: "a".repeat(64),
      state: "prepared",
    }],
    error: null,
    createdAt: now,
    updatedAt: now,
  };
  return {
    sourceSidecarRoot,
    targetSidecarRoot,
    stagedSidecarRoot,
    previousSidecarRoot,
    registryPath,
    registryStagedPath,
    registryBackupPath,
    journalPath,
    journal,
    recoveryOptions: {
      journalPath,
      sourceProjectId: SOURCE_ID,
      targetProjectId: TARGET_ID,
      manifestPath,
      sourceSidecarRoot,
      targetSidecarRoot,
      jsonDocuments: [{
        kind: "registry",
        scope: "external",
        path: registryPath,
        allowedIdentityPaths: ["/projects/*/id"],
      }],
    },
  };
}

async function writeJournal(path: string, journal: ProjectIdentityMigrationJournal): Promise<void> {
  await writeFile(path, `${JSON.stringify(journal, null, 2)}\n`, "utf8");
}

async function readJournal(path: string): Promise<ProjectIdentityMigrationJournal> {
  return JSON.parse(await readFile(path, "utf8")) as ProjectIdentityMigrationJournal;
}

async function hashFile(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function hashTree(root: string): Promise<string> {
  const records: string[] = [];
  await visit(root);
  return createHash("sha256").update(records.sort().join("\n")).digest("hex");

  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else records.push(`${relative(root, path).replace(/\\/g, "/")}\0${await hashFile(path)}`);
    }
  }
}
