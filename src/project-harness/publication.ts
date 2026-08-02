import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, lstat, mkdir, readFile, readdir, rename, rm } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { parseJsonText, writeJsonFile } from "../fs/json.js";
import {
  fingerprintProjectHarness,
  PROJECT_HARNESS_DYNAMIC_PATHS,
} from "./fingerprint.js";
import { readProjectHarnessManifest } from "./manifest.js";
import { assertPhysicalDirectory } from "./path-safety.js";
import { withProjectHarnessWriterLock } from "./writer-lock.js";

export type ProjectHarnessPublicationStage =
  | "prepared"
  | "candidate-staged"
  | "current-moved"
  | "candidate-published"
  | "verified"
  | "completed"
  | "rolled-back";

export interface ProjectHarnessPublicationJournal {
  schemaVersion: "1.0";
  transactionId: string;
  projectId: string;
  skillName: string;
  currentSkillRoot: string;
  sourceCandidateRoot: string;
  stagedCandidateRoot: string;
  previousRoot: string;
  currentContentFingerprint: string;
  candidateContentFingerprint: string;
  preservedPaths: string[];
  stage: ProjectHarnessPublicationStage;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublishProjectHarnessCandidateOptions {
  projectId: string;
  ownerId: string;
  currentSkillRoot: string;
  candidateSkillRoot: string;
  sidecarRoot: string;
  expectedCurrentFingerprint: string;
  expectedCandidateContentFingerprint: string;
  preservedPaths?: readonly string[];
  transactionId?: string;
  failureInjection?: (stage: ProjectHarnessPublicationStage) => void | Promise<void>;
}

export interface RecoverProjectHarnessPublicationOptions {
  sidecarRoot: string;
  journalPath: string;
  ownerId: string;
}

export async function publishProjectHarnessCandidate(
  options: PublishProjectHarnessCandidateOptions,
): Promise<ProjectHarnessPublicationJournal> {
  return withProjectHarnessWriterLock(options.sidecarRoot, {
    projectId: options.projectId,
    ownerId: options.ownerId,
    operation: "migrate",
  }, async ({ assertCurrent }) => {
    const currentSkillRoot = await assertPhysicalDirectory(options.currentSkillRoot, "current project Harness");
    const sourceCandidateRoot = await assertPhysicalDirectory(options.candidateSkillRoot, "project Harness candidate");
    const currentManifest = await readProjectHarnessManifest(currentSkillRoot);
    const candidateManifest = await readProjectHarnessManifest(sourceCandidateRoot);
    if (currentManifest.project_id !== options.projectId || candidateManifest.project_id !== options.projectId) {
      throw new Error("Project Harness publication identity does not match the requested project id.");
    }
    if (currentManifest.skill_name !== candidateManifest.skill_name || currentManifest.skill_name !== basename(currentSkillRoot)) {
      throw new Error("Project Harness publication skill identity is inconsistent.");
    }
    if (candidateManifest.skill_revision !== currentManifest.skill_revision + 1) {
      throw new Error("Project Harness candidate revision must increment the current revision exactly once.");
    }
    const preservedPaths = normalizePreservedPaths(options.preservedPaths ?? PROJECT_HARNESS_DYNAMIC_PATHS);
    const currentFingerprint = await fingerprintProjectHarness(currentSkillRoot);
    if (currentFingerprint !== options.expectedCurrentFingerprint) {
      throw new Error("Current project Harness fingerprint changed before publication.");
    }
    const sourceCandidateFingerprint = await fingerprintProjectHarness(sourceCandidateRoot, { exclude: preservedPaths });
    if (sourceCandidateFingerprint !== options.expectedCandidateContentFingerprint) {
      throw new Error("Project Harness candidate content fingerprint does not match the reviewed candidate.");
    }

    const transactionId = options.transactionId ?? `publication-${randomUUID()}`;
    const parent = dirname(currentSkillRoot);
    const stagedCandidateRoot = join(parent, `.${currentManifest.skill_name}.${transactionId}.candidate`);
    const previousRoot = join(parent, `.${currentManifest.skill_name}.${transactionId}.previous`);
    assertPublicationSibling(parent, stagedCandidateRoot);
    assertPublicationSibling(parent, previousRoot);
    if (existsSync(stagedCandidateRoot) || existsSync(previousRoot)) {
      throw new Error(`Project Harness publication staging path already exists: ${transactionId}`);
    }
    const journalPath = join(options.sidecarRoot, "transactions", `${transactionId}.json`);
    const now = new Date().toISOString();
    let journal: ProjectHarnessPublicationJournal = {
      schemaVersion: "1.0",
      transactionId,
      projectId: options.projectId,
      skillName: currentManifest.skill_name,
      currentSkillRoot,
      sourceCandidateRoot,
      stagedCandidateRoot,
      previousRoot,
      currentContentFingerprint: currentFingerprint,
      candidateContentFingerprint: sourceCandidateFingerprint,
      preservedPaths,
      stage: "prepared",
      error: null,
      createdAt: now,
      updatedAt: now,
    };
    await writeJsonFile(journalPath, journal);
    await inject(options, "prepared");

    try {
      await copyPhysicalTree(sourceCandidateRoot, stagedCandidateRoot);
      for (const path of preservedPaths) {
        await replaceWithPreservedPath(currentSkillRoot, stagedCandidateRoot, path);
      }
      const stagedFingerprint = await fingerprintProjectHarness(stagedCandidateRoot, { exclude: preservedPaths });
      if (stagedFingerprint !== sourceCandidateFingerprint) {
        throw new Error("Staged project Harness content differs from the reviewed candidate.");
      }
      journal = await advanceJournal(journalPath, journal, "candidate-staged");
      await inject(options, "candidate-staged");
      await assertCurrent();

      await rename(currentSkillRoot, previousRoot);
      journal = await advanceJournal(journalPath, journal, "current-moved");
      await inject(options, "current-moved");

      await rename(stagedCandidateRoot, currentSkillRoot);
      journal = await advanceJournal(journalPath, journal, "candidate-published");
      await inject(options, "candidate-published");

      const publishedManifest = await readProjectHarnessManifest(currentSkillRoot);
      const publishedFingerprint = await fingerprintProjectHarness(currentSkillRoot, { exclude: preservedPaths });
      if (publishedManifest.project_id !== options.projectId
        || publishedManifest.skill_revision !== candidateManifest.skill_revision
        || publishedFingerprint !== sourceCandidateFingerprint) {
        throw new Error("Published project Harness failed identity, revision, or content verification.");
      }
      for (const path of preservedPaths) {
        await assertPreservedPathParity(previousRoot, currentSkillRoot, path);
      }
      journal = await advanceJournal(journalPath, journal, "verified");
      await inject(options, "verified");

      journal = await advanceJournal(journalPath, journal, "completed");
      await rm(previousRoot, { recursive: true });
      return journal;
    } catch (error) {
      journal = await rollbackPublication(journalPath, journal, error);
      throw new Error(`Project Harness publication rolled back at ${journal.stage}: ${(error as Error).message}`);
    }
  });
}

export async function readProjectHarnessPublicationJournal(path: string): Promise<ProjectHarnessPublicationJournal> {
  const value = parseJsonText(await readFile(path, "utf8"), path) as ProjectHarnessPublicationJournal;
  if (value.schemaVersion !== "1.0" || !value.transactionId || !value.projectId || !value.currentSkillRoot) {
    throw new Error(`Invalid project Harness publication journal: ${path}`);
  }
  return value;
}

export async function recoverProjectHarnessPublication(
  options: RecoverProjectHarnessPublicationOptions,
): Promise<ProjectHarnessPublicationJournal> {
  const initial = await readProjectHarnessPublicationJournal(options.journalPath);
  assertJournalInsideSidecar(options.sidecarRoot, options.journalPath);
  return withProjectHarnessWriterLock(options.sidecarRoot, {
    projectId: initial.projectId,
    ownerId: options.ownerId,
    operation: "migrate",
  }, async () => {
    let journal = await readProjectHarnessPublicationJournal(options.journalPath);
    assertJournalSiblingPaths(journal);
    if (journal.stage === "completed") {
      await verifyPublishedCandidate(journal);
      if (existsSync(journal.previousRoot)) await rm(journal.previousRoot, { recursive: true });
      if (existsSync(journal.stagedCandidateRoot)) await rm(journal.stagedCandidateRoot, { recursive: true });
      return journal;
    }
    if (journal.stage === "rolled-back") {
      await verifyRestoredCurrent(journal);
      return journal;
    }
    if (journal.stage === "candidate-published" || journal.stage === "verified") {
      try {
        await verifyPublishedCandidate(journal);
        journal = await advanceJournal(options.journalPath, journal, "completed");
        if (existsSync(journal.previousRoot)) await rm(journal.previousRoot, { recursive: true });
        if (existsSync(journal.stagedCandidateRoot)) await rm(journal.stagedCandidateRoot, { recursive: true });
        return journal;
      } catch (error) {
        journal = await rollbackPublication(options.journalPath, journal, error);
        await verifyRestoredCurrent(journal);
        return journal;
      }
    }
    journal = await rollbackPublication(
      options.journalPath,
      journal,
      new Error(`Recovered incomplete publication at ${journal.stage}.`),
    );
    await verifyRestoredCurrent(journal);
    return journal;
  });
}

async function rollbackPublication(
  journalPath: string,
  journal: ProjectHarnessPublicationJournal,
  error: unknown,
): Promise<ProjectHarnessPublicationJournal> {
  if (existsSync(journal.previousRoot)) {
    if (existsSync(journal.currentSkillRoot)) {
      await rm(journal.currentSkillRoot, { recursive: true });
    }
    await rename(journal.previousRoot, journal.currentSkillRoot);
  }
  if (existsSync(journal.stagedCandidateRoot)) await rm(journal.stagedCandidateRoot, { recursive: true });
  const rolledBack = {
    ...journal,
    stage: "rolled-back" as const,
    error: error instanceof Error ? error.message : String(error),
    updatedAt: new Date().toISOString(),
  };
  await writeJsonFile(journalPath, rolledBack);
  return rolledBack;
}

async function verifyPublishedCandidate(journal: ProjectHarnessPublicationJournal): Promise<void> {
  if (!existsSync(journal.currentSkillRoot)) throw new Error("Published project Harness root is missing.");
  const manifest = await readProjectHarnessManifest(journal.currentSkillRoot);
  const fingerprint = await fingerprintProjectHarness(journal.currentSkillRoot, { exclude: journal.preservedPaths });
  if (manifest.project_id !== journal.projectId
    || manifest.skill_name !== journal.skillName
    || fingerprint !== journal.candidateContentFingerprint) {
    throw new Error("Published project Harness does not match its journal identity or fingerprint.");
  }
  if (existsSync(journal.previousRoot)) {
    for (const path of journal.preservedPaths) {
      await assertPreservedPathParity(journal.previousRoot, journal.currentSkillRoot, path);
    }
  }
}

async function verifyRestoredCurrent(journal: ProjectHarnessPublicationJournal): Promise<void> {
  if (!existsSync(journal.currentSkillRoot)) throw new Error("Restored project Harness root is missing.");
  const fingerprint = await fingerprintProjectHarness(journal.currentSkillRoot);
  if (fingerprint !== journal.currentContentFingerprint) {
    throw new Error("Restored project Harness fingerprint does not match the pre-publication state.");
  }
}

async function advanceJournal(
  path: string,
  journal: ProjectHarnessPublicationJournal,
  stage: ProjectHarnessPublicationStage,
): Promise<ProjectHarnessPublicationJournal> {
  const next = { ...journal, stage, error: null, updatedAt: new Date().toISOString() };
  await writeJsonFile(path, next);
  return next;
}

async function copyPhysicalTree(source: string, target: string): Promise<void> {
  await mkdir(target);
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (entry.name === "__pycache__" || entry.name.endsWith(".pyc")) continue;
    const from = join(source, entry.name);
    const to = join(target, entry.name);
    const info = await lstat(from);
    if (info.isSymbolicLink()) throw new Error(`Project Harness candidate contains a link or Junction: ${from}`);
    if (info.isDirectory()) await copyPhysicalTree(from, to);
    else if (info.isFile()) await copyFile(from, to);
  }
}

