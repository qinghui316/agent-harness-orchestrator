import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { parseJsonText, writeJsonFile } from "../fs/json.js";
import { assertPortableProjectId } from "../project-harness/project-id.js";
import {
  assertExactSiblingPaths,
  assertIdentityMigrationPhysicalDirectory,
  assertIdentityMigrationPhysicalFile,
  assertIdentityMigrationRelativePath,
  assertNoIdentityMigrationLinks,
  copyIdentityMigrationTree,
  renameIdentityMigrationPath,
} from "./identity-migration-fs.js";
import {
  auditJsonLinesProjectIdentity,
  auditStructuredProjectIdentity,
  rewriteStructuredProjectIdentity,
} from "./identity-migration-json.js";
import {
  migrateSqliteProjectIdentity,
  type SqliteProjectIdentityColumn,
  type SqliteProjectIdentityProof,
} from "./identity-migration-sqlite.js";

export interface ProjectIdentitySqliteDatabase {
  relativePath: string;
  identityColumns: readonly SqliteProjectIdentityColumn[];
  prepareStagedDatabase?: (database: Database.Database) => void;
}

export interface ProjectIdentityJsonDocument {
  kind: "registry" | "binding" | "local-state" | "runtime-state";
  scope: "external" | "sidecar";
  path: string;
  allowedIdentityPaths: readonly string[];
  required?: boolean;
}

export type ProjectIdentityMigrationStage =
  | "preparing"
  | "prepared"
  | "source-sidecar-moved"
  | "target-sidecar-published"
  | "structured-document-backed-up"
  | "structured-document-published"
  | "commit-ready"
  | "cleanup-in-progress"
  | "completed"
  | "rolled-back";

export interface ProjectIdentityMigrationDocumentJournal {
  kind: ProjectIdentityJsonDocument["kind"];
  scope: ProjectIdentityJsonDocument["scope"];
  sourcePath: string;
  stagedPath: string;
  backupPath: string | null;
  allowedIdentityPaths: string[];
  required: boolean;
  matchCount: number;
  beforeContentHash: string;
  afterContentHash: string;
  beforeIdentityNeutralHash: string;
  afterIdentityNeutralHash: string;
  state: "prepared" | "backed-up" | "published-with-sidecar" | "published";
}

