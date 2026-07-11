import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, readFile, rm } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { atomicWriteFile, writeJsonFile } from "../fs/json.js";
import { assertWritableMemory } from "../memory/resolver.js";
import { withProjectWriteLease, type ProjectWriteLeaseScope } from "../project/project-write-lease.js";
import type {
  ManagedProject,
  MaintenanceDiffFile,
  MaintenanceDiffManifest,
  MaintenanceWorkspace,
  ProjectMemoryApplyFile,
  ProjectMemoryApplyResult,
  ProjectMemoryApplyRoot,
  ProjectMemoryApplyTransaction,
  ResolvedMemory,
} from "../types/index.js";
import { parseHarnessEngineeringAssignment, type HarnessEngineeringAssignment } from "./harness-engineering-contract.js";
import { createMaintenanceDiffManifest } from "./maintenance-diff.js";
import { hashTree, readMaintenanceTree, readMarkdownTree, type MarkdownTreeEntry } from "./maintenance-workspace.js";

const ALLOWED_MEMORY_NAMESPACES = ["docs", "harness/evolution", "harness/templates/change"];
const ALLOWED_REPO_NAMESPACES = ["AGENTS.md", ...ALLOWED_MEMORY_NAMESPACES];
const FORBIDDEN_NAMESPACE_MARKERS = [
  "harness/changes",
  "templates/system-skills",
  ".git",
  ".agent-harness",
  "src",
  "scripts",
  ".github",
];
const PROJECT_MEMORY_APPLY_STAGES: readonly ProjectMemoryApplyTransaction["stage"][] = [
  "prepared",
  "applying",
  "applied",
  "completed",
];

export interface ApplyReviewedMaintenanceAssignmentInput {
  project: ManagedProject;
  memory: ResolvedMemory;
  assignment: HarnessEngineeringAssignment;
  evidence: {
    version: "2.0";
    assignmentId: string;
    mode: "maintain-assigned-closeout" | "evolve-assigned-window";
    manifestHash: string;
    manifest: MaintenanceDiffManifest;
    reviews: Array<{ decision: "approve"; assignmentId: string; manifestHash: string }>;
    quorum: { required: 1 | 2; approved: 1 | 2 };
  };
}

export async function applyReviewedMaintenanceAssignment(
  input: ApplyReviewedMaintenanceAssignmentInput,
): Promise<ProjectMemoryApplyResult> {
  const assignment = parseHarnessEngineeringAssignment(input.assignment);
  assertWritableMemory(input.memory, "Project memory maintenance apply");
  assertAssignmentBoundary(input.memory, input.project, assignment);
  assertApprovedEvidence(assignment, input.evidence);

  const currentManifest = await createMaintenanceDiffManifest(assignment.workspace);
  if (JSON.stringify(currentManifest) !== JSON.stringify(input.evidence.manifest)
    || currentManifest.workspaceHash !== input.evidence.manifestHash) {
    throw new MaintenanceApplyBlockedError("Maintenance evidence is stale or the workspace changed before canonical apply.");
  }

  const baseTree = await readMaintenanceTree(assignment.workspace, "base");
  const desiredTree = await readMaintenanceTree(assignment.workspace, "workspace");
  if (hashTree(baseTree) !== assignment.workspace.baseTreeHash || input.evidence.manifest.baseHash !== assignment.workspace.baseHash) {
    throw new MaintenanceApplyBlockedError("Maintenance workspace base lineage is stale or damaged.");
  }
  const files = buildApplyFiles(baseTree, desiredTree, input.evidence.manifest);
  const transactionPath = transactionFilePath(input.memory, assignment.assignmentId);
  return withProjectWriteLease(input.project.path, {}, async (lease) => {
    const existing = await readTransaction(transactionPath);
    if (existing) {
      assertTransactionIdentity(existing, input, assignment.workspace, files, hashTree(baseTree), hashTree(desiredTree));
      return recoverOrReturn(input.memory, input.project, assignment.workspace, existing, transactionPath, lease);
    }
    const currentTree = await readCanonicalTree(input.memory, input.project, assignment.workspace);
    if (hashTree(currentTree) !== hashTree(baseTree)) {
      throw new MaintenanceApplyBlockedError("Canonical project memory changed after the maintenance assignment was created.");
    }

    const now = new Date().toISOString();
    const transaction: ProjectMemoryApplyTransaction = {
      version: "1.0",
      id: transactionId(input.memory, assignment.assignmentId, input.evidence.manifestHash),
      assignmentId: assignment.assignmentId,
      projectId: input.memory.projectId,
      memoryMode: input.memory.mode as "repo-local" | "external-local",
      manifestHash: input.evidence.manifestHash,
      baseHash: assignment.workspace.baseHash,
      workspaceHash: input.evidence.manifestHash,
      beforeTreeHash: hashTree(baseTree),
      afterTreeHash: hashTree(desiredTree),
      stage: "prepared",
      files,
      error: null,
      createdAt: now,
      updatedAt: now,
    };
    await writeJsonFile(transactionPath, transaction);
    return executeTransaction(input.memory, input.project, assignment.workspace, transaction, transactionPath, lease);
  });
}

