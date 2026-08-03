import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, mkdir, readFile, readdir, rename, rm } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { z } from "zod";
import { parseJsonText, atomicWriteFile, writeJsonFile } from "../fs/json.js";
import { readProjectKnowledgeCatalogEntries } from "./knowledge.js";
import { assertPhysicalDirectory, resolveWithinPhysicalRoot } from "./path-safety.js";
import { validateProjectHarnessChangeEvidence, PROJECT_HARNESS_CHANGE_EVIDENCE_FILES } from "./change-evidence.js";
import {
  canonicalProjectHarnessId,
  classifyProjectHarnessBaselineRelation,
  createExclusiveRegistryRecord,
  ensureProjectHarnessLane,
  normalizeRegistryClaim,
  projectHarnessLaneId,
  readBoundProjectHarnessRecords,
  readProjectHarnessBaseline,
  registryClaimsOverlap,
  withRegistryClaimLock,
  type GitAncestryProbe,
  type ProjectHarnessBaselineRelation,
  type ProjectHarnessRegistryContext,
} from "./registry.js";

export type ProjectHarnessChangeStatus =
  | "claiming"
  | "planning"
  | "active"
  | "parking"
  | "completed"
  | "blocked"
  | "abandoned";

export type ProjectHarnessTerminalChangeStatus = "completed" | "blocked" | "abandoned";

export interface ProjectHarnessChangeRecord extends Record<string, unknown> {
  schema_version: "1.0";
  change_id: string;
  lane_id: string;
  status: ProjectHarnessChangeStatus;
  claim_token: string;
  scope: string;
  paths: string[];
  modules?: string[];
  tags?: string[];
  base_commit: string | null;
  completion_commit: string | null;
  validation: string[];
  validation_passed: boolean;
  evidence_complete: boolean;
  contract_required: boolean;
  contract_path: string | null;
  evidence_paths: string[];
  integrated_by: string | null;
  integration_status: string;
  repository_mode: "single_lane" | "multi_lane";
  created_at: string;
  updated_at: string;
}

export interface ProjectHarnessContractRecord extends Record<string, unknown> {
  schema_version: "1.0";
  change_id: string;
  kind: "api" | "schema" | "event" | "config" | "permission" | "module_boundary";
  subject: string;
  operation: string;
  owner_module: string;
  affected_paths: string[];
  consumers: string[];
  depends_on: string[];
  depends_on_changes: string[];
  compatibility: string;
  status: string;
  updated_at: string;
}

export interface ProjectHarnessChangeIndexEntry {
  change_id: string;
  lane_id: string;
  status: ProjectHarnessChangeStatus;
  evidence_state: "active" | "parking" | "archive" | null;
  scope: string;
  modules: string[];
  paths: string[];
  tags: string[];
  validation: string[];
  validation_passed: boolean;
  base_commit: string | null;
  completion_commit: string | null;
  summary_path: string | null;
  summary_excerpt: string;
  updated_at: string;
}

export interface ProjectHarnessChangeIndex {
  schema_version: "1.0";
  changes: ProjectHarnessChangeIndexEntry[];
  generated_at: string;
}

export interface ProjectHarnessChangeEvidenceFile {
  path: string;
  sha256: string;
  size: number;
}

export interface ProjectHarnessChangeEvidenceSnapshot {
  change: ProjectHarnessChangeRecord;
  evidence_state: "active" | "parking" | "archive";
  evidence_path: string;
  files: ProjectHarnessChangeEvidenceFile[];
  content_fingerprint: string;
}

export interface SourceFingerprintSnapshot {
  fingerprintSources(relativePaths: readonly string[]): Promise<ReadonlyMap<string, string | null>>;
}

export interface ProjectHarnessPreflightConflict {
  type: "path" | "contract";
  other_change_id: string;
  details?: string[];
  subject?: string;
  relationship?: "same_subject" | "dependency";
}

export interface ProjectHarnessKnowledgeDriftImpact {
  knowledge_id: string;
  path: string;
  drifted_sources: string[];
  related_sources: string[];
  reason: "path_overlap" | "module_owner";
}

export interface ProjectHarnessChangePreflightResult {
  project_id: string;
  mode: "single_lane" | "multi_lane";
  change: ProjectHarnessChangeRecord;
  conflicts: ProjectHarnessPreflightConflict[];
  historical_overlaps: ProjectHarnessPreflightConflict[];
  baseline_relation: ProjectHarnessBaselineRelation;
  baseline_advanced: boolean;
  baseline_impacts: Array<{ event: string; reasons: string[] }>;
  knowledge: {
    status: "refresh-needed" | "current-for-change-scope";
    candidate_items: number;
    checked_sources: number;
    drift_impacts: ProjectHarnessKnowledgeDriftImpact[];
  };
  action: "continue" | "replan";
}

export interface CreateProjectHarnessChangeInput {
  changeId: string;
  scope?: string;
  now?: () => string;
  failureInjection?: (stage: "record-claimed" | "evidence-created" | "lane-claimed") => void | Promise<void>;
}

export interface PublishProjectHarnessChangeInput {
  changeId: string;
  scope?: string;
  paths?: readonly string[];
  modules?: readonly string[];
  tags?: readonly string[];
  status?: "planning" | "active";
  validation?: readonly string[];
  contract?: ProjectHarnessContractInput;
  now?: () => string;
}