export interface ProjectIdentityMigrationJournal {
  schemaVersion: "1.0";
  transactionId: string;
  sourceProjectId: string;
  targetProjectId: string;
  manifestPath: string;
  sourceSidecarRoot: string;
  targetSidecarRoot: string;
  stagedSidecarRoot: string;
  previousSidecarRoot: string;
  journalPath: string;
  manifestContentHash: string;
  sourceSidecarFingerprint: string;
  stagedSidecarFingerprint: string;
  stage: ProjectIdentityMigrationStage;
  sqliteProofs: SqliteProjectIdentityProof[];
  documents: ProjectIdentityMigrationDocumentJournal[];
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MigrateProjectIdentityOptions {
  sourceProjectId: string;
  targetProjectId: string;
  manifestPath: string;
  sourceSidecarRoot: string;
  targetSidecarRoot: string;
  transactionId: string;
  sqliteDatabases: readonly ProjectIdentitySqliteDatabase[];
  jsonDocuments: readonly ProjectIdentityJsonDocument[];
  failureInjection?: (
    stage: Exclude<ProjectIdentityMigrationStage, "preparing" | "cleanup-in-progress" | "completed" | "rolled-back">,
    journal: Readonly<ProjectIdentityMigrationJournal>,
  ) => void | Promise<void>;
}

export interface RecoverProjectIdentityMigrationOptions {
  journalPath: string;
  sourceProjectId: string;
  targetProjectId: string;
  manifestPath: string;
  sourceSidecarRoot: string;
  targetSidecarRoot: string;
  jsonDocuments: readonly ProjectIdentityJsonDocument[];
}

export interface ProjectIdentityMigrationResult {
  journalPath: string;
  stage: "completed" | "rolled-back";
  sourceProjectId: string;
  targetProjectId: string;
  sqliteProofs: SqliteProjectIdentityProof[];
  documents: ProjectIdentityMigrationDocumentJournal[];
}

interface PreparedMigration {
  journal: ProjectIdentityMigrationJournal;
  sqliteDatabases: Array<ProjectIdentitySqliteDatabase & { relativePath: string }>;
}

const PORTABLE_TRANSACTION_ID = /^[a-z0-9][a-z0-9-]{0,127}$/;

export async function migrateProjectIdentity(
  options: MigrateProjectIdentityOptions,
): Promise<ProjectIdentityMigrationResult> {
  const prepared = await prepareMigration(options);
  let journal = prepared.journal;
  try {
    journal = await advanceJournal(journal, "prepared");
    await inject(options, "prepared", journal);

    await assertContentHash(journal.manifestPath, journal.manifestContentHash, "project Harness manifest");
    await assertTreeFingerprint(
      journal.sourceSidecarRoot,
      journal.sourceSidecarFingerprint,
      "source runtime sidecar changed while identity migration was being prepared",
    );
    assertAbsent(journal.targetSidecarRoot, "target runtime sidecar");
    assertAbsent(journal.previousSidecarRoot, "previous runtime sidecar");
    await renameIdentityMigrationPath(journal.sourceSidecarRoot, journal.previousSidecarRoot);
    journal = await advanceJournal(journal, "source-sidecar-moved");
    await inject(options, "source-sidecar-moved", journal);

    await renameIdentityMigrationPath(journal.stagedSidecarRoot, journal.targetSidecarRoot);
    journal = await advanceJournal(journal, "target-sidecar-published");
    await inject(options, "target-sidecar-published", journal);

    for (let index = 0; index < journal.documents.length; index += 1) {
      const document = journal.documents[index];
      if (document.scope !== "external") continue;
      if (!document.backupPath) throw new Error(`External identity document has no backup path: ${document.sourcePath}`);
      await assertIdentityMigrationPhysicalFile(document.sourcePath, "external identity document");
      await assertContentHash(document.sourcePath, document.beforeContentHash, "external identity document changed before publication");
      await assertContentHash(document.stagedPath, document.afterContentHash, "staged external identity document");
      await renameIdentityMigrationPath(document.sourcePath, document.backupPath);
      journal = await updateDocumentState(journal, index, "backed-up", "structured-document-backed-up");
      await inject(options, "structured-document-backed-up", journal);
      await renameIdentityMigrationPath(document.stagedPath, document.sourcePath);
      journal = await updateDocumentState(journal, index, "published", "structured-document-published");
      await inject(options, "structured-document-published", journal);
    }

    journal = await advanceJournal(journal, "commit-ready");
    await inject(options, "commit-ready", journal);
    journal = await advanceJournal(journal, "cleanup-in-progress");
    await finishCommittedMigration(journal);
    journal = await advanceJournal(journal, "completed");
    return resultFromJournal(journal);
  } catch (error) {
    if (journal.stage === "cleanup-in-progress" || journal.stage === "completed") {
      throw new Error(`Project identity migration reached its commit point but cleanup did not complete; recover ${journal.journalPath}.`, { cause: error });
    }
    try {
      journal = await rollbackMigration(journal, error);
    } catch (rollbackError) {
      throw new Error(`Project identity migration failed and rollback also failed; recover ${journal.journalPath}.`, {
        cause: new AggregateError([error, rollbackError]),
      });
    }
    throw new Error(`Project identity migration failed and was rolled back: ${(error as Error).message}`, { cause: error });
  }
}

export async function recoverProjectIdentityMigration(
  options: RecoverProjectIdentityMigrationOptions,
): Promise<ProjectIdentityMigrationResult> {
  let journal = await readJournal(options.journalPath);
  await assertJournalMatchesRecoveryOptions(journal, options);
  if (journal.stage === "completed" || journal.stage === "rolled-back") return resultFromJournal(journal);
  if (journal.stage === "cleanup-in-progress") {
    await finishCommittedMigration(journal);
    journal = await advanceJournal(journal, "completed");
    return resultFromJournal(journal);
  }
  journal = await rollbackMigration(journal, new Error("Recovered an incomplete project identity migration."));
  return resultFromJournal(journal);
}

export async function recoverPendingProjectIdentityMigrations(
  projectsRootPath: string,
  resolveDocuments: (
    journal: Readonly<ProjectIdentityMigrationJournal>,
  ) => Promise<readonly ProjectIdentityJsonDocument[]> | readonly ProjectIdentityJsonDocument[],
): Promise<ProjectIdentityMigrationResult[]> {
  const projectsRoot = resolve(projectsRootPath);
  if (!existsSync(projectsRoot)) return [];
  await assertIdentityMigrationPhysicalDirectory(projectsRoot, "runtime projects root");
  const transactionRoot = join(projectsRoot, ".identity-transactions");
  if (!existsSync(transactionRoot)) return [];
  await assertIdentityMigrationPhysicalDirectory(transactionRoot, "identity migration transaction root");
  const results: ProjectIdentityMigrationResult[] = [];
  for (const entry of (await readdir(transactionRoot, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name))) {
    const transactionDirectory = join(transactionRoot, entry.name);
    const info = await lstat(transactionDirectory);
    if (!info.isDirectory() || info.isSymbolicLink()) {
      throw new Error(`Identity migration transaction entry must be a physical directory: ${transactionDirectory}`);
    }
    const journalPath = join(transactionDirectory, "journal.json");
    const journal = await readJournal(journalPath);
    if (!samePath(dirname(journal.sourceSidecarRoot), projectsRoot)
      || !samePath(dirname(journal.targetSidecarRoot), projectsRoot)) {
      throw new Error(`Identity migration journal sidecars are outside the canonical projects root: ${journalPath}`);
    }
    if (journal.stage === "completed" || journal.stage === "rolled-back") continue;
    const jsonDocuments = [...await resolveDocuments(journal)];
    results.push(await recoverProjectIdentityMigration({
      journalPath,
      sourceProjectId: journal.sourceProjectId,
      targetProjectId: journal.targetProjectId,
      manifestPath: journal.manifestPath,
      sourceSidecarRoot: journal.sourceSidecarRoot,
      targetSidecarRoot: journal.targetSidecarRoot,
      jsonDocuments,
    }));
  }
  return results;
}

async function prepareMigration(options: MigrateProjectIdentityOptions): Promise<PreparedMigration> {
  assertPortableProjectId(options.sourceProjectId, "source project id");
  assertPortableProjectId(options.targetProjectId, "target project id");
  if (options.sourceProjectId === options.targetProjectId) throw new Error("Source and target project ids must differ.");
  if (!PORTABLE_TRANSACTION_ID.test(options.transactionId)) {
    throw new Error(`Identity migration transaction id is not portable: ${options.transactionId}`);
  }
  const manifestPath = await assertIdentityMigrationPhysicalFile(options.manifestPath, "project Harness manifest");
  await assertCanonicalManifest(manifestPath, options.targetProjectId);
  const manifestContentHash = await hashFile(manifestPath);
  const sourceSidecarRoot = await assertIdentityMigrationPhysicalDirectory(options.sourceSidecarRoot, "source runtime sidecar");
  await assertNoIdentityMigrationLinks(sourceSidecarRoot, "source runtime sidecar");
  const targetSidecarRoot = resolve(options.targetSidecarRoot);
  assertExactSiblingPaths(sourceSidecarRoot, targetSidecarRoot);
  if (basename(sourceSidecarRoot) !== options.sourceProjectId || basename(targetSidecarRoot) !== options.targetProjectId) {
    throw new Error("Runtime sidecar directory names must exactly match the source and target project ids.");
  }
  const parent = dirname(sourceSidecarRoot);
  const transactionRoot = join(parent, ".identity-transactions");
  const transactionDirectory = join(transactionRoot, options.transactionId);
  const journalPath = join(transactionDirectory, "journal.json");
  const stagedSidecarRoot = join(parent, `.${options.targetProjectId}.${options.transactionId}.staged`);
  const previousSidecarRoot = join(parent, `.${options.sourceProjectId}.${options.transactionId}.previous`);
  assertAbsent(targetSidecarRoot, "target runtime sidecar");
  assertAbsent(stagedSidecarRoot, "staged runtime sidecar");
  assertAbsent(previousSidecarRoot, "previous runtime sidecar");
  if (existsSync(transactionRoot)) {
    await assertIdentityMigrationPhysicalDirectory(transactionRoot, "identity migration transaction root");
  }
  assertAbsent(transactionDirectory, "identity migration transaction directory");

  const sqliteDatabases = normalizeSqliteDatabases(options.sqliteDatabases);
  const documents = normalizeDocuments(
    options.jsonDocuments,
    sourceSidecarRoot,
    stagedSidecarRoot,
    targetSidecarRoot,
    options.transactionId,
  );
  await assertOnlyAllowlistedDatabases(sourceSidecarRoot, sqliteDatabases);
  await assertNoUnclassifiedSidecarIdentity(
    sourceSidecarRoot,
    sqliteDatabases,
    documents,
    options.sourceProjectId,
    options.targetProjectId,
  );
  const sourceSidecarFingerprint = await hashTree(sourceSidecarRoot);
  await mkdir(transactionRoot, { recursive: true });
  await assertIdentityMigrationPhysicalDirectory(transactionRoot, "identity migration transaction root");
  await mkdir(transactionDirectory);
  const excluded = new Set<string>();
  for (const database of sqliteDatabases) {
    excluded.add(database.relativePath);
    excluded.add(`${database.relativePath}-wal`);
    excluded.add(`${database.relativePath}-shm`);
  }

  const now = new Date().toISOString();
  let journal: ProjectIdentityMigrationJournal = {
    schemaVersion: "1.0",
    transactionId: options.transactionId,
    sourceProjectId: options.sourceProjectId,
    targetProjectId: options.targetProjectId,
    manifestPath,
    sourceSidecarRoot,
    targetSidecarRoot,
    stagedSidecarRoot,
    previousSidecarRoot,
    journalPath,
    manifestContentHash,
    sourceSidecarFingerprint,
    stagedSidecarFingerprint: "",
    stage: "preparing",
    sqliteProofs: [],
    documents,
    error: null,
    createdAt: now,
    updatedAt: now,
  };
  await writeJsonFile(journalPath, journal);

  try {
    await copyIdentityMigrationTree(sourceSidecarRoot, stagedSidecarRoot, excluded);
    const sqliteProofs: SqliteProjectIdentityProof[] = [];
    for (const databaseDescriptor of sqliteDatabases) {
      const sourcePath = join(sourceSidecarRoot, databaseDescriptor.relativePath);
      const stagedPath = join(stagedSidecarRoot, databaseDescriptor.relativePath);
      await assertIdentityMigrationPhysicalFile(sourcePath, "source SQLite database");
      await mkdir(dirname(stagedPath), { recursive: true });
      const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
      try {
        await source.backup(stagedPath);
      } finally {
        source.close();
      }
      if (databaseDescriptor.prepareStagedDatabase) {
        const staged = new Database(stagedPath, { fileMustExist: true });
        try {
          databaseDescriptor.prepareStagedDatabase(staged);
        } finally {
          staged.close();
        }
      }
      sqliteProofs.push(migrateSqliteProjectIdentity(
        stagedPath,
        databaseDescriptor.relativePath,
        options.sourceProjectId,
        options.targetProjectId,
        databaseDescriptor.identityColumns,
      ));
    }

    for (let index = 0; index < journal.documents.length; index += 1) {
      const document = journal.documents[index];
      const rewrite = await rewriteStructuredProjectIdentity(
        document.sourcePath,
        options.sourceProjectId,
        options.targetProjectId,
        document.allowedIdentityPaths,
        document.required,
      );
      if (document.scope === "external") {
        assertAbsent(document.stagedPath, "staged structured identity document");
        assertAbsent(document.backupPath!, "structured identity document backup");
        await writeFile(document.stagedPath, rewrite.content, { encoding: "utf8", flag: "wx" });
      } else {
        await writeFile(document.stagedPath, rewrite.content, "utf8");
      }
      const updatedDocument: ProjectIdentityMigrationDocumentJournal = {
        ...document,
        matchCount: rewrite.matchCount,
        beforeContentHash: await hashFile(document.sourcePath),
        afterContentHash: hashBytes(rewrite.content),
        beforeIdentityNeutralHash: rewrite.beforeIdentityNeutralHash,
        afterIdentityNeutralHash: rewrite.afterIdentityNeutralHash,
        state: document.scope === "sidecar" ? "published-with-sidecar" : "prepared",
      };
      journal = {
        ...journal,
        documents: journal.documents.map((candidate, candidateIndex) => candidateIndex === index ? updatedDocument : candidate),
        updatedAt: new Date().toISOString(),
      };
      await writeJsonFile(journalPath, journal);
    }
    await auditAllSidecarJson(stagedSidecarRoot, journal.documents, options.sourceProjectId, options.targetProjectId);
    journal = {
      ...journal,
      sqliteProofs,
      stagedSidecarFingerprint: await hashTree(stagedSidecarRoot),
      updatedAt: new Date().toISOString(),
    };
    await writeJsonFile(journalPath, journal);
    return { journal, sqliteDatabases };
  } catch (error) {
    try {
      await rollbackMigration(journal, error);
    } catch (rollbackError) {
      throw new Error(`Project identity migration preparation failed and rollback also failed; recover ${journal.journalPath}.`, {
        cause: new AggregateError([error, rollbackError]),
      });
    }
    throw error;
  }
}

function normalizeSqliteDatabases(
  databases: readonly ProjectIdentitySqliteDatabase[],
): Array<ProjectIdentitySqliteDatabase & { relativePath: string }> {
  const normalized = databases.map((database) => ({
    ...database,
    relativePath: assertIdentityMigrationRelativePath(database.relativePath, "SQLite database path"),
  }));
  const paths = normalized.map((database) => database.relativePath);
  if (new Set(paths).size !== paths.length) throw new Error("Duplicate SQLite database identity migration path.");
  return normalized;
}

function normalizeDocuments(
  documents: readonly ProjectIdentityJsonDocument[],
  sourceSidecarRoot: string,
  stagedSidecarRoot: string,
  targetSidecarRoot: string,
  transactionId: string,
): ProjectIdentityMigrationDocumentJournal[] {
  const normalized = documents.map((document): ProjectIdentityMigrationDocumentJournal => {
    if (document.allowedIdentityPaths.length === 0) {
      throw new Error(`Structured identity document has no explicit identity allowlist: ${document.path}`);
    }
    if (document.scope === "sidecar") {
      const relativePath = assertIdentityMigrationRelativePath(document.path, "sidecar structured identity path");
      return {
        kind: document.kind,
        scope: document.scope,
        sourcePath: join(sourceSidecarRoot, relativePath),
        stagedPath: join(stagedSidecarRoot, relativePath),
        backupPath: null,
        allowedIdentityPaths: [...document.allowedIdentityPaths],
        required: document.required ?? true,
        matchCount: 0,
        beforeContentHash: "",
        afterContentHash: "",
        beforeIdentityNeutralHash: "",
        afterIdentityNeutralHash: "",
        state: "prepared",
      };
    }
    const sourcePath = resolve(document.path);
    assertOutsideRoot(sourceSidecarRoot, sourcePath, "External structured identity document");
    assertOutsideRoot(targetSidecarRoot, sourcePath, "External structured identity document");
    return {
      kind: document.kind,
      scope: document.scope,
      sourcePath,
      stagedPath: `${sourcePath}.${transactionId}.next`,
      backupPath: `${sourcePath}.${transactionId}.previous`,
      allowedIdentityPaths: [...document.allowedIdentityPaths],
      required: document.required ?? true,
      matchCount: 0,
      beforeContentHash: "",
      afterContentHash: "",
      beforeIdentityNeutralHash: "",
      afterIdentityNeutralHash: "",
      state: "prepared",
    };
  });
  const sources = normalized.map((document) => resolve(document.sourcePath).toLowerCase());
  if (new Set(sources).size !== sources.length) throw new Error("Duplicate structured identity document path.");
  return normalized;
}

async function assertOnlyAllowlistedDatabases(
  sourceSidecarRoot: string,
  databases: readonly (ProjectIdentitySqliteDatabase & { relativePath: string })[],
): Promise<void> {
  const allowed = new Set(databases.map((database) => database.relativePath.toLowerCase()));
  for (const path of await collectFiles(sourceSidecarRoot)) {
    const normalized = path.replace(/\\/g, "/");
    const base = normalized.replace(/-(?:wal|shm)$/i, "");
    if (!/\.(?:sqlite|sqlite3|db)$/i.test(base)) continue;
    if (!allowed.has(base.toLowerCase())) {
      throw new Error(`Unknown SQLite database in runtime sidecar: ${normalized}`);
    }
  }
}

async function auditAllSidecarJson(
  stagedSidecarRoot: string,
  documents: readonly ProjectIdentityMigrationDocumentJournal[],
  sourceProjectId: string,
  targetProjectId: string,
): Promise<void> {
  const allowlist = new Map(documents.filter((document) => document.scope === "sidecar").map((document) => [
    resolve(document.stagedPath).toLowerCase(),
    document.allowedIdentityPaths,
  ]));
  for (const relativePath of await collectFiles(stagedSidecarRoot)) {
    if (!relativePath.toLowerCase().endsWith(".json")) continue;
    const path = join(stagedSidecarRoot, relativePath);
    await auditStructuredProjectIdentity(
      path,
      sourceProjectId,
      targetProjectId,
      allowlist.get(resolve(path).toLowerCase()) ?? [],
    );
  }
}

async function assertNoUnclassifiedSidecarIdentity(
  sourceSidecarRoot: string,
  databases: readonly (ProjectIdentitySqliteDatabase & { relativePath: string })[],
  documents: readonly ProjectIdentityMigrationDocumentJournal[],
  sourceProjectId: string,
  targetProjectId: string,
): Promise<void> {
  const databaseFiles = new Set(databases.flatMap(({ relativePath }) => [
    relativePath.toLowerCase(),
    `${relativePath}-wal`.toLowerCase(),
    `${relativePath}-shm`.toLowerCase(),
  ]));
  for (const relativePath of await collectFiles(sourceSidecarRoot)) {
    const normalized = relativePath.replace(/\\/g, "/");
    if (databaseFiles.has(normalized.toLowerCase()) || normalized.toLowerCase().endsWith(".json")) continue;
    const path = join(sourceSidecarRoot, normalized);
    if (normalized.toLowerCase().endsWith(".jsonl")) {
      await auditJsonLinesProjectIdentity(path, sourceProjectId, targetProjectId);
      continue;
    }
    const content = await readFile(path);
    if (content.includes(Buffer.from(sourceProjectId)) || content.includes(Buffer.from(targetProjectId))) {
      throw new Error(`Unclassified runtime sidecar identity literal: ${normalized}`);
    }
  }
}

async function collectFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  await visit(root, "");
  return files.sort();

