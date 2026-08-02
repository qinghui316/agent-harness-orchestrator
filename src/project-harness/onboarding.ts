import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  symlink,
} from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { z } from "zod";
import { parseJsonText, writeJsonFile } from "../fs/json.js";
import { loadCompleteAnalysisBundle } from "./analysis-bundle.js";
import { createProjectHarnessCandidate } from "./creator.js";
import { auditProjectHarness, doctorProjectHarness } from "./diagnostics.js";
import {
  assertRequiredProjectHarnessBindings,
  discoverProjectHarness,
  type ProjectHarnessDiscovery,
} from "./discovery.js";
import { fingerprintProjectHarness, fingerprintProjectHarnessContent } from "./fingerprint.js";
import { readProjectHarnessManifest } from "./manifest.js";
import { assertNoLinkedPathAncestors, assertPhysicalDirectory } from "./path-safety.js";
import { assertPortableProjectId } from "./project-id.js";
import { parseFullBundleReview } from "./reviews.js";
import { SourceFingerprintSnapshot } from "./source-fingerprint.js";
import {
  projectHarnessSharedWriterRoot,
  withProjectHarnessWriterLock,
} from "./writer-lock.js";

export const PROJECT_HARNESS_ONBOARDING_STAGES = [
  "prepared",
  "candidate-staged",
  "skill-published",
  "claude-linked",
  "completed",
  "rolled-back",
] as const;

export type ProjectHarnessOnboardingStage = typeof PROJECT_HARNESS_ONBOARDING_STAGES[number];

const recordSchema = z.object({
  schema_version: z.literal("1.0"),
  transaction_id: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,127}$/),
  project_id: z.string().min(1),
  project_root: z.string().min(1),
  sidecar_root: z.string().min(1),
  workspace_root: z.string().min(1),
  bundle_root: z.string().min(1),
  candidate_root: z.string().min(1),
  staged_root: z.string().min(1),
  skill_root: z.string().min(1),
  claude_link: z.string().min(1),
  skill_name: z.string().min(1),
  author_id: z.string().min(1),
  reviewer_id: z.string().min(1).nullable(),
  bundle_fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  candidate_fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  candidate_content_fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  source_snapshot_digest: z.string().regex(/^[a-f0-9]{64}$/),
  source_paths: z.array(z.string()),
  stage: z.enum(PROJECT_HARNESS_ONBOARDING_STAGES),
  error: z.string().nullable(),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
}).strict();

export type ProjectHarnessOnboardingRecord = z.infer<typeof recordSchema>;

export interface ProjectHarnessOnboardingWorkspace {
  root: string;
  bundleRoot: string;
  candidateRoot: string;
  reviewRoot: string;
  reviewPath: string;
  recordPath: string;
}

export interface PrepareProjectHarnessOnboardingOptions {
  projectId: string;
  projectRoot: string;
  sidecarRoot: string;
  authorId: string;
  scaffoldRoot?: string;
  compiledRuntimeEntry?: string;
  transactionId?: string;
}

export interface PublishProjectHarnessOnboardingOptions {
  projectId: string;
  projectRoot: string;
  sidecarRoot: string;
  reviewerId: string;
  failureInjection?: (stage: ProjectHarnessOnboardingStage) => Promise<void> | void;
}

export interface ProjectHarnessOnboardingResult {
  record: ProjectHarnessOnboardingRecord;
  discovery: ProjectHarnessDiscovery;
  doctor: Awaited<ReturnType<typeof doctorProjectHarness>>;
  audit: Awaited<ReturnType<typeof auditProjectHarness>>;
}

