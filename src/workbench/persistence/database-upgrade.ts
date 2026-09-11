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
import { WorkbenchMigrationBusyError } from "./migration-errors.js";

export interface WorkbenchMigrationReceipt {
  schemaVersion: "1.0";
  transactionId: string;
  fromSchema: number;
  toSchema: number;
  migrationImplementationVersion: number;
  sourceFileDigest: string;
  sourceDigest: string;
  snapshotDigest: string;
  targetDigest: string | null;
  preservedRecordCounts: Readonly<Record<string, number>>;
  preservedIdentityDigest: string;
  appliedVersions: readonly number[];
  startedAt: string;
  completedAt: string | null;
  result: "staged" | "commit-pending" | "completed" | "restored";
}

interface WorkbenchRecoveryMarker {
  schemaVersion: "1.0";
  databaseDigest: string;
  fromSchema: number;
  toSchema: number;
  migrationImplementationVersion: number;
  createdAt: string;
}

interface WorkbenchRestoreJournal {
  schemaVersion: "1.0";
  transactionId: string;
  expectedLiveDigest: string;
  snapshotDigest: string;
  phase: "prepared" | "live-displaced" | "snapshot-installed";
}

export interface WorkbenchDatabaseUpgradeOptions {
  createTransactionId?: () => string;
  now?: () => string;
  beforeCheckpoint?: () => void | Promise<void>;
  beforeMigration?: (db: Database.Database) => void;
  afterCommit?: () => void;
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
    if (marker || await pathExists(upgradePaths.restoreJournalPath) || await pathExists(upgradePaths.recoveryDir)) {
      return await inspectLiveDatabaseState(paths.workbenchDbPath);
    }
    const staging = await readdir(upgradePaths.root, { withFileTypes: true })
      .then((entries) => entries.some((entry) => entry.isDirectory() && entry.name.startsWith("staging-")), (error) => {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
        throw error;
      });
    if (staging) return { state: "upgrade-required", schemaVersion: null };
    return await inspectLiveDatabaseState(paths.workbenchDbPath);
  } catch (cause) {
    if (cause instanceof WorkbenchDatabaseCompatibilityError) {
      if (cause.code === "newer-version") return { state: "newer-version", schemaVersion: readSchemaVersion(paths.workbenchDbPath) };
      if (cause.code === "unsupported-legacy") return { state: "unsupported-legacy", schemaVersion: readSchemaVersion(paths.workbenchDbPath) };
      return { state: "recovery-required", schemaVersion: null };
    }
    return { state: "recovery-required", schemaVersion: null };
  }
}

async function inspectLiveDatabaseState(path: string): Promise<WorkbenchDatabaseUpgradeState> {
  if (!await pathExists(path)) return { state: "ready", schemaVersion: WORKBENCH_SCHEMA_VERSION };
  const database = new Database(path, { readonly: true, fileMustExist: true });
  try {
    const inspection = inspectWorkbenchSchema(database);
    if (inspection.kind === "new") return { state: "ready", schemaVersion: WORKBENCH_SCHEMA_VERSION };
    if (inspection.kind === "upgrade") return { state: "upgrade-required", schemaVersion: inspection.currentVersion };
    validateCurrentWorkbenchSchema(database);
    return { state: "ready", schemaVersion: inspection.currentVersion };
  } finally {
    database.close();
  }
}

