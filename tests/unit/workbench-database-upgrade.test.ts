import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveProjectRuntimePaths } from "../../src/project-runtime/paths.js";
import { WorkbenchDatabase } from "../../src/workbench/persistence/database.js";
import { inspectWorkbenchDatabaseUpgradeState } from "../../src/workbench/persistence/database-upgrade.js";
import { applyCurrentWorkbenchSchema, WORKBENCH_SCHEMA_VERSION } from "../../src/workbench/persistence/schema.js";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aho-database-upgrade-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("Workbench database upgrade safety", () => {
  it("preflights new, upgradeable, current, legacy, and future databases without mutating them", async () => {
    const emptyPaths = resolveProjectRuntimePaths("empty", root);
    await expect(inspectWorkbenchDatabaseUpgradeState(emptyPaths)).resolves.toEqual({ state: "ready", schemaVersion: 18 });

    for (const revision of [16, 17] as const) {
      const paths = resolveProjectRuntimePaths(`preflight-${revision}`, root);
      await createLegacyDatabase(paths.workbenchDbPath, revision);
      const before = await digest(paths.workbenchDbPath);
      await expect(inspectWorkbenchDatabaseUpgradeState(paths)).resolves.toEqual({ state: "upgrade-required", schemaVersion: revision });
      expect(await digest(paths.workbenchDbPath)).toBe(before);
    }

    const currentPaths = resolveProjectRuntimePaths("preflight-current", root);
    const current = await WorkbenchDatabase.open(currentPaths, noActiveWorkGuard());
    current.close();
    await expect(inspectWorkbenchDatabaseUpgradeState(currentPaths)).resolves.toEqual({ state: "ready", schemaVersion: 18 });

    for (const revision of [7, 99]) {
      const paths = resolveProjectRuntimePaths(`preflight-unsupported-${revision}`, root);
      await createLegacyDatabase(paths.workbenchDbPath, 16);
      const raw = new Database(paths.workbenchDbPath);
      raw.pragma(`user_version = ${revision}`);
      raw.close();
      await expect(inspectWorkbenchDatabaseUpgradeState(paths)).resolves.toEqual({
        state: revision > 18 ? "newer-version" : "unsupported-legacy",
        schemaVersion: revision,
      });
    }
  });

  it.each([16, 17] as const)("backs up and explicitly migrates Schema %i to 18", async (revision) => {
    const paths = resolveProjectRuntimePaths(`schema-${revision}`, root);
    await createLegacyDatabase(paths.workbenchDbPath, revision);

    const opened = await WorkbenchDatabase.open(paths, noActiveWorkGuard());
    opened.close();

    const inspected = new Database(paths.workbenchDbPath, { readonly: true });
    expect(Number(inspected.pragma("user_version", { simple: true }))).toBe(WORKBENCH_SCHEMA_VERSION);
    expect(inspected.prepare("SELECT text FROM canonical_timeline_items WHERE id = 'sentinel'").get()).toEqual({ text: "keep me" });
    inspected.close();

    const previousDir = join(dirname(paths.workbenchDbPath), "schema-upgrades", "previous");
    const receipt = JSON.parse(await readFile(join(previousDir, "receipt.json"), "utf8")) as Record<string, unknown>;
    expect(receipt).toMatchObject({ fromSchema: revision, toSchema: 18, result: "completed" });
    expect(receipt.appliedVersions).toEqual(revision === 16 ? [17, 18] : [18]);
    expect(receipt.preservedRecordCounts).toMatchObject({ canonical_timeline_items: 1 });
    expect(receipt.preservedIdentityDigest).toMatch(/^[a-f0-9]{64}$/);
    await expect(stat(join(previousDir, "workbench.sqlite"))).resolves.toBeTruthy();
  });

  it("does not create a backup for a current Schema-18 database", async () => {
    const paths = resolveProjectRuntimePaths("current", root);
    const first = await WorkbenchDatabase.open(paths, noActiveWorkGuard());
    first.close();
    const second = await WorkbenchDatabase.open(paths, noActiveWorkGuard());
    second.close();
    await expect(stat(join(dirname(paths.workbenchDbPath), "schema-upgrades"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each([7, 99])("fails closed and byte-preserves unsupported Schema %i", async (revision) => {
    const paths = resolveProjectRuntimePaths(`unsupported-${revision}`, root);
    await createLegacyDatabase(paths.workbenchDbPath, 16);
    const raw = new Database(paths.workbenchDbPath);
    raw.pragma(`user_version = ${revision}`);
    raw.close();
    const before = await digest(paths.workbenchDbPath);

    await expect(WorkbenchDatabase.open(paths, noActiveWorkGuard())).rejects.toMatchObject({
      code: revision > WORKBENCH_SCHEMA_VERSION ? "newer-version" : "unsupported-legacy",
    });
    expect(await digest(paths.workbenchDbPath)).toBe(before);
  });

  it("restores the original database and suppresses an identical failed retry", async () => {
    const paths = resolveProjectRuntimePaths("failed", root);
    await createLegacyDatabase(paths.workbenchDbPath, 16);
    let migrationAttempts = 0;
    const beforeGuard = noActiveWorkGuard();
    await expect(WorkbenchDatabase.open(paths, beforeGuard, undefined, {
      createTransactionId: () => "forced-failure",
      now: () => "2026-09-11T00:00:00.000Z",
      beforeMigration: () => {
        migrationAttempts += 1;
        throw new Error("injected migration failure");
      },
    })).rejects.toMatchObject({ code: "recovery-required" });
    expect(migrationAttempts).toBe(1);

    const restored = new Database(paths.workbenchDbPath, { readonly: true });
    expect(Number(restored.pragma("user_version", { simple: true }))).toBe(16);
    expect(restored.prepare("SELECT text FROM canonical_timeline_items WHERE id = 'sentinel'").get()).toEqual({ text: "keep me" });
    restored.close();
    const recoveryDir = join(dirname(paths.workbenchDbPath), "schema-upgrades", "recovery");
    const receipt = JSON.parse(await readFile(join(recoveryDir, "receipt.json"), "utf8")) as Record<string, unknown>;
    expect(receipt).toMatchObject({ fromSchema: 16, toSchema: 18, result: "restored" });

    await expect(WorkbenchDatabase.open(paths, noActiveWorkGuard(), undefined, {
      beforeMigration: () => {
        migrationAttempts += 1;
      },
    })).rejects.toMatchObject({ code: "recovery-required" });
    expect(migrationAttempts).toBe(1);
    expect((await readdir(join(dirname(paths.workbenchDbPath), "schema-upgrades"))).filter((name) => name.startsWith("staging-"))).toEqual([]);
  });

  it("fails closed when a recovery marker exists but cannot be trusted", async () => {
    const paths = resolveProjectRuntimePaths("invalid-marker", root);
    await createLegacyDatabase(paths.workbenchDbPath, 16);
    const markerPath = join(dirname(paths.workbenchDbPath), "schema-upgrades", "recovery-required.json");
    await mkdir(dirname(markerPath), { recursive: true });
    await writeFile(markerPath, "{not-json", "utf8");

    await expect(WorkbenchDatabase.open(paths, noActiveWorkGuard())).rejects.toMatchObject({
      code: "recovery-required",
    });
  });

  it("rejects a current-version database whose required structure is damaged", async () => {
    const paths = resolveProjectRuntimePaths("damaged-current", root);
    const opened = await WorkbenchDatabase.open(paths, noActiveWorkGuard());
    opened.close();
    const raw = new Database(paths.workbenchDbPath);
    raw.exec("DROP TABLE conversation_review_operations");
    raw.close();

    await expect(WorkbenchDatabase.open(paths, noActiveWorkGuard())).rejects.toMatchObject({ code: "corrupt" });
  });

  it("rejects an incomplete supported migration source without filling in missing durable data", async () => {
    const paths = resolveProjectRuntimePaths("damaged-supported", root);
    await createLegacyDatabase(paths.workbenchDbPath, 16);
    const raw = new Database(paths.workbenchDbPath);
    raw.exec("DROP TABLE provider_resume_points");
    raw.close();
    const before = await digest(paths.workbenchDbPath);

    await expect(inspectWorkbenchDatabaseUpgradeState(paths)).resolves.toEqual({
      state: "recovery-required",
      schemaVersion: null,
    });
    await expect(WorkbenchDatabase.open(paths, noActiveWorkGuard())).rejects.toMatchObject({ code: "corrupt" });
    expect(await digest(paths.workbenchDbPath)).toBe(before);
  });

  it("restores a verified snapshot after an interrupted staged migration", async () => {
    const paths = resolveProjectRuntimePaths("interrupted-staged", root);
    await createLegacyDatabase(paths.workbenchDbPath, 16);
    const stagingDir = join(dirname(paths.workbenchDbPath), "schema-upgrades", "staging-interrupted");
    const snapshotPath = join(stagingDir, "workbench.sqlite");
    await mkdir(stagingDir, { recursive: true });
    await copyFile(paths.workbenchDbPath, snapshotPath);
    await writeFile(join(stagingDir, "receipt.json"), `${JSON.stringify({
      schemaVersion: "1.0",
      transactionId: "interrupted",
      fromSchema: 16,
      toSchema: 18,
      migrationImplementationVersion: 1,
      sourceDigest: await digest(paths.workbenchDbPath),
      snapshotDigest: await digest(snapshotPath),
      preservedRecordCounts: {},
      preservedIdentityDigest: "test",
      appliedVersions: [],
      startedAt: "2026-09-11T00:00:00.000Z",
      completedAt: null,
      result: "staged",
    }, null, 2)}\n`, "utf8");

    await expect(WorkbenchDatabase.open(paths, noActiveWorkGuard())).rejects.toMatchObject({ code: "recovery-required" });
    const restored = new Database(paths.workbenchDbPath, { readonly: true });
    expect(Number(restored.pragma("user_version", { simple: true }))).toBe(16);
    restored.close();
    await expect(stat(join(dirname(paths.workbenchDbPath), "schema-upgrades", "recovery", "receipt.json"))).resolves.toBeTruthy();
  });

  it("finalizes a committed migration whose snapshot promotion was interrupted", async () => {
    const paths = resolveProjectRuntimePaths("interrupted-completed", root);
    await createLegacyDatabase(paths.workbenchDbPath, 17);
    const stagingDir = join(dirname(paths.workbenchDbPath), "schema-upgrades", "staging-completed");
    const snapshotPath = join(stagingDir, "workbench.sqlite");
    await mkdir(stagingDir, { recursive: true });
    await copyFile(paths.workbenchDbPath, snapshotPath);
    const raw = new Database(paths.workbenchDbPath);
    applyCurrentWorkbenchSchema(raw);
    raw.pragma("user_version = 18");
    raw.close();
    await writeFile(join(stagingDir, "receipt.json"), `${JSON.stringify({
      schemaVersion: "1.0",
      transactionId: "completed",
      fromSchema: 17,
      toSchema: 18,
      migrationImplementationVersion: 1,
      sourceDigest: await digest(snapshotPath),
      snapshotDigest: await digest(snapshotPath),
      preservedRecordCounts: {},
      preservedIdentityDigest: "test",
      appliedVersions: [18],
      startedAt: "2026-09-11T00:00:00.000Z",
      completedAt: "2026-09-11T00:00:01.000Z",
      result: "completed",
    }, null, 2)}\n`, "utf8");

    const opened = await WorkbenchDatabase.open(paths, noActiveWorkGuard());
    opened.close();
    await expect(stat(join(dirname(paths.workbenchDbPath), "schema-upgrades", "previous", "workbench.sqlite"))).resolves.toBeTruthy();
    await expect(stat(stagingDir)).rejects.toMatchObject({ code: "ENOENT" });
  });
});

function noActiveWorkGuard() {
  return { assertSafe: async () => undefined };
}

async function createLegacyDatabase(path: string, revision: 16 | 17): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const database = new Database(path);
  applyCurrentWorkbenchSchema(database);
  for (const row of database.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'").all() as Array<{ name: string }>) {
    database.exec(`DROP TRIGGER IF EXISTS ${row.name}`);
  }
  database.exec(`
    DROP TABLE conversation_review_operations;
    ALTER TABLE provider_attempts DROP COLUMN operation_kind;
    ALTER TABLE conversation_turn_queue_items DROP COLUMN review_target_json;
    ALTER TABLE conversation_turn_queue_items DROP COLUMN item_kind;
  `);
  if (revision === 16) {
    database.exec(`
      DROP TABLE conversation_lifecycle_operations;
      ALTER TABLE conversations DROP COLUMN lifecycle_revision;
      ALTER TABLE conversations DROP COLUMN archived_at;
      ALTER TABLE conversations DROP COLUMN archive_origin;
    `);
  }
  database.prepare(`INSERT INTO canonical_timeline_items (
    id, project_id, conversation_id, change_id, position, revision, agent_surface_id,
    initial_thread_input, type, timestamp, text, raw_json
  ) VALUES ('sentinel', 'project', '', '', 1, 1, 'main-agent', 0, 'user.message', '2026-09-11T00:00:00.000Z', 'keep me', '{}')`).run();
  database.pragma(`user_version = ${revision}`);
  database.close();
}

async function digest(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}
