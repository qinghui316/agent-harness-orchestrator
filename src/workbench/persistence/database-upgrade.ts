import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, readFile, readdir, rename, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import { writeJsonFile } from "../../fs/json.js";
import { acquireWorkbenchRuntimeMutationLock } from "../schema-rebuild-gate.js";
import type { WorkbenchMigrationGuard } from "./reset-guard.js";
import {
  initializeCurrentWorkbenchSchema,
  inspectWorkbenchSchema,
  migrateWorkbenchSchema,
  validateCurrentWorkbenchSchema,
  WorkbenchDatabaseCompatibilityError,
  WORKBENCH_MIGRATION_IMPLEMENTATION_VERSION,
} from "./schema-migrations.js";
import { WORKBENCH_SCHEMA_VERSION } from "./schema.js";

export interface WorkbenchMigrationReceipt {
  schemaVersion: "1.0";
  transactionId: string;
  fromSchema: number;
  toSchema: number;
  migrationImplementationVersion: number;
  sourceDigest: string;
  snapshotDigest: string;
  preservedRecordCounts: Readonly<Record<string, number>>;
  preservedIdentityDigest: string;
  appliedVersions: readonly number[];
  startedAt: string;
  completedAt: string | null;
  result: "staged" | "completed" | "restored";
}

interface WorkbenchRecoveryMarker {
  schemaVersion: "1.0";
  databaseDigest: string;
  fromSchema: number;
  toSchema: number;
  migrationImplementationVersion: number;
  createdAt: string;
}

export interface WorkbenchDatabaseUpgradeOptions {
  createTransactionId?: () => string;
  now?: () => string;
  beforeMigration?: (db: Database.Database) => void;
}

export type WorkbenchDatabaseUpgradeState =
  | { state: "ready"; schemaVersion: number }
  | { state: "upgrade-required"; schemaVersion: number | null }
  | { state: "recovery-required"; schemaVersion: number | null }
  | { state: "newer-version"; schemaVersion: number | null }
  | { state: "unsupported-legacy"; schemaVersion: number | null };

export async function inspectWorkbenchDatabaseUpgradeState(
  paths: { workbenchDbPath: string },
): Promise<WorkbenchDatabaseUpgradeState> {
  const upgradePaths = resolveUpgradePaths(paths.workbenchDbPath);
  try {
    const marker = await readRecoveryMarker(upgradePaths.recoveryMarkerPath);
    if (marker) return { state: "recovery-required", schemaVersion: marker.fromSchema };
    const staging = await readdir(upgradePaths.root, { withFileTypes: true })
      .then((entries) => entries.some((entry) => entry.isDirectory() && entry.name.startsWith("staging-")), (error) => {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
        throw error;
      });
    if (staging) return { state: "upgrade-required", schemaVersion: null };
    if (!await pathExists(paths.workbenchDbPath)) return { state: "ready", schemaVersion: WORKBENCH_SCHEMA_VERSION };
    const database = new Database(paths.workbenchDbPath, { readonly: true, fileMustExist: true });
    try {
      const inspection = inspectWorkbenchSchema(database);
      if (inspection.kind === "new") return { state: "ready", schemaVersion: WORKBENCH_SCHEMA_VERSION };
      if (inspection.kind === "upgrade") return { state: "upgrade-required", schemaVersion: inspection.currentVersion };
      validateCurrentWorkbenchSchema(database);
      return { state: "ready", schemaVersion: inspection.currentVersion };
    } finally {
      database.close();
    }
  } catch (cause) {
    if (cause instanceof WorkbenchDatabaseCompatibilityError) {
      if (cause.code === "newer-version") return { state: "newer-version", schemaVersion: readSchemaVersion(paths.workbenchDbPath) };
      if (cause.code === "unsupported-legacy") return { state: "unsupported-legacy", schemaVersion: readSchemaVersion(paths.workbenchDbPath) };
      return { state: "recovery-required", schemaVersion: null };
    }
    return { state: "recovery-required", schemaVersion: null };
  }
}

