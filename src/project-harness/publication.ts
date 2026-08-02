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
  publishedContentFingerprint: string | null;
  preservedPaths: string[];
  commitEffectPaths: string[];
  requiresCommitEffect: boolean;
  commitEffectCompleted: boolean;
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
  commitEffect?: (stagedCandidateRoot: string) => Promise<void> | void;
  commitEffectPaths?: readonly string[];
  failureInjection?: (stage: ProjectHarnessPublicationStage) => void | Promise<void>;
}

export interface RecoverProjectHarnessPublicationOptions {
  sidecarRoot: string;
  journalPath: string;
  ownerId: string;
  expectedProjectId: string;
  expectedCurrentSkillRoot: string;
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
    const commitEffectPaths = normalizeCommitEffectPaths(options.commitEffectPaths ?? [], preservedPaths);
    if (Boolean(options.commitEffect) !== (commitEffectPaths.length > 0)) {
      throw new Error("Project Harness publication commit effect and its exact dynamic paths must be provided together.");
    }
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
      publishedContentFingerprint: null,
      preservedPaths,
      commitEffectPaths,
      requiresCommitEffect: options.commitEffect !== undefined,
      commitEffectCompleted: false,
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
      if (options.commitEffect) {
        await options.commitEffect(stagedCandidateRoot);
        journal = await markCommitEffectCompleted(journalPath, journal);
        if (await fingerprintProjectHarness(stagedCandidateRoot, { exclude: preservedPaths }) !== sourceCandidateFingerprint) {
          throw new Error("Project Harness publication commit effect changed reviewed static candidate content.");
        }
      }
      journal = await markPublishedContentFingerprint(
        journalPath,
        journal,
        await fingerprintProjectHarness(stagedCandidateRoot),
      );
      await inject(options, "candidate-staged");
      await assertCurrent();
      if (await fingerprintProjectHarness(currentSkillRoot) !== options.expectedCurrentFingerprint) {
        throw new Error("Current project Harness changed while the publication candidate was staged.");
      }

      await rename(currentSkillRoot, previousRoot);
      journal = await advanceJournal(journalPath, journal, "current-moved");
      await inject(options, "current-moved");

      await rename(stagedCandidateRoot, currentSkillRoot);
      journal = await advanceJournal(journalPath, journal, "candidate-published");
      await inject(options, "candidate-published");

      const publishedManifest = await readProjectHarnessManifest(currentSkillRoot);
      if (publishedManifest.skill_revision !== candidateManifest.skill_revision) {
        throw new Error("Published project Harness failed identity, revision, or content verification.");
      }
      await verifyPublishedCandidate(journal, true);
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
  return {
    ...value,
    publishedContentFingerprint: typeof value.publishedContentFingerprint === "string"
      ? value.publishedContentFingerprint
      : null,
    commitEffectPaths: Array.isArray(value.commitEffectPaths) ? value.commitEffectPaths : [],
    requiresCommitEffect: value.requiresCommitEffect === true,
    commitEffectCompleted: value.commitEffectCompleted === true,
  };
}

export async function recoverProjectHarnessPublication(
  options: RecoverProjectHarnessPublicationOptions,
): Promise<ProjectHarnessPublicationJournal> {
  const initial = await readProjectHarnessPublicationJournal(options.journalPath);
  assertJournalInsideSidecar(options.sidecarRoot, options.journalPath);
  assertRecoveryBinding(initial, options);
  return withProjectHarnessWriterLock(options.sidecarRoot, {
    projectId: initial.projectId,
    ownerId: options.ownerId,
    operation: "migrate",
  }, async () => {
    let journal = await readProjectHarnessPublicationJournal(options.journalPath);
    assertRecoveryBinding(journal, options);
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
      if (journal.requiresCommitEffect && !journal.commitEffectCompleted) {
        journal = await rollbackPublication(
          options.journalPath,
          journal,
          new Error("Recovered publication before its required commit effect completed."),
        );
        await verifyRestoredCurrent(journal);
        return journal;
      }
      try {
        await verifyPublishedCandidate(journal, true);
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
      await assertRollbackCandidateAuthority(journal);
      await rm(journal.currentSkillRoot, { recursive: true });
    } else {
      await assertPreviousRootAuthority(journal);
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

async function assertPreviousRootAuthority(journal: ProjectHarnessPublicationJournal): Promise<void> {
  const manifest = await readProjectHarnessManifest(journal.previousRoot);
  const fingerprint = await fingerprintProjectHarness(journal.previousRoot);
  if (manifest.project_id !== journal.projectId
    || manifest.skill_name !== journal.skillName
    || fingerprint !== journal.currentContentFingerprint) {
    throw new Error(
      "Project Harness rollback refused because the previous root does not match this transaction's pre-publication state.",
    );
  }
}

async function assertRollbackCandidateAuthority(journal: ProjectHarnessPublicationJournal): Promise<void> {
  const manifest = await readProjectHarnessManifest(journal.currentSkillRoot);
  const contentFingerprint = await fingerprintProjectHarness(journal.currentSkillRoot, { exclude: journal.preservedPaths });
  const fullFingerprint = await fingerprintProjectHarness(journal.currentSkillRoot);
  if (manifest.project_id !== journal.projectId
    || manifest.skill_name !== journal.skillName
    || contentFingerprint !== journal.candidateContentFingerprint
    || journal.publishedContentFingerprint === null
    || fullFingerprint !== journal.publishedContentFingerprint) {
    throw new Error(
      "Project Harness rollback refused because the canonical root no longer matches this transaction's published candidate.",
    );
  }
}

async function verifyPublishedCandidate(
  journal: ProjectHarnessPublicationJournal,
  requireTransactionState = false,
): Promise<void> {
  if (!existsSync(journal.currentSkillRoot)) throw new Error("Published project Harness root is missing.");
  const manifest = await readProjectHarnessManifest(journal.currentSkillRoot);
  const fingerprint = await fingerprintProjectHarness(journal.currentSkillRoot, { exclude: journal.preservedPaths });
  if (manifest.project_id !== journal.projectId
    || manifest.skill_name !== journal.skillName
    || fingerprint !== journal.candidateContentFingerprint) {
    throw new Error("Published project Harness does not match its journal identity or fingerprint.");
  }
  if (requireTransactionState) {
    const fullFingerprint = await fingerprintProjectHarness(journal.currentSkillRoot);
    if (journal.publishedContentFingerprint === null || fullFingerprint !== journal.publishedContentFingerprint) {
      throw new Error("Published project Harness no longer matches the transaction state recorded before publication.");
    }
  }
  if (existsSync(journal.previousRoot)) {
    for (const path of journal.preservedPaths) {
      await assertPreservedPathParity(
        journal.previousRoot,
        journal.currentSkillRoot,
        path,
        journal.commitEffectPaths,
      );
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

async function markCommitEffectCompleted(
  path: string,
  journal: ProjectHarnessPublicationJournal,
): Promise<ProjectHarnessPublicationJournal> {
  const next = {
    ...journal,
    commitEffectCompleted: true,
    updatedAt: new Date().toISOString(),
  };
  await writeJsonFile(path, next);
  return next;
}

async function markPublishedContentFingerprint(
  path: string,
  journal: ProjectHarnessPublicationJournal,
  fingerprint: string,
): Promise<ProjectHarnessPublicationJournal> {
  const next = {
    ...journal,
    publishedContentFingerprint: fingerprint,
    updatedAt: new Date().toISOString(),
  };
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

async function assertPreservedPathParity(
  previousRoot: string,
  currentRoot: string,
  path: string,
  commitEffectPaths: readonly string[],
): Promise<void> {
  const before = join(previousRoot, path);
  const after = join(currentRoot, path);
  if (!existsSync(before) && !existsSync(after)) return;
  if (existsSync(before) !== existsSync(after)) throw new Error(`Preserved project Harness state changed: ${path}`);
  const exclusions = commitEffectPaths
    .filter((effectPath) => effectPath.startsWith(`${path}/`))
    .map((effectPath) => effectPath.slice(path.length + 1));
  const beforeHash = await fingerprintPath(previousRoot, path, exclusions);
  const afterHash = await fingerprintPath(currentRoot, path, exclusions);
  if (beforeHash !== afterHash) throw new Error(`Preserved project Harness state hash changed: ${path}`);
}

async function fingerprintPath(root: string, path: string, exclude: readonly string[]): Promise<string> {
  const absolute = join(root, path);
  const info = await lstat(absolute);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error(`Preserved project Harness path must be a physical directory: ${absolute}`);
  }
  return fingerprintProjectHarness(absolute, { exclude });
}

function normalizePreservedPaths(paths: readonly string[]): string[] {
  const allowed = new Set<string>(PROJECT_HARNESS_DYNAMIC_PATHS);
  const normalized = paths.map((path) => {
    const value = path.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    if (!value || value === "." || value.split("/").some((segment) => !segment || segment === "." || segment === "..")
      || /^[A-Za-z]:/.test(value) || !allowed.has(value)) {
      throw new Error(`Project Harness preserved path is not an allowed dynamic path: ${path}`);
    }
    return value;
  });
  if (new Set(normalized).size !== normalized.length) {
    throw new Error("Project Harness preserved paths must be unique.");
  }
  return normalized.sort();
}

function normalizeCommitEffectPaths(paths: readonly string[], preservedPaths: readonly string[]): string[] {
  const normalized = paths.map((path) => {
    const value = path.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    if (!value || value === "." || value.split("/").some((segment) => !segment || segment === "." || segment === "..")
      || /^[A-Za-z]:/.test(value)
      || !preservedPaths.some((preserved) => value.startsWith(`${preserved}/`))) {
      throw new Error(`Project Harness commit effect path must name an artifact below preserved dynamic state: ${path}`);
    }
    return value;
  });
  if (new Set(normalized).size !== normalized.length) {
    throw new Error("Project Harness commit effect paths must be unique.");
  }
  return normalized.sort();
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
  const expectedStaged = join(parent, `.${journal.skillName}.${journal.transactionId}.candidate`);
  const expectedPrevious = join(parent, `.${journal.skillName}.${journal.transactionId}.previous`);
  if (resolve(journal.stagedCandidateRoot) !== resolve(expectedStaged)
    || resolve(journal.previousRoot) !== resolve(expectedPrevious)) {
    throw new Error("Project Harness publication journal staging paths do not match its transaction identity.");
  }
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

function assertRecoveryBinding(
  journal: ProjectHarnessPublicationJournal,
  options: RecoverProjectHarnessPublicationOptions,
): void {
  if (journal.projectId !== options.expectedProjectId) {
    throw new Error("Project Harness publication journal project identity does not match recovery authority.");
  }
  if (resolve(journal.currentSkillRoot) !== resolve(options.expectedCurrentSkillRoot)) {
    throw new Error("Project Harness publication journal Skill root does not match recovery authority.");
  }
  if (journal.skillName !== basename(options.expectedCurrentSkillRoot)
    || basename(options.journalPath) !== `${journal.transactionId}.json`) {
    throw new Error("Project Harness publication journal transaction identity does not match recovery authority.");
  }
  normalizePreservedPaths(journal.preservedPaths);
  normalizeCommitEffectPaths(journal.commitEffectPaths, journal.preservedPaths);
}

async function inject(
  options: PublishProjectHarnessCandidateOptions,
  stage: ProjectHarnessPublicationStage,
): Promise<void> {
  await options.failureInjection?.(stage);
}