async function replaceWithPreservedPath(currentRoot: string, stagedRoot: string, path: string): Promise<void> {
  const source = join(currentRoot, path);
  const target = join(stagedRoot, path);
  await rm(target, { recursive: true, force: true });
  if (!existsSync(source)) return;
  const info = await lstat(source);
  if (info.isSymbolicLink()) throw new Error(`Preserved project Harness state contains a link or Junction: ${source}`);
  await mkdir(dirname(target), { recursive: true });
  if (info.isDirectory()) await copyPhysicalTree(source, target);
  else await copyFile(source, target);
}

async function assertPreservedPathParity(previousRoot: string, currentRoot: string, path: string): Promise<void> {
  const before = join(previousRoot, path);
  const after = join(currentRoot, path);
  if (!existsSync(before) && !existsSync(after)) return;
  if (existsSync(before) !== existsSync(after)) throw new Error(`Preserved project Harness state changed: ${path}`);
  const beforeHash = await fingerprintPath(previousRoot, path);
  const afterHash = await fingerprintPath(currentRoot, path);
  if (beforeHash !== afterHash) throw new Error(`Preserved project Harness state hash changed: ${path}`);
}

async function fingerprintPath(root: string, path: string): Promise<string> {
  const absolute = join(root, path);
  const info = await lstat(absolute);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error(`Preserved project Harness path must be a physical directory: ${absolute}`);
  }
  return fingerprintProjectHarness(absolute);
}