export async function ensureProjectHarnessOnboardingWorkspace(
  projectId: string,
  projectRoot: string,
  sidecarRoot: string,
): Promise<ProjectHarnessOnboardingWorkspace> {
  assertPortableProjectId(projectId);
  await assertNoLinkedPathAncestors(projectRoot, "project source");
  await assertPhysicalDirectory(projectRoot, "project source");
  await assertNoLinkedPathAncestors(sidecarRoot, "project runtime sidecar");
  await mkdir(sidecarRoot, { recursive: true });
  await assertNoLinkedPathAncestors(sidecarRoot, "project runtime sidecar");
  const sidecar = await assertPhysicalDirectory(sidecarRoot, "project runtime sidecar");
  const root = join(sidecar, "onboarding");
  const bundleRoot = join(root, "bundle");
  const candidateParent = join(root, "candidate");
  const reviewRoot = join(root, "review");
  await Promise.all([
    mkdir(bundleRoot, { recursive: true }),
    mkdir(candidateParent, { recursive: true }),
    mkdir(reviewRoot, { recursive: true }),
  ]);
  await Promise.all([
    assertNoLinkedPathAncestors(root, "project Harness onboarding workspace"),
    assertNoLinkedPathAncestors(bundleRoot, "project Harness onboarding bundle"),
    assertNoLinkedPathAncestors(candidateParent, "project Harness onboarding candidate root"),
    assertNoLinkedPathAncestors(reviewRoot, "project Harness onboarding review root"),
  ]);
  await assertPhysicalDirectory(root, "project Harness onboarding workspace");
  await assertPhysicalDirectory(bundleRoot, "project Harness onboarding bundle");
  await assertPhysicalDirectory(reviewRoot, "project Harness onboarding review root");
  return {
    root,
    bundleRoot,
    candidateRoot: join(candidateParent, `${projectId}-harness`),
    reviewRoot,
    reviewPath: join(reviewRoot, "full-bundle-review.json"),
    recordPath: join(root, "transaction.json"),
  };
}

export async function prepareProjectHarnessOnboarding(
  options: PrepareProjectHarnessOnboardingOptions,
): Promise<ProjectHarnessOnboardingRecord> {
  if (!options.authorId.trim()) throw new Error("Project Harness onboarding author identity is required.");
  if (options.transactionId && !/^[a-z0-9][a-z0-9._-]{0,127}$/.test(options.transactionId)) {
    throw new Error("Project Harness onboarding transaction id is not portable.");
  }
  const projectRoot = await assertPhysicalDirectory(options.projectRoot, "project source");
  const workspace = await ensureProjectHarnessOnboardingWorkspace(
    options.projectId,
    projectRoot,
    options.sidecarRoot,
  );
  return withProjectHarnessWriterLock(projectHarnessSharedWriterRoot(resolve(options.sidecarRoot)), {
    projectId: options.projectId,
    ownerId: options.transactionId ?? `onboard-prepare-${process.pid}`,
    operation: "init",
  }, async () => {
    if (await discoverProjectHarness(projectRoot)) {
      throw new Error("Project Harness onboarding is already complete or discovery is occupied.");
    }
    const prepared = await readExistingPreparedRecord(workspace, options);
    if (prepared) return prepared;
    await resetOwnedCandidate(workspace, options.projectId);
    try {
      const bundle = await loadCompleteAnalysisBundle({
        bundleRoot: workspace.bundleRoot,
        projectRoot,
        projectId: options.projectId,
        operation: "init",
        allowExecutableArtifacts: true,
      });
      const snapshot = new SourceFingerprintSnapshot({ projectRoot });
      const sourceSnapshotDigest = await snapshot.digest(bundle.sourcePaths);
      const candidate = await createProjectHarnessCandidate({
        bundle,
        projectRoot,
        projectId: options.projectId,
        candidateRoot: workspace.candidateRoot,
        workspaceRoot: workspace.root,
        scaffoldRoot: options.scaffoldRoot,
        compiledRuntimeEntry: options.compiledRuntimeEntry,
        revision: 1,
      });
      const transactionId = options.transactionId ?? `onboard-${randomUUID().toLowerCase()}`;
      const skillParent = join(projectRoot, ".agents", "skills");
      const skillRoot = join(skillParent, candidate.skillName);
      const now = new Date().toISOString();
      const record: ProjectHarnessOnboardingRecord = {
        schema_version: "1.0",
        transaction_id: transactionId,
        project_id: options.projectId,
        project_root: projectRoot,
        sidecar_root: resolve(options.sidecarRoot),
        workspace_root: workspace.root,
        bundle_root: workspace.bundleRoot,
        candidate_root: candidate.candidateRoot,
        staged_root: join(skillParent, `.${candidate.skillName}.${transactionId}.candidate`),
        skill_root: skillRoot,
        claude_link: join(projectRoot, ".claude", "skills", candidate.skillName),
        skill_name: candidate.skillName,
        author_id: options.authorId,
        reviewer_id: null,
        bundle_fingerprint: bundle.contentFingerprint,
        candidate_fingerprint: candidate.fullFingerprint,
        candidate_content_fingerprint: candidate.contentFingerprint,
        source_snapshot_digest: sourceSnapshotDigest,
        source_paths: bundle.sourcePaths,
        stage: "prepared",
        error: null,
        created_at: now,
        updated_at: now,
      };
      assertRecordPaths(record, workspace);
      await writeJsonFile(workspace.recordPath, record);
      return record;
    } catch (error) {
      if (existsSync(workspace.candidateRoot)) {
        await rm(workspace.candidateRoot, { recursive: true, force: false });
      }
      throw error;
    }
  });
}