  async function visit(directory: string, prefix: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const path = join(directory, entry.name);
      const info = await lstat(path);
      if (info.isSymbolicLink()) throw new Error(`Runtime sidecar contains a link or Junction: ${path}`);
      if (info.isDirectory()) await visit(path, relativePath);
      else if (info.isFile()) files.push(relativePath);
      else throw new Error(`Runtime sidecar contains an unsupported filesystem entry: ${path}`);
    }
  }
}

async function assertCanonicalManifest(path: string, targetProjectId: string): Promise<void> {
  const value = parseJsonText(await readFile(path, "utf8"), path) as Partial<Record<string, unknown>>;
  if (!value || typeof value !== "object" || value.schema_version !== "2.0") {
    throw new Error(`Project Harness manifest is not schema 2.0: ${path}`);
  }
  if (value.project_id !== targetProjectId) {
    throw new Error(`Project Harness manifest project_id must equal the canonical target id ${targetProjectId}.`);
  }
}

async function updateDocumentState(
  journal: ProjectIdentityMigrationJournal,
  index: number,
  state: ProjectIdentityMigrationDocumentJournal["state"],
  stage: ProjectIdentityMigrationStage,
): Promise<ProjectIdentityMigrationJournal> {
  const documents = journal.documents.map((document, candidate) => candidate === index ? { ...document, state } : document);
  const next = { ...journal, documents, stage, error: null, updatedAt: new Date().toISOString() };
  await writeJsonFile(journal.journalPath, next);
  return next;
}