export async function openSafeWorkbenchConnection(
  paths: { workbenchDbPath: string },
  migrationGuard: WorkbenchMigrationGuard,
  options: WorkbenchDatabaseUpgradeOptions = {},
): Promise<Database.Database> {
  await mkdir(dirname(paths.workbenchDbPath), { recursive: true });
  await reconcileInterruptedUpgrade(paths);
  const databaseExisted = await pathExists(paths.workbenchDbPath);
  let connection: Database.Database;
  try {
    connection = new Database(paths.workbenchDbPath);
  } catch (cause) {
    throw new WorkbenchDatabaseCompatibilityError("corrupt", "这个项目的数据无法读取。", { cause });
  }

  let inspection;
  try {
    inspection = inspectWorkbenchSchema(connection);
  } catch (error) {
    connection.close();
    throw error;
  }

  if (inspection.kind === "new") {
    try {
      connection.exec("BEGIN EXCLUSIVE");
      initializeCurrentWorkbenchSchema(connection);
      connection.exec("COMMIT");
      configureRuntimeConnection(connection);
      return connection;
    } catch (cause) {
      if (connection.inTransaction) connection.exec("ROLLBACK");
      connection.close();
      if (!databaseExisted) {
        await rm(paths.workbenchDbPath, { force: true });
        await rm(`${paths.workbenchDbPath}-wal`, { force: true });
        await rm(`${paths.workbenchDbPath}-shm`, { force: true });
      }
      throw new WorkbenchDatabaseCompatibilityError("corrupt", "这个项目的数据无法初始化。", { cause });
    }
  }

  if (inspection.kind === "current") {
    try {
      validateCurrentWorkbenchSchema(connection);
      configureRuntimeConnection(connection);
      return connection;
    } catch (cause) {
      connection.close();
      throw new WorkbenchDatabaseCompatibilityError("corrupt", "这个项目的数据完整性检查未通过。", { cause });
    }
  }

  const databaseDigest = await digestFile(paths.workbenchDbPath);
  const upgradePaths = resolveUpgradePaths(paths.workbenchDbPath);
  let marker: WorkbenchRecoveryMarker | null;
  try {
    marker = await readRecoveryMarker(upgradePaths.recoveryMarkerPath);
  } catch (cause) {
    connection.close();
    throw new WorkbenchDatabaseCompatibilityError("recovery-required", "这个项目的数据恢复记录无法读取。", { cause });
  }
  if (marker
    && marker.databaseDigest === databaseDigest
    && marker.fromSchema === inspection.currentVersion
    && marker.toSchema === WORKBENCH_SCHEMA_VERSION
    && marker.migrationImplementationVersion === WORKBENCH_MIGRATION_IMPLEMENTATION_VERSION) {
    connection.close();
    throw new WorkbenchDatabaseCompatibilityError("recovery-required", "这个项目的数据升级需要处理后才能重试。");
  }

  const lock = await acquireWorkbenchRuntimeMutationLock(paths, "升级 Workbench 数据");
  const createTransactionId = options.createTransactionId ?? (() => `schema-${randomUUID().toLowerCase()}`);
  const now = options.now ?? (() => new Date().toISOString());
  const transactionId = createTransactionId();
  const stagingDir = join(upgradePaths.root, `staging-${transactionId}`);
  const stagedSnapshotPath = join(stagingDir, "workbench.sqlite");
  const stagedReceiptPath = join(stagingDir, "receipt.json");
  let receipt: WorkbenchMigrationReceipt | null = null;
  try {
    await migrationGuard.assertSafe(connection);
    assertExclusiveMigrationAccess(connection);
    await mkdir(stagingDir, { recursive: true });
    connection.pragma("wal_checkpoint(TRUNCATE)");
    const sourceDigest = await digestFile(paths.workbenchDbPath);
    const preservedRecords = capturePreservedRecords(connection);
    await connection.backup(stagedSnapshotPath);
    const snapshotDigest = await digestFile(stagedSnapshotPath);
    receipt = {
      schemaVersion: "1.0",
      transactionId,
      fromSchema: inspection.currentVersion,
      toSchema: WORKBENCH_SCHEMA_VERSION,
      migrationImplementationVersion: WORKBENCH_MIGRATION_IMPLEMENTATION_VERSION,
      sourceDigest,
      snapshotDigest,
      preservedRecordCounts: preservedRecords.counts,
      preservedIdentityDigest: preservedRecords.identityDigest,
      appliedVersions: [],
      startedAt: now(),
      completedAt: null,
      result: "staged",
    };
    await writeJsonFile(stagedReceiptPath, receipt);

    beginExclusiveMigration(connection);
    options.beforeMigration?.(connection);
    const appliedVersions = migrateWorkbenchSchema(connection, inspection.currentVersion);
    assertPreservedRecords(connection, preservedRecords);
    connection.exec("COMMIT");
    receipt = {
      ...receipt,
      appliedVersions,
      completedAt: now(),
      result: "completed",
    };
    await writeJsonFile(stagedReceiptPath, receipt);
    await promotePreviousSnapshot(stagingDir, upgradePaths.previousDir);
    await rm(upgradePaths.recoveryDir, { recursive: true, force: true });
    await rm(upgradePaths.recoveryMarkerPath, { force: true });
    configureRuntimeConnection(connection);
    return connection;
  } catch (cause) {
    if (connection.inTransaction) connection.exec("ROLLBACK");
    connection.close();
    if (!receipt) {
      await rm(stagingDir, { recursive: true, force: true });
      throw cause;
    }
    try {
      await restoreDatabaseSnapshot(stagedSnapshotPath, paths.workbenchDbPath, transactionId);
      const restoredDigest = await digestFile(paths.workbenchDbPath);
      const restoredReceipt: WorkbenchMigrationReceipt = {
        ...receipt,
        completedAt: now(),
        result: "restored",
      };
      await writeJsonFile(stagedReceiptPath, restoredReceipt);
      await promoteRecoveryEvidence(stagingDir, upgradePaths.recoveryDir);
      await writeJsonFile(upgradePaths.recoveryMarkerPath, {
        schemaVersion: "1.0",
        databaseDigest: restoredDigest,
        fromSchema: inspection.currentVersion,
        toSchema: WORKBENCH_SCHEMA_VERSION,
        migrationImplementationVersion: WORKBENCH_MIGRATION_IMPLEMENTATION_VERSION,
        createdAt: now(),
      } satisfies WorkbenchRecoveryMarker);
    } catch (restoreCause) {
      throw new WorkbenchDatabaseCompatibilityError("recovery-required", "这个项目的数据升级和自动恢复均未完成。", { cause: restoreCause });
    }
    throw new WorkbenchDatabaseCompatibilityError("recovery-required", "这个项目的数据升级未完成，已恢复原有数据。", { cause });
  } finally {
    await lock.release();
  }
}