export function maintenanceApplyTransactionPath(memory: ResolvedMemory, assignmentId: string): string {
  return transactionFilePath(memory, assignmentId);
}

export class MaintenanceApplyBlockedError extends Error {}

async function recoverOrReturn(
  memory: ResolvedMemory,
  project: ManagedProject,
  workspace: MaintenanceWorkspace,
  transaction: ProjectMemoryApplyTransaction,
  transactionPath: string,
  lease: ProjectWriteLeaseScope,
): Promise<ProjectMemoryApplyResult> {
  const current = await readCanonicalTree(memory, project, workspace);
  const currentHash = hashTree(current);
  if (transaction.stage === "completed") {
    if (currentHash !== transaction.afterTreeHash) throw new MaintenanceApplyBlockedError("Completed project memory apply was changed after its receipt.");
    return resultFromTransaction(memory, transaction, transactionPath, transaction.files.length === 0 ? "noop" : "applied");
  }
  if (transaction.stage === "applied") {
    if (currentHash !== transaction.afterTreeHash) throw new MaintenanceApplyBlockedError("Applied project memory transaction has stale canonical content.");
    const completed = await advanceTransaction(transactionPath, transaction, "completed", null, lease);
    return resultFromTransaction(memory, completed, transactionPath, completed.files.length === 0 ? "noop" : "applied");
  }
  if (transaction.stage === "applying") {
    if (currentHash === transaction.afterTreeHash) {
      const applied = await advanceTransaction(transactionPath, transaction, "applied", null, lease);
      const completed = await advanceTransaction(transactionPath, applied, "completed", null, lease);
      return resultFromTransaction(memory, completed, transactionPath, completed.files.length === 0 ? "noop" : "applied");
    }
    if (currentHash !== transaction.beforeTreeHash && !(await isOwnedPartialState(current, workspace, transaction))) {
      throw new MaintenanceApplyBlockedError("Partial maintenance apply encountered unrelated canonical memory drift.");
    }
    await restoreBefore(memory, project, workspace, transaction, current, lease);
    const prepared = await advanceTransaction(transactionPath, transaction, "prepared", null, lease);
    return executeTransaction(memory, project, workspace, prepared, transactionPath, lease);
  }
  return executeTransaction(memory, project, workspace, transaction, transactionPath, lease);
}

async function executeTransaction(
  memory: ResolvedMemory,
  project: ManagedProject,
  workspace: MaintenanceWorkspace,
  initial: ProjectMemoryApplyTransaction,
  transactionPath: string,
  lease: ProjectWriteLeaseScope,
): Promise<ProjectMemoryApplyResult> {
  let transaction = initial;
  if (transaction.files.length === 0) {
    transaction = await advanceTransaction(transactionPath, transaction, "completed", null, lease);
    return resultFromTransaction(memory, transaction, transactionPath, "noop");
  }
  transaction = await advanceTransaction(transactionPath, transaction, "applying", null, lease);
  try {
    for (const file of transaction.files) {
      await lease.assertCurrent();
      await assertTargetState(memory, project, file, file.beforeHash);
      const target = targetPath(memory, project, file);
      if (file.afterContent === null) {
        await rm(target, { force: true });
      } else {
        await atomicWriteFile(target, file.afterContent);
      }
    }
    await lease.assertCurrent();
    const current = await readCanonicalTree(memory, project, workspace);
    if (hashTree(current) !== transaction.afterTreeHash) {
      throw new MaintenanceApplyBlockedError("Canonical memory did not match the reviewed maintenance tree after apply.");
    }
    transaction = await advanceTransaction(transactionPath, transaction, "applied", null, lease);
    transaction = await advanceTransaction(transactionPath, transaction, "completed", null, lease);
    return resultFromTransaction(memory, transaction, transactionPath, "applied");
  } catch (error) {
    await advanceTransaction(transactionPath, transaction, "applying", error instanceof Error ? error.message : String(error), lease).catch(() => undefined);
    throw error;
  }
}