export type ProjectHarnessContractInput = Pick<
  ProjectHarnessContractRecord,
  | "kind"
  | "subject"
  | "operation"
  | "owner_module"
  | "affected_paths"
  | "consumers"
  | "depends_on"
  | "depends_on_changes"
  | "compatibility"
  | "status"
>;

export interface PreflightProjectHarnessChangeInput {
  changeId: string;
  sourceSnapshot: SourceFingerprintSnapshot;
  gitProbe?: GitAncestryProbe;
}

export interface CloseProjectHarnessChangeInput extends PreflightProjectHarnessChangeInput {
  status: ProjectHarnessTerminalChangeStatus;
  completionCommit?: string | null;
  validation?: readonly string[];
  validationPassed?: boolean;
  now?: () => string;
}

const TERMINAL_STATUSES = new Set<ProjectHarnessChangeStatus>(["completed", "blocked", "abandoned"]);
const changeRecordSchema = z.object({
  schema_version: z.literal("1.0"),
  change_id: z.string().min(1),
  lane_id: z.string().min(1),
  status: z.enum(["claiming", "planning", "active", "parking", "completed", "blocked", "abandoned"]),
  claim_token: z.string().min(1),
  scope: z.string(),
  paths: z.array(z.string()),
  modules: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  base_commit: z.string().nullable(),
  completion_commit: z.string().nullable(),
  validation: z.array(z.string()),
  validation_passed: z.boolean(),
  evidence_complete: z.boolean(),
  contract_required: z.boolean(),
  contract_path: z.string().nullable(),
  evidence_paths: z.array(z.string()),
  integrated_by: z.string().nullable(),
  integration_status: z.string(),
  repository_mode: z.enum(["single_lane", "multi_lane"]),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
}).passthrough();

const contractRecordSchema = z.object({
  schema_version: z.literal("1.0"),
  change_id: z.string().min(1),
  kind: z.enum(["api", "schema", "event", "config", "permission", "module_boundary"]),
  subject: z.string().min(1),
  operation: z.string().min(1),
  owner_module: z.string().min(1),
  affected_paths: z.array(z.string()),
  consumers: z.array(z.string()),
  depends_on: z.array(z.string()),
  depends_on_changes: z.array(z.string()),
  compatibility: z.string().min(1),
  status: z.string().min(1),
  updated_at: z.string().min(1),
}).passthrough();

export async function createProjectHarnessChange(
  context: ProjectHarnessRegistryContext,
  input: CreateProjectHarnessChangeInput,
): Promise<ProjectHarnessChangeRecord> {
  const changeId = canonicalProjectHarnessId(input.changeId, "Change id");
  const laneId = projectHarnessLaneId(context);
  const now = input.now ?? (() => new Date().toISOString());
  return withRegistryClaimLock(context.skillRoot, laneId, async () => {
    const existing = await listProjectHarnessChanges(context.skillRoot);
    if (!isConcurrentLaneContext(context) && existing.some(isActiveChange)) {
      throw new Error("Single-Lane mode already has an active Change.");
    }
    if (existing.some((record) => record.lane_id === laneId && isActiveChange(record))) {
      throw new Error("This Lane already has an active Change.");
    }
    if (existing.some((record) => record.change_id === changeId)) throw new Error(`Change already exists: ${changeId}.`);
    const root = await changesRoot(context.skillRoot, true);
    const evidenceRoot = await resolveWithinPhysicalRoot(root, `active/${changeId}`, "active Change evidence");
    if (existsSync(evidenceRoot)) throw new Error(`Active Change evidence already exists: ${changeId}.`);
    const claimToken = randomBytes(16).toString("hex");
    const createdAt = now();
    const record: ProjectHarnessChangeRecord = {
      schema_version: "1.0",
      change_id: changeId,
      lane_id: laneId,
      status: "claiming",
      claim_token: claimToken,
      scope: input.scope ?? "",
      paths: [],
      base_commit: context.headCommit,
      completion_commit: null,
      validation: [],
      validation_passed: false,
      evidence_complete: false,
      contract_required: false,
      contract_path: null,
      evidence_paths: [`state/changes/active/${changeId}`],
      integrated_by: null,
      integration_status: "not_requested",
      repository_mode: context.mode,
      created_at: createdAt,
      updated_at: createdAt,
    };
    const recordPath = await createExclusiveRegistryRecord(context.skillRoot, "changes", changeId, record);
    let evidenceCreated = false;
    try {
      await input.failureInjection?.("record-claimed");
      await mkdir(evidenceRoot);
      evidenceCreated = true;
      await copyChangeTemplates(context.skillRoot, evidenceRoot, changeId);
      await input.failureInjection?.("evidence-created");
      await ensureProjectHarnessLane(context, changeId);
      await input.failureInjection?.("lane-claimed");
      record.status = "planning";
      record.updated_at = now();
      await writeJsonFile(recordPath, record);
      await rebuildProjectHarnessChangeIndex(context.skillRoot);
      return record;
    } catch (error) {
      if (evidenceCreated && existsSync(evidenceRoot)) await removeOwnedEvidence(evidenceRoot, dirname(evidenceRoot));
      await removeClaimedRecord(recordPath, claimToken);
      const lane = await safeReadLane(context);
      if (lane?.active_change_id === changeId) await ensureProjectHarnessLane(context, null);
      throw error;
    }
  });
}