async function reconcileInterruptedUpgrade(paths: { workbenchDbPath: string }): Promise<void> {
  const upgradePaths = resolveUpgradePaths(paths.workbenchDbPath);
  const stagingDirectories = await readdir(upgradePaths.root, { withFileTypes: true })
    .then((entries) => entries.filter((entry) => entry.isDirectory() && entry.name.startsWith("staging-")), (error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    });
  if (stagingDirectories.length === 0) return;

  const lock = await acquireWorkbenchRuntimeMutationLock(paths, "恢复未完成的数据升级");
  try {
    for (const entry of stagingDirectories) {
      const stagingDir = join(upgradePaths.root, entry.name);
      const receiptPath = join(stagingDir, "receipt.json");
      const snapshotPath = join(stagingDir, "workbench.sqlite");
      if (!await pathExists(receiptPath)) {
        await rm(stagingDir, { recursive: true, force: true });
        continue;
      }
      const receipt = await readMigrationReceipt(receiptPath);
      if (!await pathExists(snapshotPath) || await digestFile(snapshotPath) !== receipt.snapshotDigest) {
        throw new WorkbenchDatabaseCompatibilityError("recovery-required", "这个项目的数据升级快照无法验证。");
      }
      if (receipt.result === "completed") {
        const current = openValidatedCurrentDatabase(paths.workbenchDbPath);
        current.close();
        await promotePreviousSnapshot(stagingDir, upgradePaths.previousDir);
        await rm(upgradePaths.recoveryDir, { recursive: true, force: true });
        await rm(upgradePaths.recoveryMarkerPath, { force: true });
        continue;
      }
      await restoreDatabaseSnapshot(snapshotPath, paths.workbenchDbPath, receipt.transactionId);
      const restoredDigest = await digestFile(paths.workbenchDbPath);
      const restoredAt = receipt.completedAt ?? new Date().toISOString();
      const restoredReceipt: WorkbenchMigrationReceipt = {
        ...receipt,
        completedAt: restoredAt,
        result: "restored",
      };
      await writeJsonFile(receiptPath, restoredReceipt);
      await promoteRecoveryEvidence(stagingDir, upgradePaths.recoveryDir);
      await writeJsonFile(upgradePaths.recoveryMarkerPath, {
        schemaVersion: "1.0",
        databaseDigest: restoredDigest,
        fromSchema: receipt.fromSchema,
        toSchema: receipt.toSchema,
        migrationImplementationVersion: receipt.migrationImplementationVersion,
        createdAt: restoredAt,
      } satisfies WorkbenchRecoveryMarker);
      throw new WorkbenchDatabaseCompatibilityError("recovery-required", "这个项目存在未完成的数据升级，原有数据已恢复。");
    }
  } catch (cause) {
    if (cause instanceof WorkbenchDatabaseCompatibilityError) throw cause;
    throw new WorkbenchDatabaseCompatibilityError("recovery-required", "这个项目存在无法确认的数据升级记录。", { cause });
  } finally {
    await lock.release();
  }
}