async function advanceJournal(
  journal: ProjectIdentityMigrationJournal,
  stage: ProjectIdentityMigrationStage,
  error: string | null = null,
): Promise<ProjectIdentityMigrationJournal> {
  const next = { ...journal, stage, error, updatedAt: new Date().toISOString() };
  await writeJsonFile(journal.journalPath, next);
  return next;
}

async function rollbackMigration(
  journal: ProjectIdentityMigrationJournal,
  error: unknown,
): Promise<ProjectIdentityMigrationJournal> {
  await assertRollbackStateSafe(journal);
  for (const document of [...journal.documents].reverse()) {
    if (document.scope !== "external") continue;
    if (document.backupPath && existsSync(document.backupPath)) {
      await assertContentHash(document.backupPath, document.beforeContentHash, "external identity document backup");
      if (existsSync(document.sourcePath)) {
        await assertContentHash(
          document.sourcePath,
          document.afterContentHash,
          "published external identity document changed before rollback",
        );
        await rm(document.sourcePath, { force: true });
      }
      await renameIdentityMigrationPath(document.backupPath, document.sourcePath);
    }
    if (existsSync(document.stagedPath) && document.afterContentHash) {
      await assertContentHash(document.stagedPath, document.afterContentHash, "staged external identity document");
    }
    await rm(document.stagedPath, { force: true });
  }
  if (existsSync(journal.previousSidecarRoot)) {
    await assertTreeFingerprint(
      journal.previousSidecarRoot,
      journal.sourceSidecarFingerprint,
      "previous runtime sidecar changed before rollback",
    );
    if (existsSync(journal.targetSidecarRoot)) {
      await assertTreeFingerprint(
        journal.targetSidecarRoot,
        journal.stagedSidecarFingerprint,
        "published target runtime sidecar changed before rollback",
      );
      await rm(journal.targetSidecarRoot, { recursive: true, force: true });
    }
    if (existsSync(journal.sourceSidecarRoot)) {
      throw new Error("Cannot restore previous runtime sidecar because the source path is occupied.");
    }
    await renameIdentityMigrationPath(journal.previousSidecarRoot, journal.sourceSidecarRoot);
  } else if (!existsSync(journal.sourceSidecarRoot)) {
    throw new Error("Cannot restore runtime sidecar because both source and previous paths are missing.");
  }
  if (existsSync(journal.targetSidecarRoot)) {
    await assertTreeFingerprint(
      journal.targetSidecarRoot,
      journal.stagedSidecarFingerprint,
      "published target runtime sidecar changed before rollback",
    );
    await rm(journal.targetSidecarRoot, { recursive: true, force: true });
  }
  if (existsSync(journal.stagedSidecarRoot) && journal.stagedSidecarFingerprint) {
    await assertTreeFingerprint(
      journal.stagedSidecarRoot,
      journal.stagedSidecarFingerprint,
      "staged runtime sidecar changed before rollback",
    );
  }
  await rm(journal.stagedSidecarRoot, { recursive: true, force: true });
  return advanceJournal(journal, "rolled-back", error instanceof Error ? error.message : String(error));
}