export async function publishProjectHarnessChange(
  context: ProjectHarnessRegistryContext,
  input: PublishProjectHarnessChangeInput,
): Promise<ProjectHarnessChangeRecord> {
  if (input.status !== undefined && input.status !== "planning" && input.status !== "active") {
    throw new Error(`Invalid mutable Change status: ${String(input.status)}.`);
  }
  const record = await loadProjectHarnessChange(context.skillRoot, input.changeId, true);
  assertLaneOwner(context, record);
  assertMutableChange(record);
  const now = input.now ?? (() => new Date().toISOString());
  if (input.scope !== undefined) record.scope = input.scope;
  if (input.paths !== undefined) record.paths = sortedUnique(input.paths.map(normalizeRegistryClaim));
  if (input.modules !== undefined) record.modules = sortedUnique(input.modules.map((module) => canonicalProjectHarnessId(module, "Module id")));
  if (input.tags !== undefined) record.tags = sortedUnique(input.tags.map((tag) => canonicalProjectHarnessId(tag, "Tag")));
  if (input.status !== undefined) record.status = input.status;
  if (input.validation !== undefined) record.validation = [...input.validation];
  if (input.contract) {
    const contract = validateContract(record.change_id, input.contract, now());
    const path = await contractRecordPath(context.skillRoot, record.change_id, true);
    await writeJsonFile(path, contract);
    record.contract_required = true;
    record.contract_path = `state/registry/contracts/${record.change_id}.json`;
  }
  record.updated_at = now();
  await writeProjectHarnessChange(context.skillRoot, record);
  await ensureProjectHarnessLane(context, isActiveChange(record) ? record.change_id : null);
  await rebuildProjectHarnessChangeIndex(context.skillRoot);
  return record;
}

export async function preflightProjectHarnessChange(
  context: ProjectHarnessRegistryContext,
  input: PreflightProjectHarnessChangeInput,
): Promise<ProjectHarnessChangePreflightResult> {
  const current = await loadProjectHarnessChange(context.skillRoot, input.changeId, true);
  assertLaneOwner(context, current);
  const currentContract = await loadProjectHarnessContract(context.skillRoot, current.change_id);
  const conflicts: ProjectHarnessPreflightConflict[] = [];
  const historicalOverlaps: ProjectHarnessPreflightConflict[] = [];
  for (const other of await listProjectHarnessChanges(context.skillRoot)) {
    if (other.change_id === current.change_id || other.integrated_by || !["planning", "active", "completed"].includes(other.status)) continue;
    const overlaps = sortedUnique(current.paths.flatMap((left) => other.paths
      .filter((right) => registryClaimsOverlap(left, right))
      .map((right) => `${left} <-> ${right}`)));
    if (overlaps.length > 0) {
      const finding: ProjectHarnessPreflightConflict = { type: "path", other_change_id: other.change_id, details: overlaps };
      (other.status === "completed" ? historicalOverlaps : conflicts).push(finding);
    }
  }
  if (context.mode === "multi_lane" && currentContract) {
    for (const otherContract of await listProjectHarnessContracts(context.skillRoot)) {
      if (otherContract.change_id === current.change_id || ["retired", "integrated"].includes(otherContract.status)) continue;
      const other = await loadProjectHarnessChange(context.skillRoot, otherContract.change_id, false);
      if (!other || other.integrated_by || !["planning", "active", "completed"].includes(other.status)) continue;
      const sameSubject = currentContract.subject === otherContract.subject;
      const dependency = currentContract.depends_on.includes(otherContract.subject)
        || otherContract.depends_on.includes(currentContract.subject);
      if (sameSubject || dependency) {
        const finding: ProjectHarnessPreflightConflict = {
          type: "contract",
          other_change_id: other.change_id,
          subject: otherContract.subject,
          relationship: sameSubject ? "same_subject" : "dependency",
        };
        (other.status === "completed" ? historicalOverlaps : conflicts).push(finding);
      }
    }
  }
  const baseline = await readProjectHarnessBaseline(context.skillRoot);
  const relation = isConcurrentLaneContext(context)
    ? await classifyProjectHarnessBaselineRelation(
      context.projectRoot,
      current.base_commit,
      baseline?.canonical_commit ?? null,
      input.gitProbe,
    )
    : "not_applicable";
  const baselineImpacts = await relatedBaselineImpacts(context.skillRoot, current, currentContract);
  const knowledge = await scopedKnowledgeDrift(context, current, currentContract, input.sourceSnapshot);
  const refreshNeeded = baselineImpacts.length > 0 || knowledge.drift_impacts.length > 0;
  return {
    project_id: context.projectId,
    mode: context.mode,
    change: current,
    conflicts: sortConflicts(conflicts),
    historical_overlaps: sortConflicts(historicalOverlaps),
    baseline_relation: relation,
    baseline_advanced: relation === "canonical_advanced",
    baseline_impacts: baselineImpacts,
    knowledge: {
      status: refreshNeeded ? "refresh-needed" : "current-for-change-scope",
      ...knowledge,
    },
    action: conflicts.length > 0 || refreshNeeded || relation === "diverged" || relation === "unavailable"
      ? "replan"
      : "continue",
  };
}