export async function publishProjectHarnessOnboarding(
  options: PublishProjectHarnessOnboardingOptions,
): Promise<ProjectHarnessOnboardingResult> {
  if (!options.reviewerId.trim()) throw new Error("Project Harness onboarding reviewer identity is required.");
  const workspace = await ensureProjectHarnessOnboardingWorkspace(
    options.projectId,
    options.projectRoot,
    options.sidecarRoot,
  );
  return withProjectHarnessWriterLock(projectHarnessSharedWriterRoot(resolve(options.sidecarRoot)), {
    projectId: options.projectId,
    ownerId: `onboarding-publish-${process.pid}`,
    operation: "init",
  }, async ({ assertCurrent }) => {
    let record = await readOnboardingRecord(workspace.recordPath);
    assertRecordPaths(record, workspace);
    assertRequestBinding(record, options);
    if (record.stage === "completed") {
      const result = await completedResult(record);
      await cleanupCommittedCandidate(record);
      return result;
    }
    if (record.stage === "rolled-back") {
      record = await advanceRecord(workspace.recordPath, record, "prepared", { reviewer_id: null, error: null });
    }
    let result: ProjectHarnessOnboardingResult;
    try {
      const reviewRaw = parseJsonText(await readFile(workspace.reviewPath, "utf8"), workspace.reviewPath);
      const review = parseFullBundleReview(reviewRaw, {
        candidateFingerprint: record.candidate_fingerprint,
        sourceSnapshotDigest: record.source_snapshot_digest,
      });
      if (review.author_id !== record.author_id || review.reviewer_id !== options.reviewerId) {
        throw new Error("Full bundle review identities do not match the Runtime-owned author and reviewer executions.");
      }
      if (review.decision !== "approve") throw new Error("Full bundle review blocked project Harness onboarding.");
      record = await advanceRecord(workspace.recordPath, record, record.stage, { reviewer_id: options.reviewerId });
      await assertCurrent();
      await revalidatePreparedCandidate(record);
      result = await publishInitialCandidate(record, workspace.recordPath, options.failureInjection);
    } catch (error) {
      const persisted = await readOnboardingRecord(workspace.recordPath);
      assertRecordPaths(persisted, workspace);
      assertRequestBinding(persisted, options);
      if (persisted.stage === "completed") throw error;
      record = await rollbackInitialPublication(persisted, workspace.recordPath, error);
      throw new Error(`Project Harness onboarding rolled back: ${message(error)}`);
    }
    await options.failureInjection?.("completed");
    await cleanupCommittedCandidate(result.record);
    return result;
  });
}

export async function recoverProjectHarnessOnboarding(
  projectId: string,
  projectRoot: string,
  sidecarRoot: string,
): Promise<ProjectHarnessOnboardingRecord | null> {
  const workspace = await ensureProjectHarnessOnboardingWorkspace(projectId, projectRoot, sidecarRoot);
  if (!existsSync(workspace.recordPath)) return null;
  let record = await readOnboardingRecord(workspace.recordPath);
  assertRecordPaths(record, workspace);
  assertRequestBinding(record, { projectId, projectRoot, sidecarRoot });
  if (record.stage === "completed") {
    await completedResult(record);
    await cleanupCommittedCandidate(record);
    return record;
  }
  if (["prepared", "rolled-back"].includes(record.stage)) return record;
  return withProjectHarnessWriterLock(projectHarnessSharedWriterRoot(record.sidecar_root), {
    projectId: record.project_id,
    ownerId: `${record.transaction_id}-recovery`,
    operation: "init",
  }, async () => {
    record = await rollbackInitialPublication(
      record,
      workspace.recordPath,
      new Error(`Recovered incomplete onboarding at ${record.stage}.`),
    );
    return record;
  });
}