function openValidatedCurrentDatabase(path: string): Database.Database {
  let database: Database.Database | null = null;
  try {
    database = new Database(path, { readonly: true, fileMustExist: true });
    const inspection = inspectWorkbenchSchema(database);
    if (inspection.kind !== "current") throw new Error("The committed migration target is not the current schema.");
    validateCurrentWorkbenchSchema(database);
    return database;
  } catch (cause) {
    database?.close();
    throw new WorkbenchDatabaseCompatibilityError("recovery-required", "这个项目已升级的数据无法验证。", { cause });
  }
}

function configureRuntimeConnection(connection: Database.Database): void {
  connection.pragma("journal_mode = WAL");
  connection.pragma("foreign_keys = ON");
}

function beginExclusiveMigration(connection: Database.Database): void {
  try {
    connection.pragma("busy_timeout = 250");
    connection.exec("BEGIN EXCLUSIVE");
    connection.pragma("busy_timeout = 5000");
  } catch (cause) {
    connection.pragma("busy_timeout = 5000");
    throw new Error("另一个 Beaver Code 实例正在使用这个项目的数据。", { cause });
  }
}

function assertExclusiveMigrationAccess(connection: Database.Database): void {
  beginExclusiveMigration(connection);
  connection.exec("ROLLBACK");
}

function resolveUpgradePaths(workbenchDbPath: string) {
  const root = join(dirname(workbenchDbPath), "schema-upgrades");
  return {
    root,
    previousDir: join(root, "previous"),
    recoveryDir: join(root, "recovery"),
    recoveryMarkerPath: join(root, "recovery-required.json"),
  };
}

async function promotePreviousSnapshot(stagingDir: string, previousDir: string): Promise<void> {
  const retiredDir = `${previousDir}.retired-${randomUUID().toLowerCase()}`;
  const previousExists = await pathExists(previousDir);
  if (previousExists) await rename(previousDir, retiredDir);
  try {
    await rename(stagingDir, previousDir);
    await rm(retiredDir, { recursive: true, force: true });
  } catch (error) {
    if (previousExists && !await pathExists(previousDir)) await rename(retiredDir, previousDir).catch(() => undefined);
    throw error;
  }
}

async function promoteRecoveryEvidence(stagingDir: string, recoveryDir: string): Promise<void> {
  const retiredDir = `${recoveryDir}.retired-${randomUUID().toLowerCase()}`;
  const recoveryExists = await pathExists(recoveryDir);
  if (recoveryExists) await rename(recoveryDir, retiredDir);
  try {
    await rename(stagingDir, recoveryDir);
    await rm(retiredDir, { recursive: true, force: true });
  } catch (error) {
    if (recoveryExists && !await pathExists(recoveryDir)) await rename(retiredDir, recoveryDir).catch(() => undefined);
    throw error;
  }
}

async function restoreDatabaseSnapshot(snapshotPath: string, databasePath: string, transactionId: string): Promise<void> {
  const replacementPath = `${databasePath}.${transactionId}.restore`;
  const displacedPath = `${databasePath}.${transactionId}.failed`;
  await copyFile(snapshotPath, replacementPath);
  await rm(`${databasePath}-wal`, { force: true });
  await rm(`${databasePath}-shm`, { force: true });
  await rename(databasePath, displacedPath);
  try {
    await rename(replacementPath, databasePath);
    await rm(displacedPath, { force: true });
  } catch (error) {
    if (!await pathExists(databasePath)) await rename(displacedPath, databasePath).catch(() => undefined);
    await rm(replacementPath, { force: true });
    throw error;
  }
}

async function digestFile(path: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.once("end", resolve);
    stream.once("error", reject);
  });
  return hash.digest("hex");
}