function normalizePreservedPaths(paths: readonly string[]): string[] {
  return [...new Set(paths.map((path) => path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "")))].sort();
}

function assertPublicationSibling(parent: string, path: string): void {
  const rel = relative(parent, resolve(path));
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || rel.includes(sep)) {
    throw new Error(`Project Harness publication staging path is not an exact sibling: ${path}`);
  }
}

function assertJournalSiblingPaths(journal: ProjectHarnessPublicationJournal): void {
  const parent = dirname(journal.currentSkillRoot);
  assertPublicationSibling(parent, journal.stagedCandidateRoot);
  assertPublicationSibling(parent, journal.previousRoot);
  if (resolve(journal.currentSkillRoot) === resolve(journal.stagedCandidateRoot)
    || resolve(journal.currentSkillRoot) === resolve(journal.previousRoot)
    || resolve(journal.stagedCandidateRoot) === resolve(journal.previousRoot)) {
    throw new Error("Project Harness publication journal paths collide.");
  }
}

function assertJournalInsideSidecar(sidecarRoot: string, journalPath: string): void {
  const transactionsRoot = resolve(sidecarRoot, "transactions");
  const rel = relative(transactionsRoot, resolve(journalPath));
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || rel.includes(sep)) {
    throw new Error(`Project Harness publication journal is outside the sidecar transactions root: ${journalPath}`);
  }
}

async function inject(
  options: PublishProjectHarnessCandidateOptions,
  stage: ProjectHarnessPublicationStage,
): Promise<void> {
  await options.failureInjection?.(stage);
}