async function publishInitialCandidate(
  initial: ProjectHarnessOnboardingRecord,
  recordPath: string,
  failureInjection?: PublishProjectHarnessOnboardingOptions["failureInjection"],
): Promise<ProjectHarnessOnboardingResult> {
  let record = initial;
  await assertNoLinkedPathAncestors(dirname(record.skill_root), "Codex project Skill root");
  await assertNoLinkedPathAncestors(dirname(record.claude_link), "Claude project Skill root");
  await mkdir(dirname(record.skill_root), { recursive: true });
  await mkdir(dirname(record.claude_link), { recursive: true });
  await assertNoLinkedPathAncestors(dirname(record.skill_root), "Codex project Skill root");
  await assertNoLinkedPathAncestors(dirname(record.claude_link), "Claude project Skill root");
  await assertPhysicalDirectory(dirname(record.skill_root), "Codex project Skill root");
  await assertPhysicalDirectory(dirname(record.claude_link), "Claude project Skill root");
  assertExactSibling(dirname(record.skill_root), record.staged_root);

  if (record.stage === "prepared") {
    if (existsSync(record.skill_root) || existsSync(record.claude_link) || existsSync(record.staged_root)) {
      throw new Error("Project Harness onboarding publication paths are occupied.");
    }
    await copyPhysicalTree(record.candidate_root, record.staged_root);
    await assertCandidateFingerprint(record.staged_root, record.candidate_fingerprint);
    record = await advanceRecord(recordPath, record, "candidate-staged");
    await failureInjection?.("candidate-staged");
  }
  if (record.stage === "candidate-staged") {
    if (existsSync(record.skill_root)) throw new Error("Canonical project Harness path became occupied.");
    await revalidatePreparedCandidate(record);
    await assertCandidateFingerprint(record.staged_root, record.candidate_fingerprint);
    await rename(record.staged_root, record.skill_root);
    record = await advanceRecord(recordPath, record, "skill-published");
    await failureInjection?.("skill-published");
  }
  if (record.stage === "skill-published") {
    await assertCandidateFingerprint(record.skill_root, record.candidate_fingerprint);
    if (existsSync(record.claude_link)) throw new Error("Claude project Harness discovery path became occupied.");
    await symlink(record.skill_root, record.claude_link, process.platform === "win32" ? "junction" : "dir");
    record = await advanceRecord(recordPath, record, "claude-linked");
    await failureInjection?.("claude-linked");
  }
  if (record.stage !== "claude-linked") {
    throw new Error(`Project Harness onboarding reached an invalid pre-commit stage: ${record.stage}.`);
  }
  await assertOwnedClaudeLink(record);
  const discovery = await discoverProjectHarness(record.project_root);
  if (!discovery || discovery.handle.projectId !== record.project_id) {
    throw new Error("Published project Harness cannot be rediscovered with its canonical identity.");
  }
  assertRequiredProjectHarnessBindings(discovery);
  const [doctor, audit] = await Promise.all([
    doctorProjectHarness({
      skillRoot: record.skill_root,
      projectRoot: record.project_root,
      expectedProjectId: record.project_id,
    }),
    auditProjectHarness({
      skillRoot: record.skill_root,
      projectRoot: record.project_root,
      expectedProjectId: record.project_id,
    }),
  ]);
  if (!doctor.healthy || !audit.healthy) {
    throw new Error(`Published project Harness failed readiness: ${[...doctor.findings, ...audit.findings].map((item) => item.message).join("; ")}`);
  }
  record = await advanceRecord(recordPath, record, "completed");
  return { record, discovery, doctor, audit };
}

async function completedResult(record: ProjectHarnessOnboardingRecord): Promise<ProjectHarnessOnboardingResult> {
  const discovery = await discoverProjectHarness(record.project_root);
  if (!discovery || discovery.handle.projectId !== record.project_id) {
    throw new Error("Completed project Harness onboarding is no longer discoverable.");
  }
  assertRequiredProjectHarnessBindings(discovery);
  if (await fingerprintProjectHarnessContent(discovery.handle.skillRoot) !== record.candidate_content_fingerprint) {
    throw new Error("Completed project Harness static content no longer matches its reviewed candidate.");
  }
  const [doctor, audit] = await Promise.all([
    doctorProjectHarness({
      skillRoot: discovery.handle.skillRoot,
      projectRoot: record.project_root,
      expectedProjectId: record.project_id,
    }),
    auditProjectHarness({
      skillRoot: discovery.handle.skillRoot,
      projectRoot: record.project_root,
      expectedProjectId: record.project_id,
    }),
  ]);
  if (!doctor.healthy || !audit.healthy) throw new Error("Completed project Harness onboarding is unhealthy.");
  return { record, discovery, doctor, audit };
}