async function readRecoveryMarker(path: string): Promise<WorkbenchRecoveryMarker | null> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as Partial<WorkbenchRecoveryMarker>;
    if (parsed.schemaVersion !== "1.0"
      || typeof parsed.databaseDigest !== "string"
      || typeof parsed.fromSchema !== "number"
      || typeof parsed.toSchema !== "number"
      || typeof parsed.migrationImplementationVersion !== "number"
      || typeof parsed.createdAt !== "string") throw new Error("Invalid Workbench recovery marker.");
    return parsed as WorkbenchRecoveryMarker;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function readMigrationReceipt(path: string): Promise<WorkbenchMigrationReceipt> {
  const parsed = JSON.parse(await readFile(path, "utf8")) as Partial<WorkbenchMigrationReceipt>;
  if (parsed.schemaVersion !== "1.0"
    || typeof parsed.transactionId !== "string"
    || !Number.isInteger(parsed.fromSchema)
    || !Number.isInteger(parsed.toSchema)
    || parsed.migrationImplementationVersion !== WORKBENCH_MIGRATION_IMPLEMENTATION_VERSION
    || typeof parsed.sourceDigest !== "string"
    || typeof parsed.snapshotDigest !== "string"
    || !isRecordCountMap(parsed.preservedRecordCounts)
    || typeof parsed.preservedIdentityDigest !== "string"
    || !Array.isArray(parsed.appliedVersions)
    || typeof parsed.startedAt !== "string"
    || !(parsed.completedAt === null || typeof parsed.completedAt === "string")
    || !["staged", "completed", "restored"].includes(String(parsed.result))) {
    throw new Error("Invalid Workbench migration receipt.");
  }
  return parsed as WorkbenchMigrationReceipt;
}

const PRESERVED_MIGRATION_TABLES = [
  "canonical_timeline_items",
  "conversations",
  "action_runs",
  "provider_thread_links",
  "conversation_provider_bindings",
  "provider_attempts",
  "provider_resume_points",
  "composer_drafts",
  "approval_cache",
  "decision_records",
  "conversation_fork_operations",
  "conversation_turn_queues",
  "conversation_turn_queue_items",
] as const;

interface PreservedRecordSnapshot {
  counts: Readonly<Record<string, number>>;
  identityDigest: string;
}

function capturePreservedRecords(database: Database.Database): PreservedRecordSnapshot {
  const counts: Record<string, number> = {};
  const identityHash = createHash("sha256");
  for (const table of PRESERVED_MIGRATION_TABLES) {
    const exists = database.prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
    if (!exists) continue;
    const columns = (database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string; pk: number }>)
      .filter((column) => column.pk > 0)
      .sort((left, right) => left.pk - right.pk)
      .map((column) => column.name);
    if (columns.length === 0) throw new Error(`Workbench migration invariant table has no primary key: ${table}`);
    const select = columns.map(quoteIdentifier).join(", ");
    const order = columns.map(quoteIdentifier).join(", ");
    const rows = database.prepare(`SELECT ${select} FROM ${quoteIdentifier(table)} ORDER BY ${order}`).all() as Array<Record<string, unknown>>;
    counts[table] = rows.length;
    identityHash.update(`${table}\0${JSON.stringify(rows)}\0`);
  }
  return { counts, identityDigest: identityHash.digest("hex") };
}

function assertPreservedRecords(database: Database.Database, expected: PreservedRecordSnapshot): void {
  const actual = capturePreservedRecords(database);
  if (JSON.stringify(actual.counts) !== JSON.stringify(expected.counts)
    || actual.identityDigest !== expected.identityDigest) {
    throw new Error("Workbench migration changed preserved record identity.");
  }
  const foreignKeyFailures = database.pragma("foreign_key_check") as unknown[];
  if (foreignKeyFailures.length > 0) throw new Error("Workbench migration foreign-key validation failed.");
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function isRecordCountMap(value: unknown): value is Readonly<Record<string, number>> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value)
    && Object.values(value as Record<string, unknown>).every((count) => Number.isInteger(count) && Number(count) >= 0));
}

function readSchemaVersion(path: string): number | null {
  let database: Database.Database | null = null;
  try {
    database = new Database(path, { readonly: true, fileMustExist: true });
    const version = Number(database.pragma("user_version", { simple: true }) ?? 0);
    return Number.isInteger(version) && version >= 0 ? version : null;
  } catch {
    return null;
  } finally {
    database?.close();
  }
}

async function pathExists(path: string): Promise<boolean> {
  return stat(path).then(() => true, () => false);
}