async function finishCommittedMigration(journal: ProjectIdentityMigrationJournal): Promise<void> {
  await assertCommittedCleanupSafe(journal);
  if (existsSync(journal.previousSidecarRoot)) {
    await assertTreeFingerprint(
      journal.previousSidecarRoot,
      journal.sourceSidecarFingerprint,
      "previous runtime sidecar changed before committed cleanup",
    );
  }
  await rm(journal.previousSidecarRoot, { recursive: true, force: true });
  if (existsSync(journal.stagedSidecarRoot) && journal.stagedSidecarFingerprint) {
    await assertTreeFingerprint(
      journal.stagedSidecarRoot,
      journal.stagedSidecarFingerprint,
      "staged runtime sidecar changed before committed cleanup",
    );
  }
  await rm(journal.stagedSidecarRoot, { recursive: true, force: true });
  for (const document of journal.documents) {
    if (document.scope !== "external") continue;
    if (document.backupPath && existsSync(document.backupPath)) {
      await assertContentHash(document.backupPath, document.beforeContentHash, "external identity document backup");
      await rm(document.backupPath, { force: true });
    }
    if (existsSync(document.stagedPath) && document.afterContentHash) {
      await assertContentHash(document.stagedPath, document.afterContentHash, "staged external identity document");
    }
    await rm(document.stagedPath, { force: true });
  }
}