export async function closeProjectHarnessChange(
  context: ProjectHarnessRegistryContext,
  input: CloseProjectHarnessChangeInput,
): Promise<{ status: "closed" | "already_closed"; change: ProjectHarnessChangeRecord; preflight: ProjectHarnessChangePreflightResult | null }> {
  if (!TERMINAL_STATUSES.has(input.status)) throw new Error(`Invalid terminal Change status: ${String(input.status)}.`);
  if (input.validationPassed !== undefined && typeof input.validationPassed !== "boolean") {
    throw new Error("Change validationPassed must be boolean.");
  }
  const record = await loadProjectHarnessChange(context.skillRoot, input.changeId, true);
  assertLaneOwner(context, record);
  if (TERMINAL_STATUSES.has(record.status)) {
    if (record.status === input.status) return { status: "already_closed", change: record, preflight: null };
    throw new Error(`Change is already terminal: ${record.status}.`);
  }
  const preflight = isConcurrentLaneContext(context) ? await preflightProjectHarnessChange(context, input) : null;
  if (preflight?.action === "replan") throw new Error("Multi-Lane Change cannot close until scoped preflight can continue.");
  if (input.validation) record.validation = [...input.validation];
  if (input.validationPassed === true) record.validation_passed = true;
  if (input.completionCommit !== undefined) {
    if (input.completionCommit !== null && !/^[a-f0-9]{40,64}$/i.test(input.completionCommit)) {
      throw new Error("Change completion commit must be a Git commit hash.");
    }
    record.completion_commit = input.completionCommit?.toLowerCase() ?? null;
  }
  const source = await changeEvidencePath(context.skillRoot, "active", record.change_id, false);
  const destination = await changeEvidencePath(context.skillRoot, "archive", record.change_id, true);
  if (!existsSync(source)) throw new Error("Active Change evidence is missing.");
  await assertEvidenceTreePhysical(source);
  const evidence = await validateProjectHarnessChangeEvidence(source);
  if (input.status === "completed") {
    if (!evidence.valid) throw new Error(`Completed Change evidence is incomplete: ${evidence.issues.join("; ")}.`);
    if (record.validation.length === 0 || !record.validation_passed) {
      throw new Error("Completed Change requires passing validation evidence.");
    }
  }
  if (existsSync(destination)) throw new Error(`Archive Change evidence already exists: ${record.change_id}.`);
  await rename(source, destination);
  record.status = input.status;
  record.evidence_complete = evidence.valid;
  record.evidence_paths = [`state/changes/archive/${record.change_id}`];
  record.updated_at = (input.now ?? (() => new Date().toISOString()))();
  await writeProjectHarnessChange(context.skillRoot, record);
  await ensureProjectHarnessLane(context, null);
  await rebuildProjectHarnessChangeIndex(context.skillRoot);
  return { status: "closed", change: record, preflight };
}

export async function parkProjectHarnessChange(
  context: ProjectHarnessRegistryContext,
  changeId: string,
): Promise<ProjectHarnessChangeRecord> {
  const record = await loadProjectHarnessChange(context.skillRoot, changeId, true);
  assertLaneOwner(context, record);
  if (!isActiveChange(record)) throw new Error(`Only a planning or active Change may be parked: ${record.status}.`);
  const source = await changeEvidencePath(context.skillRoot, "active", record.change_id, false);
  const destination = await changeEvidencePath(context.skillRoot, "parking", record.change_id, true);
  await assertEvidenceTreePhysical(source);
  if (existsSync(destination)) throw new Error(`Parking Change evidence already exists: ${record.change_id}.`);
  await rename(source, destination);
  record.status = "parking";
  record.evidence_paths = [`state/changes/parking/${record.change_id}`];
  record.updated_at = new Date().toISOString();
  await writeProjectHarnessChange(context.skillRoot, record);
  await ensureProjectHarnessLane(context, null);
  await rebuildProjectHarnessChangeIndex(context.skillRoot);
  return record;
}

export async function resumeProjectHarnessChange(
  context: ProjectHarnessRegistryContext,
  changeId: string,
): Promise<ProjectHarnessChangeRecord> {
  const laneId = projectHarnessLaneId(context);
  return withRegistryClaimLock(context.skillRoot, laneId, async () => {
    const record = await loadProjectHarnessChange(context.skillRoot, changeId, true);
    if (record.status !== "parking") throw new Error(`Only a parked Change may be resumed: ${record.status}.`);
    const occupied = (await listProjectHarnessChanges(context.skillRoot))
      .some((other) => other.lane_id === laneId && isActiveChange(other));
    if (occupied) throw new Error("This Lane already has an active Change.");
    const source = await changeEvidencePath(context.skillRoot, "parking", record.change_id, false);
    const destination = await changeEvidencePath(context.skillRoot, "active", record.change_id, true);
    await assertEvidenceTreePhysical(source);
    if (existsSync(destination)) throw new Error(`Active Change evidence already exists: ${record.change_id}.`);
    await rename(source, destination);
    record.status = "active";
    record.lane_id = laneId;
    if (context.mode === "multi_lane" && !record.base_commit) record.base_commit = context.headCommit;
    record.evidence_paths = [`state/changes/active/${record.change_id}`];
    record.updated_at = new Date().toISOString();
    await writeProjectHarnessChange(context.skillRoot, record);
    await ensureProjectHarnessLane(context, record.change_id);
    await rebuildProjectHarnessChangeIndex(context.skillRoot);
    return record;
  });
}

export async function rebuildProjectHarnessChangeIndex(skillRoot: string): Promise<ProjectHarnessChangeIndex> {
  const records = await listProjectHarnessChanges(skillRoot);
  const entries = await Promise.all(records.map((record) => buildIndexEntry(skillRoot, record)));
  entries.sort((left, right) => right.updated_at.localeCompare(left.updated_at) || right.change_id.localeCompare(left.change_id));
  const index: ProjectHarnessChangeIndex = {
    schema_version: "1.0",
    changes: entries,
    generated_at: entries.reduce((latest, entry) => entry.updated_at > latest ? entry.updated_at : latest, "1970-01-01T00:00:00.000Z"),
  };
  const root = await changesRoot(skillRoot, true);
  await writeJsonFile(await resolveWithinPhysicalRoot(root, "INDEX.json", "Change INDEX"), index);
  return index;
}

export async function searchProjectHarnessChanges(
  skillRoot: string,
  query = "",
  statuses: readonly ProjectHarnessChangeStatus[] = [],
): Promise<ProjectHarnessChangeIndexEntry[]> {
  const index = await readChangeIndex(skillRoot);
  const normalized = query.trim().toLowerCase();
  const statusSet = new Set(statuses);
  return index.changes.filter((entry) => {
    if (statusSet.size > 0 && !statusSet.has(entry.status)) return false;
    const searchable = [entry.change_id, entry.scope, ...entry.paths, ...entry.tags, entry.summary_excerpt].join(" ").toLowerCase();
    return !normalized || searchable.includes(normalized);
  });
}

export async function readProjectHarnessChangeContext(
  skillRoot: string,
  changeId: string,
  full = false,
): Promise<{
  change: ProjectHarnessChangeRecord;
  evidence_state: "active" | "parking" | "archive";
  evidence_path: string;
  documents: Record<string, string>;
}> {
  const record = await loadProjectHarnessChange(skillRoot, changeId, true);
  const located = await locateChangeEvidence(skillRoot, record.change_id);
  if (!located) throw new Error("Change evidence is missing.");
  const requested = full ? [...PROJECT_HARNESS_CHANGE_EVIDENCE_FILES].sort() : ["summary.md"];
  const documents: Record<string, string> = {};
  for (const path of requested) {
    const absolute = await resolveWithinPhysicalRoot(located.path, path, "Change evidence document");
    if (existsSync(absolute)) documents[path] = await readFile(absolute, "utf8");
  }
  return {
    change: record,
    evidence_state: located.state,
    evidence_path: `state/changes/${located.state}/${record.change_id}`,
    documents,
  };
}

export async function readProjectHarnessChangeEvidence(
  skillRoot: string,
  changeId: string,
): Promise<ProjectHarnessChangeEvidenceSnapshot> {
  const change = await loadProjectHarnessChange(skillRoot, changeId, true);
  const located = await locateChangeEvidence(skillRoot, change.change_id);
  if (!located) throw new Error("Change evidence is missing.");
  const files = await fingerprintEvidenceFiles(located.path);
  const fingerprint = createHash("sha256");
  for (const file of files) {
    fingerprint.update(file.path, "utf8");
    fingerprint.update("\0", "utf8");
    fingerprint.update(file.sha256, "ascii");
    fingerprint.update("\0", "utf8");
    fingerprint.update(String(file.size), "ascii");
    fingerprint.update("\0", "utf8");
  }
  return {
    change,
    evidence_state: located.state,
    evidence_path: `state/changes/${located.state}/${change.change_id}`,
    files,
    content_fingerprint: fingerprint.digest("hex"),
  };
}

export async function listProjectHarnessChanges(skillRoot: string): Promise<ProjectHarnessChangeRecord[]> {
  const values = await readBoundProjectHarnessRecords<ProjectHarnessChangeRecord>(skillRoot, "changes", "change_id");
  return values.map((value) => changeRecordSchema.parse(value)).sort((left, right) => left.change_id.localeCompare(right.change_id));
}

export async function listProjectHarnessContracts(skillRoot: string): Promise<ProjectHarnessContractRecord[]> {
  const values = await readBoundProjectHarnessRecords<ProjectHarnessContractRecord>(skillRoot, "contracts", "change_id");
  return values.map((value) => contractRecordSchema.parse(value)).sort((left, right) => left.change_id.localeCompare(right.change_id));
}

export async function loadProjectHarnessChange(
  skillRoot: string,
  changeId: string,
  required: true,
): Promise<ProjectHarnessChangeRecord>;
export async function loadProjectHarnessChange(
  skillRoot: string,
  changeId: string,
  required: false,
): Promise<ProjectHarnessChangeRecord | null>;
export async function loadProjectHarnessChange(
  skillRoot: string,
  changeId: string,
  required: boolean,
): Promise<ProjectHarnessChangeRecord | null> {
  const identifier = canonicalProjectHarnessId(changeId, "Change id");
  const path = await changeRecordPath(skillRoot, identifier, false);
  if (!existsSync(path)) {
    if (required) throw new Error(`Unknown Change: ${identifier}.`);
    return null;
  }
  const value = changeRecordSchema.parse(parseJsonText(await readFile(path, "utf8"), path));
  if (value.change_id !== identifier) throw new Error(`Change record id does not match its filename: ${identifier}.json.`);
  return value;
}

export async function loadProjectHarnessContract(
  skillRoot: string,
  changeId: string,
): Promise<ProjectHarnessContractRecord | null> {
  const identifier = canonicalProjectHarnessId(changeId, "Contract Change id");
  const path = await contractRecordPath(skillRoot, identifier, false);
  if (!existsSync(path)) return null;
  const value = contractRecordSchema.parse(parseJsonText(await readFile(path, "utf8"), path));
  if (value.change_id !== identifier) throw new Error(`Contract record id does not match its filename: ${identifier}.json.`);
  return value;
}

async function scopedKnowledgeDrift(
  context: ProjectHarnessRegistryContext,
  current: ProjectHarnessChangeRecord,
  contract: ProjectHarnessContractRecord | null,
  snapshot: SourceFingerprintSnapshot,
): Promise<{ candidate_items: number; checked_sources: number; drift_impacts: ProjectHarnessKnowledgeDriftImpact[] }> {
  const baselinePath = await resolveWithinPhysicalRoot(context.skillRoot, "references/project_wiki/.ecl-baselines.json", "project knowledge baseline");
  if (!existsSync(baselinePath)) return { candidate_items: 0, checked_sources: 0, drift_impacts: [] };
  const raw = parseJsonText(await readFile(baselinePath, "utf8"), baselinePath) as {
    documents?: Record<string, { path?: string; source_fingerprints?: Record<string, string> }>;
  };
  const metadata = await readProjectKnowledgeCatalogEntries({
    projectId: context.projectId,
    projectRoot: context.projectRoot,
    skillRoot: context.skillRoot,
  });
  const byId = new Map(metadata.entries.map((entry) => [entry.metadata.id, entry]));
  const currentPaths = sortedUnique([...current.paths, ...(contract?.affected_paths ?? [])].map(normalizeRegistryClaim));
  const ownerModule = contract?.owner_module ? canonicalProjectHarnessId(contract.owner_module, "Contract owner module") : null;
  const selected = new Map<string, Set<string>>();
  for (const [id, document] of Object.entries(raw.documents ?? {})) {
    const sources = Object.keys(document.source_fingerprints ?? {}).filter((source) => {
      try {
        const normalized = normalizeRegistryClaim(source);
        return currentPaths.some((path) => registryClaimsOverlap(path, normalized));
      } catch {
        return false;
      }
    });
    const moduleRelated = Boolean(ownerModule && byId.get(id)?.metadata.modules.includes(ownerModule));
    if (moduleRelated) sources.push(...Object.keys(document.source_fingerprints ?? {}));
    if (sources.length > 0) selected.set(id, new Set(sources));
  }
  const uniqueSources = sortedUnique([...selected.values()].flatMap((sources) => [...sources]));
  const currentFingerprints = uniqueSources.length > 0
    ? await snapshot.fingerprintSources(uniqueSources)
    : new Map<string, string | null>();
  const impacts: ProjectHarnessKnowledgeDriftImpact[] = [];
  for (const [id, sources] of selected) {
    const expected = raw.documents?.[id]?.source_fingerprints ?? {};
    const drifted = [...sources].filter((source) => (currentFingerprints.get(source) ?? "missing") !== expected[source]).sort();
    if (drifted.length === 0) continue;
    const related = drifted.filter((source) => currentPaths.some((path) => registryClaimsOverlap(path, source)));
    impacts.push({
      knowledge_id: id,
      path: raw.documents?.[id]?.path ?? byId.get(id)?.relativePath ?? "",
      drifted_sources: drifted,
      related_sources: related,
      reason: related.length > 0 ? "path_overlap" : "module_owner",
    });
  }
  impacts.sort((left, right) => left.knowledge_id.localeCompare(right.knowledge_id));
  return { candidate_items: selected.size, checked_sources: uniqueSources.length, drift_impacts: impacts };
}