export async function openSafeWorkbenchConnection(
  paths: { workbenchDbPath: string },
  migrationGuard: WorkbenchMigrationGuard,
  options: WorkbenchDatabaseUpgradeOptions = {},
): Promise<Database.Database> {
  await mkdir(dirname(paths.workbenchDbPath), { recursive: true });
  await reconcileInterruptedRestore(paths);
  await reconcileInterruptedUpgrade(paths);
  await reconcileRecoveryState(paths);
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
    await mkdir(stagingDir, { recursive: true });
    await options.beforeCheckpoint?.();
    assertCheckpointComplete(connection);
    const sourceDataVersion = Number(connection.pragma("data_version", { simple: true }));
    await connection.backup(stagedSnapshotPath);
    beginExclusiveMigration(connection);
    const lockedDataVersion = Number(connection.pragma("data_version", { simple: true }));
    if (lockedDataVersion !== sourceDataVersion) {
      throw new WorkbenchMigrationBusyError("这个项目的数据在创建升级快照时发生了变化，请稍后重试。");
    }
    const sourceFileDigest = await digestFile(paths.workbenchDbPath);
    const snapshotDigest = await digestFile(stagedSnapshotPath);
    const sourceDigest = digestWorkbenchDatabaseContent(stagedSnapshotPath);
    const preservedRecords = capturePreservedRecords(connection);
    receipt = {
      schemaVersion: "1.0",
      transactionId,
      fromSchema: inspection.currentVersion,
      toSchema: WORKBENCH_SCHEMA_VERSION,
      migrationImplementationVersion: WORKBENCH_MIGRATION_IMPLEMENTATION_VERSION,
      sourceFileDigest,
      sourceDigest,
      snapshotDigest,
      targetDigest: null,
      preservedRecordCounts: preservedRecords.counts,
      preservedIdentityDigest: preservedRecords.identityDigest,
      appliedVersions: [],
      startedAt: now(),
      completedAt: null,
      result: "staged",
    };
    await writeJsonFile(stagedReceiptPath, receipt);

    options.beforeMigration?.(connection);
    const appliedVersions = migrateWorkbenchSchema(connection, inspection.currentVersion);
    assertPreservedRecords(connection, preservedRecords);
    receipt = {
      ...receipt,
      appliedVersions,
      result: "commit-pending",
    };
    await writeJsonFile(stagedReceiptPath, receipt);
    connection.exec("COMMIT");
    options.afterCommit?.();
    const targetDigest = await backupConnectionDigest(connection, join(stagingDir, "target.sqlite"));
    receipt = {
      ...receipt,
      targetDigest,
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
    if ((receipt.result === "commit-pending" || receipt.result === "completed")
      && isValidCurrentDatabase(paths.workbenchDbPath)) {
      throw new WorkbenchDatabaseCompatibilityError("recovery-required", "这个项目的数据升级已经提交，正在等待启动校准。", { cause });
    }
    try {
      const liveLogicalDigest = await backupDatabaseDigest(paths.workbenchDbPath, upgradePaths.root, transactionId);
      if (liveLogicalDigest !== receipt.sourceDigest) {
        await restoreDatabaseSnapshot(stagedSnapshotPath, paths.workbenchDbPath, transactionId, receipt.sourceFileDigest);
      }
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
      const liveLogicalDigest = await backupDatabaseDigest(
        paths.workbenchDbPath,
        upgradePaths.root,
        `reconcile-${receipt.transactionId}`,
      ).catch(() => null);
      if (receipt.result === "completed") {
        if (!receipt.targetDigest) throw new WorkbenchDatabaseCompatibilityError("recovery-required", "已完成的升级记录缺少目标摘要。");
        const current = openValidatedCurrentDatabase(paths.workbenchDbPath);
        current.close();
        await promotePreviousSnapshot(stagingDir, upgradePaths.previousDir);
        await rm(upgradePaths.recoveryDir, { recursive: true, force: true });
        await rm(upgradePaths.recoveryMarkerPath, { force: true });
        continue;
      }
      if (receipt.result === "commit-pending" && isValidCurrentDatabase(paths.workbenchDbPath)) {
        if (!liveLogicalDigest) throw new WorkbenchDatabaseCompatibilityError("recovery-required", "已升级的数据无法形成校验摘要。");
        const completedReceipt: WorkbenchMigrationReceipt = {
          ...receipt,
          targetDigest: receipt.targetDigest ?? liveLogicalDigest,
          completedAt: new Date().toISOString(),
          result: "completed",
        };
        await writeJsonFile(receiptPath, completedReceipt);
        await promotePreviousSnapshot(stagingDir, upgradePaths.previousDir);
        await rm(upgradePaths.recoveryDir, { recursive: true, force: true });
        await rm(upgradePaths.recoveryMarkerPath, { force: true });
        continue;
      }
      const liveFileDigest = await digestFile(paths.workbenchDbPath).catch(() => null);
      if (receipt.result === "restored" && liveLogicalDigest === receipt.sourceDigest) {
        await promoteRecoveryEvidence(stagingDir, upgradePaths.recoveryDir);
        if (!liveFileDigest) throw new WorkbenchDatabaseCompatibilityError("recovery-required", "这个项目恢复后的数据无法验证。");
        await writeRecoveryMarker(upgradePaths.recoveryMarkerPath, receipt, liveFileDigest, receipt.completedAt ?? new Date().toISOString());
        throw new WorkbenchDatabaseCompatibilityError("recovery-required", "这个项目存在未完成的数据升级，原有数据已恢复。");
      }
      if ((receipt.result === "staged" || receipt.result === "commit-pending")
        && liveLogicalDigest !== receipt.sourceDigest) {
        throw new WorkbenchDatabaseCompatibilityError("recovery-required", "当前项目数据与未完成的升级记录不匹配，未执行自动恢复。");
      }
      if (liveLogicalDigest !== receipt.sourceDigest || !liveFileDigest) {
        throw new WorkbenchDatabaseCompatibilityError("recovery-required", "当前项目数据与恢复快照不匹配，未执行自动恢复。");
      }
      const restoredAt = receipt.completedAt ?? new Date().toISOString();
      const restoredReceipt: WorkbenchMigrationReceipt = {
        ...receipt,
        completedAt: restoredAt,
        result: "restored",
      };
      await writeJsonFile(receiptPath, restoredReceipt);
      await promoteRecoveryEvidence(stagingDir, upgradePaths.recoveryDir);
      await writeRecoveryMarker(upgradePaths.recoveryMarkerPath, restoredReceipt, liveFileDigest, restoredAt);
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
    throw new WorkbenchMigrationBusyError("另一个 Beaver Code 实例正在使用这个项目的数据。", { cause });
  }
}

function resolveUpgradePaths(workbenchDbPath: string) {
  const root = join(dirname(workbenchDbPath), "schema-upgrades");
  return {
    root,
    previousDir: join(root, "previous"),
    recoveryDir: join(root, "recovery"),
    recoveryMarkerPath: join(root, "recovery-required.json"),
    restoreJournalPath: join(root, "restore-transaction.json"),
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

async function restoreDatabaseSnapshot(
  snapshotPath: string,
  databasePath: string,
  transactionId: string,
  expectedLiveDigest: string,
): Promise<void> {
  const upgradePaths = resolveUpgradePaths(databasePath);
  const replacementPath = `${databasePath}.${transactionId}.restore`;
  await copyFile(snapshotPath, replacementPath);
  const snapshotDigest = await digestFile(snapshotPath);
  if (await digestFile(replacementPath) !== snapshotDigest) throw new Error("Workbench restore replacement digest mismatch.");
  await writeJsonFile(upgradePaths.restoreJournalPath, {
    schemaVersion: "1.0",
    transactionId,
    expectedLiveDigest,
    snapshotDigest,
    phase: "prepared",
  } satisfies WorkbenchRestoreJournal);
  await completeRestoreTransaction(databasePath, snapshotPath, upgradePaths.restoreJournalPath);
}

async function reconcileInterruptedRestore(paths: { workbenchDbPath: string }): Promise<void> {
  const upgradePaths = resolveUpgradePaths(paths.workbenchDbPath);
  if (!await pathExists(upgradePaths.restoreJournalPath)) return;
  const lock = await acquireWorkbenchRuntimeMutationLock(paths, "恢复未完成的数据替换");
  try {
    const journal = await readRestoreJournal(upgradePaths.restoreJournalPath);
    const snapshotPath = await resolveRestoreSnapshot(upgradePaths, journal.transactionId);
    await completeRestoreTransaction(paths.workbenchDbPath, snapshotPath, upgradePaths.restoreJournalPath);
  } finally {
    await lock.release();
  }
}

async function completeRestoreTransaction(databasePath: string, snapshotPath: string, journalPath: string): Promise<void> {
  let journal = await readRestoreJournal(journalPath);
  const replacementPath = `${databasePath}.${journal.transactionId}.restore`;
  const displacedPath = `${databasePath}.${journal.transactionId}.failed`;
  if (await digestFile(snapshotPath) !== journal.snapshotDigest) {
    throw new WorkbenchDatabaseCompatibilityError("recovery-required", "这个项目的数据升级快照无法验证。");
  }
  if (!await pathExists(replacementPath) && journal.phase !== "snapshot-installed") {
    await copyFile(snapshotPath, replacementPath);
  }
  if (await pathExists(replacementPath) && await digestFile(replacementPath) !== journal.snapshotDigest) {
    throw new WorkbenchDatabaseCompatibilityError("recovery-required", "这个项目的数据恢复副本无法验证。");
  }

  if (journal.phase === "prepared") {
    if (await pathExists(databasePath)) {
      if (await pathExists(`${databasePath}-wal`) || await pathExists(`${databasePath}-shm`)) {
        throw new WorkbenchDatabaseCompatibilityError("recovery-required", "当前项目仍有未合并的数据记录，未执行自动覆盖恢复。");
      }
      const liveDigest = await digestFile(databasePath);
      if (liveDigest !== journal.expectedLiveDigest) {
        throw new WorkbenchDatabaseCompatibilityError("recovery-required", "当前项目数据已发生变化，未执行自动覆盖恢复。");
      }
      await rm(`${databasePath}-wal`, { force: true });
      await rm(`${databasePath}-shm`, { force: true });
      await rename(databasePath, displacedPath);
    } else if (!await pathExists(displacedPath)) {
      throw new WorkbenchDatabaseCompatibilityError("recovery-required", "这个项目的数据恢复事务缺少原始数据库。");
    }
    journal = { ...journal, phase: "live-displaced" };
    await writeJsonFile(journalPath, journal);
  }

  if (journal.phase === "live-displaced") {
    if (await pathExists(databasePath)) {
      if (await digestFile(databasePath) !== journal.snapshotDigest) {
        throw new WorkbenchDatabaseCompatibilityError("recovery-required", "这个项目的数据恢复目标无法验证。");
      }
    } else {
      await rename(replacementPath, databasePath);
    }
    journal = { ...journal, phase: "snapshot-installed" };
    await writeJsonFile(journalPath, journal);
  }

  if (await digestFile(databasePath) !== journal.snapshotDigest) {
    throw new WorkbenchDatabaseCompatibilityError("recovery-required", "这个项目恢复后的数据无法验证。");
  }
  await rm(displacedPath, { force: true });
  await rm(replacementPath, { force: true });
  await rm(journalPath, { force: true });
}

async function resolveRestoreSnapshot(
  upgradePaths: ReturnType<typeof resolveUpgradePaths>,
  transactionId: string,
): Promise<string> {
  const candidates = [
    join(upgradePaths.root, `staging-${transactionId}`, "workbench.sqlite"),
    join(upgradePaths.recoveryDir, "workbench.sqlite"),
  ];
  for (const candidate of candidates) if (await pathExists(candidate)) return candidate;
  throw new WorkbenchDatabaseCompatibilityError("recovery-required", "这个项目的数据恢复事务缺少升级快照。");
}

async function readRestoreJournal(path: string): Promise<WorkbenchRestoreJournal> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as Partial<WorkbenchRestoreJournal>;
    if (parsed.schemaVersion !== "1.0"
      || typeof parsed.transactionId !== "string"
      || !/^[A-Za-z0-9_-]{1,128}$/.test(parsed.transactionId)
      || !isSha256Digest(parsed.expectedLiveDigest)
      || !isSha256Digest(parsed.snapshotDigest)
      || !["prepared", "live-displaced", "snapshot-installed"].includes(String(parsed.phase))) {
      throw new Error("Invalid Workbench restore journal.");
    }
    return parsed as WorkbenchRestoreJournal;
  } catch (cause) {
    throw new WorkbenchDatabaseCompatibilityError("recovery-required", "这个项目的数据恢复事务无法读取。", { cause });
  }
}

async function reconcileRecoveryState(paths: { workbenchDbPath: string }): Promise<void> {
  const upgradePaths = resolveUpgradePaths(paths.workbenchDbPath);
  if (!await pathExists(upgradePaths.recoveryMarkerPath) && !await pathExists(upgradePaths.recoveryDir)) return;
  const lock = await acquireWorkbenchRuntimeMutationLock(paths, "校准数据恢复状态");
  try {
    await reconcileRecoveryStateUnderLock(paths, upgradePaths);
  } finally {
    await lock.release();
  }
}

async function reconcileRecoveryStateUnderLock(
  paths: { workbenchDbPath: string },
  upgradePaths: ReturnType<typeof resolveUpgradePaths>,
): Promise<void> {
  let marker: WorkbenchRecoveryMarker | null;
  try {
    marker = await readRecoveryMarker(upgradePaths.recoveryMarkerPath);
  } catch (cause) {
    throw new WorkbenchDatabaseCompatibilityError("recovery-required", "这个项目的数据恢复记录无法读取。", { cause });
  }
  const recoveryExists = await pathExists(upgradePaths.recoveryDir);
  const receipt = recoveryExists
    ? await readMigrationReceipt(join(upgradePaths.recoveryDir, "receipt.json"))
    : null;
  if (receipt) {
    const snapshotPath = join(upgradePaths.recoveryDir, "workbench.sqlite");
    if (receipt.result !== "restored"
      || !await pathExists(snapshotPath)
      || await digestFile(snapshotPath) !== receipt.snapshotDigest) {
      throw new WorkbenchDatabaseCompatibilityError("recovery-required", "这个项目的数据恢复证据无法验证。");
    }
  }
  const liveLogicalDigest = await backupDatabaseDigest(
    paths.workbenchDbPath,
    upgradePaths.root,
    `recovery-${receipt?.transactionId ?? "marker"}`,
  ).catch(() => null);
  if (receipt && !marker && liveLogicalDigest === receipt.sourceDigest) {
    const liveFileDigest = await digestFile(paths.workbenchDbPath);
    await writeRecoveryMarker(upgradePaths.recoveryMarkerPath, receipt, liveFileDigest, receipt.completedAt ?? new Date().toISOString());
    return;
  }
  if (!marker) return;
  if (isValidCurrentDatabase(paths.workbenchDbPath)) {
    await rm(upgradePaths.recoveryDir, { recursive: true, force: true });
    await rm(upgradePaths.recoveryMarkerPath, { force: true });
    return;
  }
  const liveFileDigest = await digestFile(paths.workbenchDbPath).catch(() => null);
  const sameFailedInput = marker.migrationImplementationVersion === WORKBENCH_MIGRATION_IMPLEMENTATION_VERSION
    && (receipt ? liveLogicalDigest === receipt.sourceDigest : liveFileDigest === marker.databaseDigest);
  if (sameFailedInput) return;
  if (!isSupportedMigrationSource(paths.workbenchDbPath)) {
    throw new WorkbenchDatabaseCompatibilityError("recovery-required", "当前项目数据与恢复记录不匹配。");
  }
  await rm(upgradePaths.recoveryDir, { recursive: true, force: true });
  await rm(upgradePaths.recoveryMarkerPath, { force: true });
}

function isSupportedMigrationSource(path: string): boolean {
  let database: Database.Database | null = null;
  try {
    database = new Database(path, { readonly: true, fileMustExist: true });
    return inspectWorkbenchSchema(database).kind === "upgrade";
  } catch {
    return false;
  } finally {
    database?.close();
  }
}

async function writeRecoveryMarker(
  path: string,
  receipt: Pick<WorkbenchMigrationReceipt, "fromSchema" | "toSchema" | "migrationImplementationVersion">,
  databaseDigest: string,
  createdAt: string,
): Promise<void> {
  await writeJsonFile(path, {
    schemaVersion: "1.0",
    databaseDigest,
    fromSchema: receipt.fromSchema,
    toSchema: receipt.toSchema,
    migrationImplementationVersion: receipt.migrationImplementationVersion,
    createdAt,
  } satisfies WorkbenchRecoveryMarker);
}

function assertCheckpointComplete(connection: Database.Database): void {
  const rows = connection.pragma("wal_checkpoint(TRUNCATE)") as Array<{ busy?: number; log?: number; checkpointed?: number }>;
  const result = rows[0];
  if (!result
    || Number(result.busy ?? 1) !== 0
    || Number(result.log ?? -1) !== Number(result.checkpointed ?? -2)) {
    throw new WorkbenchMigrationBusyError("这个项目的数据仍在写入，暂时无法创建一致的升级快照。");
  }
}

function isValidCurrentDatabase(path: string): boolean {
  let database: Database.Database | null = null;
  try {
    database = new Database(path, { readonly: true, fileMustExist: true });
    if (inspectWorkbenchSchema(database).kind !== "current") return false;
    validateCurrentWorkbenchSchema(database);
    return true;
  } catch {
    return false;
  } finally {
    database?.close();
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

async function backupConnectionDigest(connection: Database.Database, snapshotPath: string): Promise<string> {
  await rm(snapshotPath, { force: true });
  try {
    await connection.backup(snapshotPath);
    return digestWorkbenchDatabaseContent(snapshotPath);
  } finally {
    await rm(snapshotPath, { force: true });
  }
}

async function backupDatabaseDigest(databasePath: string, scratchRoot: string, identity: string): Promise<string> {
  void scratchRoot;
  void identity;
  return digestWorkbenchDatabaseContent(databasePath);
}

export function digestWorkbenchDatabaseContent(path: string): string {
  const database = new Database(path, { readonly: true, fileMustExist: true });
  const hash = createHash("sha256");
  try {
    hash.update(`user_version\0${String(database.pragma("user_version", { simple: true }))}\0`);
    hash.update(`application_id\0${String(database.pragma("application_id", { simple: true }))}\0`);
    const schemaRows = database.prepare(`
      SELECT type, name, tbl_name AS tableName, sql
      FROM sqlite_schema
      WHERE name NOT LIKE 'sqlite_%' OR name = 'sqlite_sequence'
      ORDER BY type, name
    `).all() as Array<{ type: string; name: string; tableName: string; sql: string | null }>;
    for (const row of schemaRows) {
      hash.update(`schema\0${row.type}\0${row.name}\0${row.tableName}\0${normalizeSchemaSql(row.sql)}\0`);
    }
    const tables = schemaRows
      .filter((row) => row.type === "table")
      .map((row) => row.name)
      .sort();
    for (const table of tables) {
      const columns = (database.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all() as Array<{ name: string }>)
        .map((column) => column.name);
      const projections = columns
        .map((column, index) => (
          `typeof(${quoteIdentifier(column)}) || ':' || coalesce(hex(CAST(${quoteIdentifier(column)} AS BLOB)), '')`
          + ` AS ${quoteIdentifier(`value${index}`)}`
        ))
        .join(", ");
      const rows = database.prepare(`SELECT ${projections} FROM ${quoteIdentifier(table)}`).all() as Array<Record<string, string>>;
      const encodedRows = rows
        .map((row) => columns.map((_, index) => row[`value${index}`]).join("\0"))
        .sort();
      hash.update(`table\0${table}\0${columns.join("\0")}\0`);
      for (const row of encodedRows) hash.update(`row\0${row}\0`);
    }
    return hash.digest("hex");
  } finally {
    database.close();
  }
}

function normalizeSchemaSql(sql: string | null): string {
  return sql?.replace(/\s+/g, " ").trim() ?? "";
}

async function readRecoveryMarker(path: string): Promise<WorkbenchRecoveryMarker | null> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as Partial<WorkbenchRecoveryMarker>;
    if (parsed.schemaVersion !== "1.0"
      || !isSha256Digest(parsed.databaseDigest)
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
    || !/^[A-Za-z0-9_-]{1,128}$/.test(parsed.transactionId)
    || !Number.isInteger(parsed.fromSchema)
    || !Number.isInteger(parsed.toSchema)
    || !Number.isInteger(parsed.migrationImplementationVersion)
    || Number(parsed.migrationImplementationVersion) < 1
    || !isSha256Digest(parsed.sourceFileDigest)
    || !isSha256Digest(parsed.sourceDigest)
    || !isSha256Digest(parsed.snapshotDigest)
    || !(parsed.targetDigest === null || isSha256Digest(parsed.targetDigest))
    || !isRecordCountMap(parsed.preservedRecordCounts)
    || typeof parsed.preservedIdentityDigest !== "string"
    || !Array.isArray(parsed.appliedVersions)
    || typeof parsed.startedAt !== "string"
    || !(parsed.completedAt === null || typeof parsed.completedAt === "string")
    || !["staged", "commit-pending", "completed", "restored"].includes(String(parsed.result))) {
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
  "conversation_change_links",
  "conversation_graph_scopes",
  "conversation_lifecycle_operations",
  "conversation_review_operations",
  "planning_acceptance_commits",
  "skill_enablement",
  "skill_roots",
] as const;

interface PreservedRecordSnapshot {
  counts: Readonly<Record<string, number>>;
  identityDigest: string;
}

function capturePreservedRecords(
  database: Database.Database,
  tables: readonly string[] = PRESERVED_MIGRATION_TABLES,
): PreservedRecordSnapshot {
  const counts: Record<string, number> = {};
  const identityHash = createHash("sha256");
  for (const table of tables) {
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
  const actual = capturePreservedRecords(database, Object.keys(expected.counts));
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

function isSha256Digest(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
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