async function assertRollbackStateSafe(journal: ProjectIdentityMigrationJournal): Promise<void> {
  for (const document of journal.documents) {
    if (document.scope !== "external") continue;
    if (document.backupPath && existsSync(document.backupPath)) {
      await assertContentHash(document.backupPath, document.beforeContentHash, "external identity document backup");
      if (existsSync(document.sourcePath)) {
        await assertContentHash(
          document.sourcePath,
          document.afterContentHash,
          "published external identity document changed before rollback",
        );
      }
    }
    if (existsSync(document.stagedPath) && document.afterContentHash) {
      await assertContentHash(document.stagedPath, document.afterContentHash, "staged external identity document");
    }
  }
  if (existsSync(journal.previousSidecarRoot)) {
    await assertTreeFingerprint(
      journal.previousSidecarRoot,
      journal.sourceSidecarFingerprint,
      "previous runtime sidecar changed before rollback",
    );
  } else if (!existsSync(journal.sourceSidecarRoot)) {
    throw new Error("Cannot restore runtime sidecar because both source and previous paths are missing.");
  }
  if (existsSync(journal.targetSidecarRoot)) {
    await assertTreeFingerprint(
      journal.targetSidecarRoot,
      journal.stagedSidecarFingerprint,
      "published target runtime sidecar changed before rollback",
    );
  }
  if (existsSync(journal.stagedSidecarRoot) && journal.stagedSidecarFingerprint) {
    await assertTreeFingerprint(
      journal.stagedSidecarRoot,
      journal.stagedSidecarFingerprint,
      "staged runtime sidecar changed before rollback",
    );
  }
}

async function assertCommittedCleanupSafe(journal: ProjectIdentityMigrationJournal): Promise<void> {
  if (existsSync(journal.previousSidecarRoot)) {
    await assertTreeFingerprint(
      journal.previousSidecarRoot,
      journal.sourceSidecarFingerprint,
      "previous runtime sidecar changed before committed cleanup",
    );
  }
  if (existsSync(journal.stagedSidecarRoot) && journal.stagedSidecarFingerprint) {
    await assertTreeFingerprint(
      journal.stagedSidecarRoot,
      journal.stagedSidecarFingerprint,
      "staged runtime sidecar changed before committed cleanup",
    );
  }
  for (const document of journal.documents) {
    if (document.scope !== "external") continue;
    if (document.backupPath && existsSync(document.backupPath)) {
      await assertContentHash(document.backupPath, document.beforeContentHash, "external identity document backup");
    }
    if (existsSync(document.stagedPath) && document.afterContentHash) {
      await assertContentHash(document.stagedPath, document.afterContentHash, "staged external identity document");
    }
  }
}