async function restoreBefore(
  memory: ResolvedMemory,
  project: ManagedProject,
  workspace: MaintenanceWorkspace,
  transaction: ProjectMemoryApplyTransaction,
  current: MarkdownTreeEntry[],
  lease: ProjectWriteLeaseScope,
): Promise<void> {
  for (const file of transaction.files) {
    const currentHash = current.find((entry) => entry.path === file.path && rootForEntry(entry) === file.root)?.hash ?? null;
    if (currentHash !== file.beforeHash && currentHash !== file.afterHash) {
      throw new MaintenanceApplyBlockedError(`Cannot roll back maintenance path with unrelated drift: ${file.path}.`);
    }
  }
  for (const file of transaction.files) {
    await lease.assertCurrent();
    const target = targetPath(memory, project, file);
    if (file.beforeContent === null) await rm(target, { force: true });
    else await atomicWriteFile(target, file.beforeContent);
  }
}

async function assertTargetState(
  memory: ResolvedMemory,
  project: ManagedProject,
  file: ProjectMemoryApplyFile,
  expectedHash: string | null,
): Promise<void> {
  const target = targetPath(memory, project, file);
  const info = await lstat(target).catch(() => null);
  if (info?.isSymbolicLink()) throw new MaintenanceApplyBlockedError(`Canonical memory rejects symbolic link target: ${file.path}.`);
  if (!info) {
    if (expectedHash !== null) throw new MaintenanceApplyBlockedError(`Canonical memory target disappeared: ${file.path}.`);
    return;
  }
  if (!info.isFile()) throw new MaintenanceApplyBlockedError(`Canonical memory target is not a file: ${file.path}.`);
  const content = await readFile(target, "utf8");
  const actualHash = sha256(content);
  if (actualHash !== expectedHash) throw new MaintenanceApplyBlockedError(`Canonical memory target changed during apply: ${file.path}.`);
}

function buildApplyFiles(base: MarkdownTreeEntry[], desired: MarkdownTreeEntry[], manifest: MaintenanceDiffManifest): ProjectMemoryApplyFile[] {
  const baseByKey = new Map(base.map((file) => [entryKey(file), file]));
  const desiredByKey = new Map(desired.map((file) => [entryKey(file), file]));
  const paths = new Set<string>([
    ...manifest.added.map((file) => entryKeyFromManifest(file)),
    ...manifest.modified.map((file) => entryKeyFromManifest(file)),
    ...manifest.deleted.map((file) => entryKeyFromManifest(file)),
    ...manifest.renamed.flatMap((file) => [manifestEntryKey(file.sourceKey, file.from), manifestEntryKey(file.sourceKey, file.to)]),
  ]);
  return [...paths].sort((a, b) => a.localeCompare(b, "en")).map((key) => {
    const before = baseByKey.get(key) ?? null;
    const after = desiredByKey.get(key) ?? null;
    if (!before && !after) throw new MaintenanceApplyBlockedError(`Maintenance manifest references a missing tree entry: ${key}.`);
    const operation = !before ? "add" : !after ? "delete" : "modify";
    return {
      path: (after ?? before)!.path,
      root: rootForEntry(after ?? before!),
      operation,
      beforeHash: before?.hash ?? null,
      afterHash: after?.hash ?? null,
      beforeContent: before?.content ?? null,
      afterContent: after?.content ?? null,
    };
  });
}

function assertAssignmentBoundary(memory: ResolvedMemory, project: ManagedProject, assignment: HarnessEngineeringAssignment): void {
  const workspace = assignment.workspace;
  if (assignment.projectId !== project.id || workspace.memoryMode !== memory.mode || resolve(workspace.baseRoot) !== resolve(memory.memoryRoot)) {
    throw new MaintenanceApplyBlockedError("Maintenance assignment is outside the current project memory boundary.");
  }
  const maintenanceRoot = resolve(memory.workbenchRoot, "maintenance");
  assertStrictlyWithin(maintenanceRoot, workspace.workspaceRoot);
  assertStrictlyWithin(maintenanceRoot, workspace.baseSnapshotRoot);
  const allowed = memory.mode === "repo-local" ? ALLOWED_REPO_NAMESPACES : ALLOWED_MEMORY_NAMESPACES;
  for (const namespace of workspace.namespaces) {
    if (!isAllowedNamespace(namespace, allowed)) throw new MaintenanceApplyBlockedError(`Maintenance namespace is not allowed: ${namespace}.`);
  }
  for (const source of workspace.additionalSources ?? []) {
    if (source.key !== "project" || resolve(source.root) !== resolve(project.path) || source.namespaces.some((namespace) => namespace !== "AGENTS.md")) {
      throw new MaintenanceApplyBlockedError("Maintenance project source mapping is not allowed.");
    }
  }
  if (memory.mode === "external-local" && (workspace.additionalSources ?? []).some((source) => !source.namespaces.includes("AGENTS.md"))) {
    throw new MaintenanceApplyBlockedError("External-local maintenance can map only project AGENTS.md.");
  }
  if (workspace.namespaces.some((namespace) => FORBIDDEN_NAMESPACE_MARKERS.some((marker) => namespace === marker || namespace.startsWith(`${marker}/`)))) {
    throw new MaintenanceApplyBlockedError("Maintenance namespace includes a forbidden product or control path.");
  }
}