async function relatedBaselineImpacts(
  skillRoot: string,
  current: ProjectHarnessChangeRecord,
  contract: ProjectHarnessContractRecord | null,
): Promise<Array<{ event: string; reasons: string[] }>> {
  const root = await resolveWithinPhysicalRoot(skillRoot, "state/registry/baseline-events", "project Harness baseline events");
  if (!existsSync(root)) return [];
  const impacts: Array<{ event: string; reasons: string[] }> = [];
  for (const entry of (await readdir(root, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const path = await resolveWithinPhysicalRoot(root, entry.name, "project Harness baseline event");
    const event = parseJsonText(await readFile(path, "utf8"), path) as {
      event?: string;
      affected_paths?: string[];
      contracts?: Array<{ subject?: string; owner_module?: string; affected_paths?: string[] }>;
    };
    if (event.event !== "canonical-baseline-advanced") continue;
    const reasons = new Set<string>();
    for (const left of current.paths) {
      for (const right of event.affected_paths ?? []) {
        if (registryClaimsOverlap(left, right)) reasons.add(`path:${left} <-> ${right}`);
      }
    }
    for (const changed of event.contracts ?? []) {
      if (contract?.subject && changed.subject === contract.subject) reasons.add(`same_subject:${changed.subject}`);
      if (changed.subject && contract?.depends_on.includes(changed.subject)) reasons.add(`depends_on_subject:${changed.subject}`);
      if (changed.owner_module && contract?.consumers.includes(changed.owner_module)) reasons.add(`consumer_module:${changed.owner_module}`);
    }
    if (reasons.size > 0) impacts.push({ event: entry.name, reasons: [...reasons].sort() });
  }
  return impacts;
}

function validateContract(
  changeId: string,
  input: ProjectHarnessContractInput,
  updatedAt: string,
): ProjectHarnessContractRecord {
  const value: ProjectHarnessContractRecord = {
    ...input,
    schema_version: "1.0",
    change_id: changeId,
    subject: canonicalProjectHarnessId(input.subject, "Contract subject"),
    owner_module: canonicalProjectHarnessId(input.owner_module, "Contract owner module"),
    affected_paths: sortedUnique(input.affected_paths.map(normalizeRegistryClaim)),
    consumers: sortedUnique(input.consumers.map((item) => canonicalProjectHarnessId(item, "Contract consumer"))),
    depends_on: sortedUnique(input.depends_on.map((item) => canonicalProjectHarnessId(item, "Contract dependency"))),
    depends_on_changes: sortedUnique(input.depends_on_changes.map((item) => canonicalProjectHarnessId(item, "Contract dependency Change id"))),
    updated_at: updatedAt,
  };
  return contractRecordSchema.parse(value);
}

async function buildIndexEntry(
  skillRoot: string,
  record: ProjectHarnessChangeRecord,
): Promise<ProjectHarnessChangeIndexEntry> {
  const located = await locateChangeEvidence(skillRoot, record.change_id);
  const summaryPath = located ? join(located.path, "summary.md") : null;
  const summary = summaryPath && existsSync(summaryPath) ? await readFile(summaryPath, "utf8") : "";
  return {
    change_id: record.change_id,
    lane_id: record.lane_id,
    status: record.status,
    evidence_state: located?.state ?? null,
    scope: record.scope,
    modules: sortedUnique(record.modules ?? []),
    paths: sortedUnique(record.paths),
    tags: sortedUnique(record.tags ?? []),
    validation: [...record.validation],
    validation_passed: record.validation_passed,
    base_commit: record.base_commit,
    completion_commit: record.completion_commit,
    summary_path: located ? `state/changes/${located.state}/${record.change_id}/summary.md` : null,
    summary_excerpt: summary.split(/\s+/).filter(Boolean).join(" ").slice(0, 500),
    updated_at: record.updated_at,
  };
}

async function readChangeIndex(skillRoot: string): Promise<ProjectHarnessChangeIndex> {
  const root = await changesRoot(skillRoot, false);
  const path = await resolveWithinPhysicalRoot(root, "INDEX.json", "Change INDEX");
  if (!existsSync(path)) throw new Error("Change INDEX is missing; run explicit reindex.");
  return parseJsonText(await readFile(path, "utf8"), path) as ProjectHarnessChangeIndex;
}

async function copyChangeTemplates(skillRoot: string, target: string, changeId: string): Promise<void> {
  const templatesRoot = await resolveWithinPhysicalRoot(skillRoot, "assets/templates", "Change templates");
  await assertPhysicalDirectory(templatesRoot, "Change templates");
  const mapping: Record<string, string> = {
    "summary.md": "summary.md",
    "spec.md": "spec.md",
    "plan.md": "plan.md",
    "tasks.md": "tasks.md",
    "review.md": "reviews/review.md",
  };
  for (const [source, destination] of Object.entries(mapping)) {
    const sourcePath = await resolveWithinPhysicalRoot(templatesRoot, source, "Change template");
    const targetPath = await resolveWithinPhysicalRoot(target, destination, "Change evidence template");
    const content = (await readFile(sourcePath, "utf8")).replaceAll("{{CHANGE_ID}}", changeId);
    await atomicWriteFile(targetPath, content.endsWith("\n") ? content : `${content}\n`);
  }
}

async function locateChangeEvidence(
  skillRoot: string,
  changeId: string,
): Promise<{ state: "active" | "parking" | "archive"; path: string } | null> {
  for (const state of ["active", "parking", "archive"] as const) {
    const path = await changeEvidencePath(skillRoot, state, changeId, false);
    if (existsSync(path)) {
      await assertEvidenceTreePhysical(path);
      return { state, path };
    }
  }
  return null;
}

async function assertEvidenceTreePhysical(root: string): Promise<void> {
  await assertPhysicalDirectory(root, "Change evidence");
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    const info = await lstat(path);
    if (info.isSymbolicLink()) throw new Error(`Change evidence contains a link or Junction: ${path}.`);
    if (info.isDirectory()) await assertEvidenceTreePhysical(path);
  }
}

async function fingerprintEvidenceFiles(
  root: string,
  current = root,
): Promise<ProjectHarnessChangeEvidenceFile[]> {
  await assertPhysicalDirectory(current, "Change evidence");
  const files: ProjectHarnessChangeEvidenceFile[] = [];
  for (const entry of (await readdir(current, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name))) {
    const path = join(current, entry.name);
    const info = await lstat(path);
    if (info.isSymbolicLink()) throw new Error(`Change evidence contains a link or Junction: ${path}.`);
    if (info.isDirectory()) {
      files.push(...await fingerprintEvidenceFiles(root, path));
      continue;
    }
    if (!info.isFile()) throw new Error(`Change evidence contains an unsupported filesystem entry: ${path}.`);
    const content = await readFile(path);
    files.push({
      path: relative(root, path).replace(/\\/g, "/"),
      sha256: createHash("sha256").update(content).digest("hex"),
      size: content.byteLength,
    });
  }
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

async function removeOwnedEvidence(path: string, ownerRoot: string): Promise<void> {
  const normalized = await resolveWithinPhysicalRoot(ownerRoot, relative(ownerRoot, path), "owned Change evidence");
  if (normalized !== resolve(path)) throw new Error("Refusing to clean Change evidence outside its claim owner.");
  await assertEvidenceTreePhysical(path);
  await rm(path, { recursive: true });
}

async function removeClaimedRecord(path: string, claimToken: string): Promise<void> {
  if (!existsSync(path)) return;
  const current = parseJsonText(await readFile(path, "utf8"), path) as { claim_token?: string };
  if (current.claim_token === claimToken) await rm(path);
}

async function safeReadLane(context: ProjectHarnessRegistryContext): Promise<{ active_change_id: string | null } | null> {
  try {
    const laneId = projectHarnessLaneId(context);
    const path = await resolveWithinPhysicalRoot(context.skillRoot, `state/registry/lanes/${laneId}.json`, "project Harness Lane");
    if (!existsSync(path)) return null;
    return parseJsonText(await readFile(path, "utf8"), path) as { active_change_id: string | null };
  } catch {
    return null;
  }
}

async function writeProjectHarnessChange(skillRoot: string, record: ProjectHarnessChangeRecord): Promise<void> {
  await writeJsonFile(await changeRecordPath(skillRoot, record.change_id, true), changeRecordSchema.parse(record));
}

async function changeRecordPath(skillRoot: string, changeId: string, create: boolean): Promise<string> {
  return registryCollectionPath(skillRoot, "changes", `${canonicalProjectHarnessId(changeId, "Change id")}.json`, create);
}

async function contractRecordPath(skillRoot: string, changeId: string, create: boolean): Promise<string> {
  return registryCollectionPath(skillRoot, "contracts", `${canonicalProjectHarnessId(changeId, "Contract Change id")}.json`, create);
}

async function registryCollectionPath(skillRoot: string, collection: string, name: string, create: boolean): Promise<string> {
  const relativePath = `state/registry/${collection}/${name}`;
  if (!create) return resolveWithinPhysicalRoot(skillRoot, relativePath, `project Harness ${collection} record`);
  const directory = await resolveWithinPhysicalRoot(
    skillRoot,
    `state/registry/${collection}`,
    `project Harness ${collection}`,
  );
  await mkdir(directory, { recursive: true });
  return resolveWithinPhysicalRoot(directory, name, `project Harness ${collection} record`);
}

async function changesRoot(skillRoot: string, create: boolean): Promise<string> {
  const root = await resolveWithinPhysicalRoot(skillRoot, "state/changes", "project Harness Changes");
  if (create) {
    await mkdir(root, { recursive: true });
    for (const stateName of ["active", "parking", "archive"]) {
      await mkdir(await resolveWithinPhysicalRoot(root, stateName, `Change ${stateName}`), { recursive: true });
    }
  }
  return root;
}

async function changeEvidencePath(
  skillRoot: string,
  state: "active" | "parking" | "archive",
  changeId: string,
  createParent: boolean,
): Promise<string> {
  const root = await changesRoot(skillRoot, createParent);
  const directory = await resolveWithinPhysicalRoot(root, state, `Change ${state}`);
  if (createParent) await mkdir(directory, { recursive: true });
  return resolveWithinPhysicalRoot(directory, canonicalProjectHarnessId(changeId, "Change id"), `Change ${state} evidence`);
}

function assertLaneOwner(context: ProjectHarnessRegistryContext, record: ProjectHarnessChangeRecord): void {
  if (record.lane_id !== projectHarnessLaneId(context)) throw new Error("Only the owning Lane may mutate this Change.");
}

function assertMutableChange(record: ProjectHarnessChangeRecord): void {
  if (TERMINAL_STATUSES.has(record.status)) throw new Error(`Terminal Change cannot be mutated: ${record.status}.`);
}

function isActiveChange(record: ProjectHarnessChangeRecord): boolean {
  return record.status === "planning" || record.status === "active" || record.status === "claiming";
}

function isConcurrentLaneContext(context: ProjectHarnessRegistryContext): boolean {
  return context.mode === "multi_lane" || context.lane?.kind === "conversation";
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function sortConflicts(values: readonly ProjectHarnessPreflightConflict[]): ProjectHarnessPreflightConflict[] {
  return [...values].sort((left, right) => left.other_change_id.localeCompare(right.other_change_id) || left.type.localeCompare(right.type));
}