async function readJournal(path: string): Promise<ProjectIdentityMigrationJournal> {
  const absolute = await assertIdentityMigrationPhysicalFile(path, "identity migration journal");
  const raw = parseJsonText(await readFile(absolute, "utf8"), absolute) as Partial<ProjectIdentityMigrationJournal>;
  if (raw.schemaVersion !== "1.0" || typeof raw.transactionId !== "string"
    || typeof raw.sourceProjectId !== "string" || typeof raw.targetProjectId !== "string"
    || typeof raw.manifestPath !== "string" || typeof raw.sourceSidecarRoot !== "string"
    || typeof raw.targetSidecarRoot !== "string" || typeof raw.stagedSidecarRoot !== "string"
    || typeof raw.previousSidecarRoot !== "string" || typeof raw.journalPath !== "string"
    || !isSha256(raw.manifestContentHash) || !isSha256(raw.sourceSidecarFingerprint)
    || !(raw.stagedSidecarFingerprint === "" || isSha256(raw.stagedSidecarFingerprint))
    || typeof raw.stage !== "string" || !Array.isArray(raw.sqliteProofs) || !Array.isArray(raw.documents)
    || !raw.documents.every(isJournalDocument)
    || typeof raw.createdAt !== "string" || typeof raw.updatedAt !== "string") {
    throw new Error(`Invalid project identity migration journal: ${absolute}`);
  }
  return raw as ProjectIdentityMigrationJournal;
}

async function assertJournalMatchesRecoveryOptions(
  journal: ProjectIdentityMigrationJournal,
  options: RecoverProjectIdentityMigrationOptions,
): Promise<void> {
  assertJournalPaths(journal, options.journalPath);
  assertPortableProjectId(options.sourceProjectId, "expected source project id");
  assertPortableProjectId(options.targetProjectId, "expected target project id");
  if (journal.sourceProjectId !== options.sourceProjectId || journal.targetProjectId !== options.targetProjectId) {
    throw new Error("Identity migration journal project ids do not match the expected recovery identity.");
  }
  const manifestPath = await assertIdentityMigrationPhysicalFile(options.manifestPath, "expected project Harness manifest");
  if (!samePath(journal.manifestPath, manifestPath)
    || !samePath(journal.sourceSidecarRoot, options.sourceSidecarRoot)
    || !samePath(journal.targetSidecarRoot, options.targetSidecarRoot)) {
    throw new Error("Identity migration journal paths do not match the expected recovery inputs.");
  }
  await assertCanonicalManifest(manifestPath, options.targetProjectId);
  if (journal.stage !== "completed" && journal.stage !== "rolled-back") {
    await assertContentHash(manifestPath, journal.manifestContentHash, "project Harness manifest changed before recovery");
  }
  const expectedDocuments = normalizeDocuments(
    options.jsonDocuments,
    resolve(options.sourceSidecarRoot),
    join(dirname(resolve(options.sourceSidecarRoot)), `.${options.targetProjectId}.${journal.transactionId}.staged`),
    resolve(options.targetSidecarRoot),
    journal.transactionId,
  );
  if (expectedDocuments.length !== journal.documents.length) {
    throw new Error("Identity migration journal document set does not match the expected recovery inputs.");
  }
  for (let index = 0; index < expectedDocuments.length; index += 1) {
    const expected = expectedDocuments[index];
    const actual = journal.documents[index];
    if (actual.kind !== expected.kind || actual.scope !== expected.scope
      || !samePath(actual.sourcePath, expected.sourcePath) || !samePath(actual.stagedPath, expected.stagedPath)
      || !sameNullablePath(actual.backupPath, expected.backupPath) || actual.required !== expected.required
      || !sameStrings(actual.allowedIdentityPaths, expected.allowedIdentityPaths)) {
      throw new Error("Identity migration journal document set does not match the expected recovery inputs.");
    }
  }
}