function assertApprovedEvidence(assignment: HarnessEngineeringAssignment, evidence: ApplyReviewedMaintenanceAssignmentInput["evidence"]): void {
  if (evidence.version !== "2.0" || evidence.assignmentId !== assignment.assignmentId || evidence.mode !== assignment.mode
    || evidence.manifestHash !== evidence.manifest.workspaceHash || evidence.quorum.approved !== evidence.quorum.required
    || evidence.reviews.length !== evidence.quorum.required
    || evidence.reviews.some((review) => review.decision !== "approve" || review.assignmentId !== assignment.assignmentId || review.manifestHash !== evidence.manifestHash)) {
    throw new MaintenanceApplyBlockedError("Maintenance evidence is not an approved current reviewer quorum.");
  }
}

async function readCanonicalTree(memory: ResolvedMemory, project: ManagedProject, workspace: MaintenanceWorkspace): Promise<MarkdownTreeEntry[]> {
  const primary = await readMarkdownTree(memory.memoryRoot, workspace.namespaces, false);
  const additional = await Promise.all((workspace.additionalSources ?? []).map(async (source) =>
    (await readMarkdownTree(resolve(project.path), source.namespaces, false)).map((file) => ({ ...file, sourceKey: source.key }))));
  const entries = [...primary, ...additional.flat()];
  const seen = new Set<string>();
  for (const entry of entries) {
    const key = entryKey(entry);
    if (seen.has(key)) throw new MaintenanceApplyBlockedError(`Canonical memory sources overlap at ${entry.path}.`);
    seen.add(key);
  }
  return entries.sort((a, b) => entryKey(a).localeCompare(entryKey(b), "en"));
}

function targetPath(memory: ResolvedMemory, project: ManagedProject, file: ProjectMemoryApplyFile): string {
  const root = file.root === "project" ? resolve(project.path) : resolve(memory.memoryRoot);
  if (!file.path || isAbsolute(file.path) || file.path.includes("\0") || file.path === ".." || file.path.startsWith("../") || file.path.includes("/../")) {
    throw new MaintenanceApplyBlockedError(`Maintenance target path is unsafe: ${file.path}.`);
  }
  const target = resolve(root, ...file.path.replaceAll("\\", "/").split("/"));
  if (target !== root && !target.startsWith(`${root}${sep}`)) throw new MaintenanceApplyBlockedError(`Maintenance target escapes its root: ${file.path}.`);
  if (!target.toLowerCase().endsWith(".md")) throw new MaintenanceApplyBlockedError(`Maintenance target is not Markdown: ${file.path}.`);
  return target;
}

function rootForEntry(entry: MarkdownTreeEntry): ProjectMemoryApplyRoot {
  return entry.sourceKey === "project" ? "project" : "memory";
}

function entryKey(entry: MarkdownTreeEntry): string { return `${entry.sourceKey ?? "memory"}:${entry.path}`; }
function manifestEntryKey(sourceKey: "project" | undefined, path: string): string { return `${sourceKey ?? "memory"}:${path}`; }
function entryKeyFromManifest(file: MaintenanceDiffFile): string { return manifestEntryKey(file.sourceKey, file.path); }

async function isOwnedPartialState(
  current: MarkdownTreeEntry[],
  workspace: MaintenanceWorkspace,
  transaction: ProjectMemoryApplyTransaction,
): Promise<boolean> {
  const base = await readMaintenanceTree(workspace, "base");
  const owned = new Set(transaction.files.map((file) => `${file.root}:${file.path}`));
  const currentByKey = new Map(current.map((entry) => [entryKey(entry), entry.hash]));
  const baseByKey = new Map(base.map((entry) => [entryKey(entry), entry.hash]));
  const allKeys = new Set([...currentByKey.keys(), ...baseByKey.keys()]);
  for (const key of allKeys) {
    if (owned.has(key)) continue;
    if (currentByKey.get(key) !== baseByKey.get(key)) return false;
  }
  for (const file of transaction.files) {
    const currentHash = currentByKey.get(`${file.root}:${file.path}`) ?? null;
    if (currentHash !== file.beforeHash && currentHash !== file.afterHash) return false;
  }
  return true;
}