async function rollbackInitialPublication(
  record: ProjectHarnessOnboardingRecord,
  recordPath: string,
  error: unknown,
): Promise<ProjectHarnessOnboardingRecord> {
  if (record.stage === "completed") {
    throw new Error("A completed project Harness onboarding transaction cannot be rolled back.");
  }
  if (existsSync(record.claude_link)) await assertOwnedClaudeLink(record);
  if (existsSync(record.skill_root)) {
    await assertCandidateFingerprint(record.skill_root, record.candidate_fingerprint);
    const manifest = await readProjectHarnessManifest(record.skill_root);
    if (manifest.project_id !== record.project_id || manifest.skill_name !== record.skill_name || manifest.skill_revision !== 1) {
      throw new Error("Refusing to roll back a project Harness that is no longer owned by this onboarding transaction.");
    }
  }
  if (existsSync(record.staged_root)) {
    await assertCandidateFingerprint(record.staged_root, record.candidate_fingerprint);
  }
  if (existsSync(record.claude_link)) {
    await rm(record.claude_link, { force: false });
  }
  if (existsSync(record.skill_root)) {
    await rm(record.skill_root, { recursive: true, force: false });
  }
  if (existsSync(record.staged_root)) {
    await rm(record.staged_root, { recursive: true, force: false });
  }
  return advanceRecord(recordPath, record, "rolled-back", { error: message(error) });
}

async function cleanupCommittedCandidate(record: ProjectHarnessOnboardingRecord): Promise<void> {
  if (!existsSync(record.candidate_root)) return;
  await assertCandidateFingerprint(record.candidate_root, record.candidate_fingerprint);
  await rm(record.candidate_root, { recursive: true, force: false });
}

async function revalidatePreparedCandidate(record: ProjectHarnessOnboardingRecord): Promise<void> {
  const bundle = await loadCompleteAnalysisBundle({
    bundleRoot: record.bundle_root,
    projectRoot: record.project_root,
    projectId: record.project_id,
    operation: "init",
    allowExecutableArtifacts: true,
  });
  if (bundle.contentFingerprint !== record.bundle_fingerprint
    || bundle.sourcePaths.join("\0") !== record.source_paths.join("\0")) {
    throw new Error("Project Harness onboarding bundle changed after candidate preparation.");
  }
  await assertCandidateFingerprint(record.candidate_root, record.candidate_fingerprint);
  const snapshot = new SourceFingerprintSnapshot({ projectRoot: record.project_root });
  if (await snapshot.digest(record.source_paths) !== record.source_snapshot_digest) {
    throw new Error("Project source snapshot changed after project Harness candidate review.");
  }
}

async function resetOwnedCandidate(workspace: ProjectHarnessOnboardingWorkspace, projectId: string): Promise<void> {
  if (!existsSync(workspace.candidateRoot)) return;
  if (!existsSync(workspace.recordPath)) {
    throw new Error("Project Harness onboarding candidate exists without Runtime ownership evidence.");
  }
  const record = await readOnboardingRecord(workspace.recordPath);
  assertRecordPaths(record, workspace);
  if (record.project_id !== projectId || record.stage === "completed") {
    throw new Error("Project Harness onboarding candidate belongs to another or completed transaction.");
  }
  if (record.stage === "prepared") {
    throw new Error("A prepared project Harness onboarding transaction must be published or explicitly recovered before replacement.");
  }
  if (record.stage !== "rolled-back") {
    throw new Error("Project Harness onboarding publication must be recovered before preparing another candidate.");
  }
  await assertCandidateFingerprint(workspace.candidateRoot, record.candidate_fingerprint);
  await rm(workspace.candidateRoot, { recursive: true, force: false });
}

async function readOnboardingRecord(path: string): Promise<ProjectHarnessOnboardingRecord> {
  return recordSchema.parse(parseJsonText(await readFile(path, "utf8"), path));
}

async function advanceRecord(
  path: string,
  record: ProjectHarnessOnboardingRecord,
  stage: ProjectHarnessOnboardingStage,
  patch: Partial<Pick<ProjectHarnessOnboardingRecord, "reviewer_id" | "error">> = {},
): Promise<ProjectHarnessOnboardingRecord> {
  const next = recordSchema.parse({
    ...record,
    ...patch,
    stage,
    updated_at: new Date().toISOString(),
  });
  await writeJsonFile(path, next);
  return next;
}

function assertRequestBinding(
  record: ProjectHarnessOnboardingRecord,
  options: Pick<PublishProjectHarnessOnboardingOptions, "projectId" | "projectRoot" | "sidecarRoot">,
): void {
  if (record.project_id !== options.projectId
    || normalize(record.project_root) !== normalize(options.projectRoot)
    || normalize(record.sidecar_root) !== normalize(options.sidecarRoot)) {
    throw new Error("Project Harness onboarding request does not match the Runtime-owned transaction.");
  }
}

function assertRecordPaths(record: ProjectHarnessOnboardingRecord, workspace: ProjectHarnessOnboardingWorkspace): void {
  const expectedSkillName = `${record.project_id}-harness`;
  const expectedSkillRoot = resolve(record.project_root, ".agents", "skills", expectedSkillName);
  const expectedClaudeLink = resolve(record.project_root, ".claude", "skills", expectedSkillName);
  const expectedStagedRoot = resolve(
    dirname(expectedSkillRoot),
    `.${expectedSkillName}.${record.transaction_id}.candidate`,
  );
  if (normalize(record.workspace_root) !== normalize(workspace.root)
    || normalize(record.bundle_root) !== normalize(workspace.bundleRoot)
    || normalize(record.candidate_root) !== normalize(workspace.candidateRoot)
    || record.skill_name !== expectedSkillName
    || normalize(record.skill_root) !== normalize(expectedSkillRoot)
    || normalize(record.claude_link) !== normalize(expectedClaudeLink)
    || normalize(record.staged_root) !== normalize(expectedStagedRoot)) {
    throw new Error("Project Harness onboarding transaction paths do not match Runtime ownership.");
  }
  assertExactSibling(dirname(record.skill_root), record.staged_root);
}

async function readExistingPreparedRecord(
  workspace: ProjectHarnessOnboardingWorkspace,
  options: PrepareProjectHarnessOnboardingOptions,
): Promise<ProjectHarnessOnboardingRecord | null> {
  if (!existsSync(workspace.recordPath)) return null;
  const record = await readOnboardingRecord(workspace.recordPath);
  assertRecordPaths(record, workspace);
  assertRequestBinding(record, options);
  if (record.stage !== "prepared") return null;
  if (!options.transactionId
    || record.transaction_id !== options.transactionId
    || record.author_id !== options.authorId) {
    throw new Error("A prepared project Harness onboarding transaction already owns this project.");
  }
  await revalidatePreparedCandidate(record);
  return record;
}

async function assertCandidateFingerprint(root: string, expected: string): Promise<void> {
  await assertPhysicalDirectory(root, "project Harness candidate");
  if (await fingerprintProjectHarness(root) !== expected) {
    throw new Error("Project Harness candidate no longer matches its reviewed fingerprint.");
  }
}

async function assertOwnedClaudeLink(record: ProjectHarnessOnboardingRecord): Promise<void> {
  const info = await lstat(record.claude_link);
  if (!info.isSymbolicLink()) throw new Error("Claude project Harness discovery path is not a transaction-owned link.");
  if (normalize(await realpath(record.claude_link)) !== normalize(record.skill_root)) {
    throw new Error("Claude project Harness discovery link targets another Skill.");
  }
}

async function copyPhysicalTree(sourceRoot: string, targetRoot: string): Promise<void> {
  const source = await assertPhysicalDirectory(sourceRoot, "project Harness source candidate");
  if (existsSync(targetRoot)) throw new Error(`Project Harness staging root already exists: ${targetRoot}`);
  await mkdir(targetRoot);
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const from = join(source, entry.name);
    const to = join(targetRoot, entry.name);
    const info = await lstat(from);
    if (info.isSymbolicLink()) throw new Error(`Project Harness candidate contains a link or Junction: ${from}`);
    if (info.isDirectory()) await copyPhysicalTree(from, to);
    else if (info.isFile()) await copyFile(from, to);
  }
}

function assertExactSibling(parent: string, path: string): void {
  const rel = relative(resolve(parent), resolve(path));
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || rel.includes(sep)) {
    throw new Error(`Project Harness onboarding staging path is not an exact sibling: ${path}`);
  }
}

function normalize(path: string): string {
  const value = resolve(path);
  return process.platform === "win32" ? value.toLowerCase() : value;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