function assertJournalPaths(journal: ProjectIdentityMigrationJournal, suppliedJournalPath: string): void {
  assertPortableProjectId(journal.sourceProjectId, "journal source project id");
  assertPortableProjectId(journal.targetProjectId, "journal target project id");
  if (!PORTABLE_TRANSACTION_ID.test(journal.transactionId)) throw new Error("Identity migration journal transaction id is invalid.");
  assertExactSiblingPaths(journal.sourceSidecarRoot, journal.targetSidecarRoot);
  if (basename(resolve(journal.sourceSidecarRoot)) !== journal.sourceProjectId
    || basename(resolve(journal.targetSidecarRoot)) !== journal.targetProjectId) {
    throw new Error("Identity migration journal sidecar names do not match its project ids.");
  }
  const parent = dirname(resolve(journal.sourceSidecarRoot));
  const expectedJournal = join(parent, ".identity-transactions", journal.transactionId, "journal.json");
  const expectedStaged = join(parent, `.${journal.targetProjectId}.${journal.transactionId}.staged`);
  const expectedPrevious = join(parent, `.${journal.sourceProjectId}.${journal.transactionId}.previous`);
  if (resolve(suppliedJournalPath) !== resolve(expectedJournal) || resolve(journal.journalPath) !== resolve(expectedJournal)
    || resolve(journal.stagedSidecarRoot) !== resolve(expectedStaged)
    || resolve(journal.previousSidecarRoot) !== resolve(expectedPrevious)) {
    throw new Error("Identity migration journal contains unexpected transaction paths.");
  }
  for (const document of journal.documents) {
    if (document.scope === "sidecar") {
      assertWithinRoot(journal.sourceSidecarRoot, document.sourcePath, "Journal sidecar document");
      assertWithinRoot(journal.stagedSidecarRoot, document.stagedPath, "Journal staged sidecar document");
      if (document.backupPath !== null) throw new Error("Sidecar identity document must not have an external backup path.");
      continue;
    }
    if (document.stagedPath !== `${document.sourcePath}.${journal.transactionId}.next`
      || document.backupPath !== `${document.sourcePath}.${journal.transactionId}.previous`) {
      throw new Error("Identity migration journal contains unexpected external document paths.");
    }
  }
}

function isJournalDocument(value: unknown): value is ProjectIdentityMigrationDocumentJournal {
  if (!value || typeof value !== "object") return false;
  const document = value as Partial<ProjectIdentityMigrationDocumentJournal>;
  return (document.kind === "registry" || document.kind === "binding" || document.kind === "local-state" || document.kind === "runtime-state")
    && (document.scope === "external" || document.scope === "sidecar")
    && typeof document.sourcePath === "string" && typeof document.stagedPath === "string"
    && (document.backupPath === null || typeof document.backupPath === "string")
    && Array.isArray(document.allowedIdentityPaths) && document.allowedIdentityPaths.every((item) => typeof item === "string")
    && typeof document.required === "boolean" && typeof document.matchCount === "number"
    && isSha256(document.beforeContentHash) && isSha256(document.afterContentHash)
    && isSha256(document.beforeIdentityNeutralHash) && isSha256(document.afterIdentityNeutralHash)
    && (document.state === "prepared" || document.state === "backed-up"
      || document.state === "published-with-sidecar" || document.state === "published");
}

function sameNullablePath(left: string | null, right: string | null): boolean {
  return left === null || right === null ? left === right : samePath(left, right);
}

function samePath(left: string, right: string): boolean {
  const leftPath = resolve(left);
  const rightPath = resolve(right);
  return process.platform === "win32"
    ? leftPath.toLowerCase() === rightPath.toLowerCase()
    : leftPath === rightPath;
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function assertWithinRoot(root: string, path: string, label: string): void {
  const rel = relative(resolve(root), resolve(path));
  if (!rel || isAbsolute(rel) || rel === ".." || rel.startsWith(`..${sep}`)) {
    throw new Error(`${label} is outside its root: ${path}`);
  }
}

function assertOutsideRoot(root: string, path: string, label: string): void {
  const rel = relative(resolve(root), resolve(path));
  if (!rel || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`))) {
    throw new Error(`${label} must be outside ${root}: ${path}`);
  }
}

async function hashTree(root: string): Promise<string> {
  const physicalRoot = await assertIdentityMigrationPhysicalDirectory(root, "identity migration fingerprint root");
  await assertNoIdentityMigrationLinks(physicalRoot, "identity migration fingerprint root");
  const records: string[] = [];
  for (const relativePath of await collectFiles(physicalRoot)) {
    records.push(`${relativePath.replace(/\\/g, "/")}\0${await hashFile(join(physicalRoot, relativePath))}`);
  }
  return hashBytes(records.join("\n"));
}

async function assertTreeFingerprint(root: string, expected: string, label: string): Promise<void> {
  if (!isSha256(expected)) throw new Error(`${label}: expected fingerprint is missing or invalid.`);
  const actual = await hashTree(root);
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, received ${actual}.`);
}

async function hashFile(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

function hashBytes(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

async function assertContentHash(path: string, expected: string, label: string): Promise<void> {
  if (!isSha256(expected)) throw new Error(`${label}: expected content hash is missing or invalid.`);
  await assertIdentityMigrationPhysicalFile(path, label);
  const actual = await hashFile(path);
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, received ${actual}.`);
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function assertAbsent(path: string, label: string): void {
  if (existsSync(path)) throw new Error(`${label} already exists: ${path}`);
}

async function inject(
  options: MigrateProjectIdentityOptions,
  stage: Exclude<ProjectIdentityMigrationStage, "preparing" | "cleanup-in-progress" | "completed" | "rolled-back">,
  journal: ProjectIdentityMigrationJournal,
): Promise<void> {
  await options.failureInjection?.(stage, journal);
}

function resultFromJournal(journal: ProjectIdentityMigrationJournal): ProjectIdentityMigrationResult {
  if (journal.stage !== "completed" && journal.stage !== "rolled-back") {
    throw new Error(`Project identity migration is not terminal: ${journal.stage}`);
  }
  return {
    journalPath: journal.journalPath,
    stage: journal.stage,
    sourceProjectId: journal.sourceProjectId,
    targetProjectId: journal.targetProjectId,
    sqliteProofs: journal.sqliteProofs,
    documents: journal.documents,
  };
}