async function advanceTransaction(
  path: string,
  transaction: ProjectMemoryApplyTransaction,
  stage: ProjectMemoryApplyTransaction["stage"],
  error: string | null,
  lease: ProjectWriteLeaseScope,
): Promise<ProjectMemoryApplyTransaction> {
  await lease.assertCurrent();
  const next = { ...transaction, stage, error, updatedAt: new Date().toISOString() };
  await writeJsonFile(path, next);
  return next;
}

async function readTransaction(path: string): Promise<ProjectMemoryApplyTransaction | null> {
  if (!existsSync(path)) return null;
  const value: unknown = JSON.parse(await readFile(path, "utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new MaintenanceApplyBlockedError("Persisted project memory apply transaction is not an object.");
  }
  return value as ProjectMemoryApplyTransaction;
}

function assertTransactionIdentity(
  transaction: ProjectMemoryApplyTransaction,
  input: ApplyReviewedMaintenanceAssignmentInput,
  workspace: MaintenanceWorkspace,
  files: ProjectMemoryApplyFile[],
  beforeTreeHash: string,
  afterTreeHash: string,
): void {
  assertKnownTransactionStage(transaction.stage);
  const expectedId = transactionId(input.memory, input.assignment.assignmentId, input.evidence.manifestHash);
  if (transaction.version !== "1.0" || transaction.assignmentId !== input.assignment.assignmentId
    || transaction.projectId !== input.memory.projectId || transaction.memoryMode !== input.memory.mode
    || transaction.id !== expectedId || transaction.manifestHash !== input.evidence.manifestHash
    || transaction.workspaceHash !== input.evidence.manifestHash || transaction.baseHash !== workspace.baseHash
    || !Array.isArray(transaction.files)
    || transaction.beforeTreeHash !== beforeTreeHash || transaction.afterTreeHash !== afterTreeHash
    || JSON.stringify(transaction.files) !== JSON.stringify(files)) {
    throw new MaintenanceApplyBlockedError("Existing project memory apply transaction is stale or belongs to another assignment.");
  }
}

function assertKnownTransactionStage(value: unknown): asserts value is ProjectMemoryApplyTransaction["stage"] {
  if (typeof value !== "string" || !(PROJECT_MEMORY_APPLY_STAGES as readonly string[]).includes(value)) {
    throw new MaintenanceApplyBlockedError(`Unknown project memory apply transaction stage: ${String(value)}.`);
  }
}

function resultFromTransaction(memory: ResolvedMemory, transaction: ProjectMemoryApplyTransaction, path: string, status: "applied" | "noop"): ProjectMemoryApplyResult {
  return {
    status,
    transactionId: transaction.id,
    assignmentId: transaction.assignmentId,
    manifestHash: transaction.manifestHash,
    changedPaths: transaction.files.map((file) => `${file.root}:${file.path}`),
    artifactPath: relative(memory.memoryRoot, path).replace(/\\/g, "/"),
  };
}

function transactionFilePath(memory: ResolvedMemory, assignmentId: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(assignmentId)) throw new MaintenanceApplyBlockedError("Maintenance assignment id is unsafe.");
  return join(memory.workbenchRoot, "maintenance", "apply", assignmentId, "transaction.json");
}

function transactionId(memory: ResolvedMemory, assignmentId: string, manifestHash: string): string {
  return `memory-apply-${sha256(`${memory.projectId ?? "local"}:${assignmentId}:${manifestHash}`)}`;
}

function isAllowedNamespace(namespace: string, allowed: string[]): boolean {
  return allowed.some((candidate) => namespace === candidate || (candidate !== "AGENTS.md" && namespace.startsWith(`${candidate}/`)));
}

function assertStrictlyWithin(root: string, target: string): void {
  const normalizedRoot = resolve(root);
  const normalizedTarget = resolve(target);
  const value = relative(normalizedRoot, normalizedTarget);
  if (!value || value === ".." || value.startsWith(`..${sep}`) || isAbsolute(value)) {
    throw new MaintenanceApplyBlockedError("Maintenance workspace path is outside the managed maintenance root.");
  }
}

function sha256(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }
