import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { lstat, mkdir, readFile, readdir, realpath, rm } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { parseJsonText, writeJsonFile } from "../fs/json.js";
import {
  listProjectHarnessChanges,
  loadProjectHarnessContract,
  type ProjectHarnessChangeRecord,
} from "./change.js";
import { readProjectHarnessManifest } from "./manifest.js";
import { assertPhysicalDirectory, resolveWithinPhysicalRoot } from "./path-safety.js";
import {
  canonicalProjectHarnessId,
  createExclusiveRegistryRecord,
  readBoundProjectHarnessRecords,
  readProjectHarnessBaseline,
  writeProjectHarnessBaseline,
} from "./registry.js";
import { parseIntegrationCandidateReview, type IntegrationCandidateReview } from "./reviews.js";
import {
  assertProjectHarnessWriterLockCurrent,
  claimProjectHarnessWriterLock,
  heartbeatProjectHarnessWriterLock,
  readProjectHarnessWriterLock,
  releaseProjectHarnessWriterLock,
} from "./writer-lock.js";

const execFileAsync = promisify(execFile);
const commitSchema = z.string().regex(/^[a-f0-9]{40,64}$/);
const WRITER_LOCK_TTL_MS = 5 * 60_000;

export type ProjectHarnessIntegrationStatus =
  | "preparing"
  | "preparing_failed"
  | "conflict"
  | "ready_for_review"
  | "landing"
  | "landing_recovery_required"
  | "integrated"
  | "aborted";

export type ProjectHarnessIntegrationLandingPhase =
  | "not_started"
  | "pre_merge"
  | "canonical_landed"
  | "registry_committed"
  | "cleanup_complete";

export interface ProjectHarnessIntegrationConflict {
  change_id: string | null;
  commit: string;
  head_before_conflict: string;
  detail: string;
}

export interface ProjectHarnessIntegrationRecord extends Record<string, unknown> {
  schema_version: "1.0";
  integration_id: string;
  project_id: string;
  status: ProjectHarnessIntegrationStatus;
  canonical_base: string;
  canonical_branch: string;
  change_ids: string[];
  completion_commits: string[];
  change_commit_ranges: Record<string, string[]>;
  applied_commits: string[];
  remaining_commits: string[];
  worktree_ref: { owner: "runtime-sidecar"; path: string };
  branch: string;
  integrator_id: string;
  conflicts: ProjectHarnessIntegrationConflict[];
  integrator_edits: string[];
  validation: string[];
  validation_passed: boolean;
  review: IntegrationCandidateReview | null;
  landing_commit: string | null;
  landing_candidate_commit: string | null;
  landing_phase: ProjectHarnessIntegrationLandingPhase;
  candidate_commit: string | null;
  reviewed_commit: string | null;
  registry_result: {
    affected_paths: string[];
    contract_change_ids: string[];
    event_id: string;
  } | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface StartProjectHarnessIntegrationInput {
  integrationId: string;
  projectId: string;
  projectRoot: string;
  skillRoot: string;
  sidecarRoot: string;
  changeIds: readonly string[];
  completionCommits?: Readonly<Record<string, string>>;
  integratorId: string;
}

export interface CompleteProjectHarnessIntegrationInput {
  integrationId: string;
  projectId: string;
  projectRoot: string;
  skillRoot: string;
  sidecarRoot: string;
  integratorId: string;
  confirmI2: boolean;
  validation: readonly string[];
  validationPassed: boolean;
  review: unknown;
  failureInjection?: (phase: ProjectHarnessIntegrationLandingPhase) => Promise<void> | void;
}

export interface ProjectHarnessGitResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface ProjectHarnessGitPort {
  run(cwd: string, args: readonly string[]): Promise<ProjectHarnessGitResult>;
}

const conflictSchema = z.object({
  change_id: z.string().nullable(),
  commit: commitSchema,
  head_before_conflict: commitSchema,
  detail: z.string(),
}).strict();

const integrationRecordSchema = z.object({
  schema_version: z.literal("1.0"),
  integration_id: z.string(),
  project_id: z.string(),
  status: z.enum([
    "preparing", "preparing_failed", "conflict", "ready_for_review", "landing",
    "landing_recovery_required", "integrated", "aborted",
  ]),
  canonical_base: commitSchema,
  canonical_branch: z.string().min(1),
  change_ids: z.array(z.string()),
  completion_commits: z.array(commitSchema),
  change_commit_ranges: z.record(z.array(commitSchema)),
  applied_commits: z.array(commitSchema),
  remaining_commits: z.array(commitSchema),
  worktree_ref: z.object({ owner: z.literal("runtime-sidecar"), path: z.string().min(1) }).strict(),
  branch: z.string().min(1),
  integrator_id: z.string().min(1),
  conflicts: z.array(conflictSchema),
  integrator_edits: z.array(z.string()),
  validation: z.array(z.string()),
  validation_passed: z.boolean(),
  review: z.unknown().nullable(),
  landing_commit: commitSchema.nullable(),
  landing_candidate_commit: commitSchema.nullable(),
  landing_phase: z.enum(["not_started", "pre_merge", "canonical_landed", "registry_committed", "cleanup_complete"]),
  candidate_commit: commitSchema.nullable(),
  reviewed_commit: commitSchema.nullable(),
  registry_result: z.object({
    affected_paths: z.array(z.string()),
    contract_change_ids: z.array(z.string()),
    event_id: z.string(),
  }).strict().nullable(),
  last_error: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
}).strict();

const defaultGitPort: ProjectHarnessGitPort = {
  async run(cwd, args) {
    try {
      const result = await execFileAsync("git", [...args], {
        cwd,
        encoding: "utf8",
        maxBuffer: 50 * 1024 * 1024,
        windowsHide: true,
      });
      return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
    } catch (error) {
      const failure = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: number | string };
      return {
        exitCode: typeof failure.code === "number" ? failure.code : 1,
        stdout: failure.stdout ?? "",
        stderr: failure.stderr ?? "",
      };
    }
  },
};

export async function listProjectHarnessIntegrations(skillRoot: string): Promise<ProjectHarnessIntegrationRecord[]> {
  const records = await readBoundProjectHarnessRecords<ProjectHarnessIntegrationRecord>(skillRoot, "integrations", "integration_id");
  return records.map((record) => integrationRecordSchema.parse(record) as ProjectHarnessIntegrationRecord)
    .sort((left, right) => left.integration_id.localeCompare(right.integration_id));
}

export async function loadProjectHarnessIntegration(
  skillRoot: string,
  integrationId: string,
  required = true,
): Promise<ProjectHarnessIntegrationRecord | null> {
  const id = canonicalProjectHarnessId(integrationId, "Integration id");
  const path = await integrationRecordPath(skillRoot, id, false);
  if (!existsSync(path)) {
    if (required) throw new Error(`Unknown Integration: ${id}.`);
    return null;
  }
  const value = integrationRecordSchema.parse(parseJsonText(await readFile(path, "utf8"), path));
  if (value.integration_id !== id) throw new Error(`Integration record id mismatch: ${id}.`);
  return value as ProjectHarnessIntegrationRecord;
}

export async function startProjectHarnessIntegration(
  input: StartProjectHarnessIntegrationInput,
  git: ProjectHarnessGitPort = defaultGitPort,
): Promise<ProjectHarnessIntegrationRecord> {
  const integrationId = canonicalProjectHarnessId(input.integrationId, "Integration id");
  const projectId = canonicalProjectHarnessId(input.projectId, "Project id");
  const integratorId = canonicalProjectHarnessId(input.integratorId, "Integrator id");
  await assertIntegrationIdentity(input.skillRoot, projectId);
  const changeIds = input.changeIds.map((id) => canonicalProjectHarnessId(id, "Integration Change id"));
  if (changeIds.length === 0 || new Set(changeIds).size !== changeIds.length) {
    throw new Error("Integration requires one or more unique Change ids.");
  }
  if (await loadProjectHarnessIntegration(input.skillRoot, integrationId, false)) {
    throw new Error(`Integration id already exists: ${integrationId}.`);
  }
  const canonical = await inspectCanonical(input.projectRoot, input.skillRoot, git);
  const selected = await selectIntegrationChanges(input, changeIds, git);
  const ordered = await orderChanges(input.skillRoot, selected);
  const ranges: Record<string, string[]> = {};
  for (const change of ordered) ranges[change.change_id] = await exactChangeCommits(input.projectRoot, change, git);
  const flattened = ordered.flatMap((change) => ranges[change.change_id]);
  if (new Set(flattened).size !== flattened.length) {
    throw new Error("Selected Change commit ranges overlap; split or rebase them before Integration.");
  }

  const sidecar = await ensurePhysicalDirectory(input.sidecarRoot, "project runtime sidecar");
  const worktree = await resolveWithinPhysicalRoot(sidecar, `integrations/${integrationId}/worktree`, "Integration worktree");
  await mkdir(dirname(worktree), { recursive: true });
  if (existsSync(worktree)) throw new Error(`Integration worktree already exists: ${integrationId}.`);
  const now = new Date().toISOString();
  const record: ProjectHarnessIntegrationRecord = {
    schema_version: "1.0",
    integration_id: integrationId,
    project_id: projectId,
    status: "preparing",
    canonical_base: canonical.head,
    canonical_branch: canonical.branch,
    change_ids: ordered.map((change) => change.change_id),
    completion_commits: ordered.map((change) => change.completion_commit as string),
    change_commit_ranges: ranges,
    applied_commits: [],
    remaining_commits: flattened,
    worktree_ref: {
      owner: "runtime-sidecar",
      path: relative(sidecar, worktree).replace(/\\/g, "/"),
    },
    branch: `integration/${integrationId}`,
    integrator_id: integratorId,
    conflicts: [],
    integrator_edits: [],
    validation: [],
    validation_passed: false,
    review: null,
    landing_commit: null,
    landing_candidate_commit: null,
    landing_phase: "not_started",
    candidate_commit: null,
    reviewed_commit: null,
    registry_result: null,
    last_error: null,
    created_at: now,
    updated_at: now,
  };
  await createExclusiveRegistryRecord(input.skillRoot, "integrations", integrationId, integrationRecordSchema.parse(record));
  const added = await git.run(input.projectRoot, ["worktree", "add", "-b", record.branch, worktree, record.canonical_base]);
  if (added.exitCode !== 0) {
    record.status = "preparing_failed";
    record.last_error = gitError(added);
    await writeIntegrationRecord(input.skillRoot, record);
    throw new Error(`Git could not create the Integration worktree: ${record.last_error}`);
  }
  return applyRemainingCommits(input.skillRoot, input.sidecarRoot, record, git);
}

export async function resumeProjectHarnessIntegration(
  skillRoot: string,
  sidecarRoot: string,
  integrationId: string,
  git: ProjectHarnessGitPort = defaultGitPort,
): Promise<ProjectHarnessIntegrationRecord> {
  const record = await requireIntegration(skillRoot, integrationId);
  if (record.status !== "conflict") throw new Error("Only a conflict Integration can be resumed.");
  const worktree = await resolveIntegrationWorktree(sidecarRoot, record);
  if ((await git.run(worktree, ["diff", "--name-only", "--diff-filter=U"])).stdout.trim()) {
    throw new Error("Integration still has unresolved conflicts.");
  }
  if (await resolveCommit(worktree, "CHERRY_PICK_HEAD", git)) {
    throw new Error("Finish git cherry-pick --continue before resuming Integration.");
  }
  if ((await git.run(worktree, ["status", "--porcelain"])).stdout.trim()) {
    throw new Error("Commit the resolved conflict before resuming Integration.");
  }
  const last = record.conflicts.at(-1);
  if (!last) throw new Error("Conflict Integration is missing conflict evidence.");
  const head = await requireCommit(worktree, "HEAD", git);
  if (head === last.head_before_conflict) throw new Error("The conflicted commit was not completed before resume.");
  record.remaining_commits = record.remaining_commits.filter((commit) => commit !== last.commit);
  if (!record.applied_commits.includes(last.commit)) record.applied_commits.push(last.commit);
  return applyRemainingCommits(skillRoot, sidecarRoot, record, git);
}

export async function completeProjectHarnessIntegration(
  input: CompleteProjectHarnessIntegrationInput,
  git: ProjectHarnessGitPort = defaultGitPort,
): Promise<ProjectHarnessIntegrationRecord> {
  if (input.confirmI2 !== true) throw new Error("Integration completion requires explicit I2 confirmation.");
  if (input.validationPassed !== true || !Array.isArray(input.validation) || input.validation.length === 0
    || input.validation.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error("Integration requires passing aggregate validation evidence.");
  }
  const integrationId = canonicalProjectHarnessId(input.integrationId, "Integration id");
  const projectId = canonicalProjectHarnessId(input.projectId, "Project id");
  const integratorId = canonicalProjectHarnessId(input.integratorId, "Integrator id");
  let record = await requireIntegration(input.skillRoot, integrationId);
  await assertIntegrationIdentity(input.skillRoot, projectId);
  if (record.project_id !== projectId || record.integrator_id !== integratorId) {
    throw new Error("Integration completion identity does not match the current record.");
  }
  if (record.status === "integrated") {
    const head = await requireCommit(input.projectRoot, "HEAD", git);
    if (head !== record.landing_commit) throw new Error("Canonical HEAD no longer matches the integrated record.");
    await releaseOwnedWriterLock(input.sidecarRoot, integrationId);
    return record;
  }
  const worktree = await resolveIntegrationWorktree(input.sidecarRoot, record);
  if (record.remaining_commits.length > 0 && ["not_started", "pre_merge"].includes(record.landing_phase)) {
    throw new Error("Integration still has unapplied commits.");
  }

  let candidate = record.landing_candidate_commit;
  let review = record.review;
  if (["not_started", "pre_merge"].includes(record.landing_phase)) {
    if (!existsSync(worktree)) throw new Error("Integration worktree is missing before canonical landing.");
    if ((await git.run(worktree, ["status", "--porcelain"])).stdout.trim()) {
      throw new Error("Commit Integrator edits and validation evidence before completion.");
    }
    candidate = await requireCommit(worktree, "HEAD", git);
    review = parseIntegrationCandidateReview(input.review, {
      integrationId,
      candidateCommit: candidate,
    });
    if (review.decision !== "approve") throw new Error("Integration independent review did not approve the candidate.");
    if (review.integrator_id !== record.integrator_id) {
      throw new Error("Integration review integrator identity does not match the current record.");
    }
  } else if (!candidate || !review) {
    throw new Error("Integration recovery record is missing its reviewed candidate.");
  }

  const lock = await claimOrReuseWriterLock(input.sidecarRoot, projectId, integrationId);
  let phase = record.landing_phase;
  try {
    await heartbeatIntegrationWriter(input.sidecarRoot, lock.token);
    if (["not_started", "pre_merge"].includes(phase)) {
      record = {
        ...record,
        status: "landing",
        landing_phase: "pre_merge",
        landing_candidate_commit: candidate,
        reviewed_commit: candidate,
        validation: [...input.validation],
        validation_passed: true,
        review,
        last_error: null,
        updated_at: new Date().toISOString(),
      };
      const baseCandidate = record.candidate_commit ?? record.canonical_base;
      record.integrator_edits = baseCandidate === candidate
        ? []
        : sortedLines((await gitChecked(worktree, ["diff", "--name-only", baseCandidate, candidate], git)).stdout);
      await writeIntegrationRecord(input.skillRoot, record);
      await input.failureInjection?.("pre_merge");
      await heartbeatIntegrationWriter(input.sidecarRoot, lock.token);
      const canonical = await inspectCanonical(input.projectRoot, input.skillRoot, git, record.canonical_branch);
      if (canonical.head !== candidate) {
        if (canonical.head !== record.canonical_base) {
          throw new Error("Canonical HEAD changed after Integration review.");
        }
        await gitChecked(input.projectRoot, ["merge", "--ff-only", candidate], git);
      }
      const landed = await requireCommit(input.projectRoot, "HEAD", git);
      if (landed !== candidate) throw new Error("Canonical landing did not produce the reviewed candidate commit.");
      record.landing_commit = landed;
      record.landing_phase = "canonical_landed";
      record.status = "landing_recovery_required";
      record.updated_at = new Date().toISOString();
      await writeIntegrationRecord(input.skillRoot, record);
      phase = "canonical_landed";
      await input.failureInjection?.("canonical_landed");
    }

    if (phase === "canonical_landed") {
      await heartbeatIntegrationWriter(input.sidecarRoot, lock.token);
      const canonicalHead = await requireCommit(input.projectRoot, "HEAD", git);
      if (canonicalHead !== record.landing_commit) {
        throw new Error("Canonical HEAD no longer matches the landed Integration commit.");
      }
      record.registry_result = await commitIntegrationRegistry(input.skillRoot, input.projectRoot, record, git);
      record.landing_phase = "registry_committed";
      record.status = "landing_recovery_required";
      record.updated_at = new Date().toISOString();
      await writeIntegrationRecord(input.skillRoot, record);
      phase = "registry_committed";
      await input.failureInjection?.("registry_committed");
    }

    if (phase === "registry_committed") {
      await heartbeatIntegrationWriter(input.sidecarRoot, lock.token);
      if (existsSync(worktree)) {
        await detachIntegrationDiscoveryLinks(worktree, input.skillRoot, (await readProjectHarnessManifest(input.skillRoot)).skill_name);
        await assertNoDirectoryLinks(worktree);
        await gitChecked(input.projectRoot, ["worktree", "remove", worktree], git);
      }
      await git.run(input.projectRoot, ["branch", "-d", record.branch]);
      record.landing_phase = "cleanup_complete";
      record.status = "integrated";
      record.last_error = null;
      record.updated_at = new Date().toISOString();
      await writeIntegrationRecord(input.skillRoot, record);
      phase = "cleanup_complete";
      await input.failureInjection?.("cleanup_complete");
    }
    await releaseProjectHarnessWriterLock(input.sidecarRoot, lock.token);
    return record;
  } catch (error) {
    const canonicalHead = await resolveCommit(input.projectRoot, "HEAD", git);
    const landed = Boolean(record.landing_commit || canonicalHead === candidate
      || ["canonical_landed", "registry_committed", "cleanup_complete"].includes(phase));
    record.status = landed ? "landing_recovery_required" : "ready_for_review";
    record.landing_phase = landed ? (phase === "pre_merge" ? "canonical_landed" : phase) : "pre_merge";
    if (landed && !record.landing_commit) record.landing_commit = candidate;
    record.last_error = error instanceof Error ? error.message : String(error);
    record.updated_at = new Date().toISOString();
    await writeIntegrationRecord(input.skillRoot, record).catch(() => undefined);
    if (!landed) await releaseOwnedWriterLock(input.sidecarRoot, integrationId);
    throw error;
  }
}

export async function abortProjectHarnessIntegration(
  input: Omit<CompleteProjectHarnessIntegrationInput, "confirmI2" | "validation" | "validationPassed" | "review">,
  git: ProjectHarnessGitPort = defaultGitPort,
): Promise<ProjectHarnessIntegrationRecord> {
  const projectId = canonicalProjectHarnessId(input.projectId, "Project id");
  const integratorId = canonicalProjectHarnessId(input.integratorId, "Integrator id");
  await assertIntegrationIdentity(input.skillRoot, projectId);
  const record = await requireIntegration(input.skillRoot, input.integrationId);
  if (record.project_id !== projectId || record.integrator_id !== integratorId) {
    throw new Error("Integration abort identity does not match the current record.");
  }
  const canonicalHead = await resolveCommit(input.projectRoot, "HEAD", git);
  if (!["not_started", "pre_merge"].includes(record.landing_phase)
    || (record.landing_candidate_commit && canonicalHead === record.landing_candidate_commit)) {
    throw new Error("A canonically landed Integration cannot be aborted; resume completion instead.");
  }
  const worktree = await resolveIntegrationWorktree(input.sidecarRoot, record, false);
  if (existsSync(worktree)) {
    await git.run(worktree, ["cherry-pick", "--abort"]);
    await git.run(worktree, ["merge", "--abort"]);
    await detachIntegrationDiscoveryLinks(worktree, input.skillRoot, (await readProjectHarnessManifest(input.skillRoot)).skill_name);
    await assertNoDirectoryLinks(worktree);
    await gitChecked(input.projectRoot, ["worktree", "remove", worktree], git);
  }
  await git.run(input.projectRoot, ["branch", "-D", record.branch]);
  record.status = "aborted";
  record.updated_at = new Date().toISOString();
  await writeIntegrationRecord(input.skillRoot, record);
  await releaseOwnedWriterLock(input.sidecarRoot, record.integration_id);
  return record;
}

async function selectIntegrationChanges(
  input: StartProjectHarnessIntegrationInput,
  changeIds: readonly string[],
  git: ProjectHarnessGitPort,
): Promise<ProjectHarnessChangeRecord[]> {
  const all = new Map((await listProjectHarnessChanges(input.skillRoot)).map((change) => [change.change_id, change]));
  const overrides = new Map(Object.entries(input.completionCommits ?? {}).map(([id, commit]) => [
    canonicalProjectHarnessId(id, "Integration completion Change id"),
    commit,
  ]));
  for (const id of overrides.keys()) {
    if (!changeIds.includes(id)) throw new Error(`Completion commit was provided for an unselected Change: ${id}.`);
  }
  const selected: ProjectHarnessChangeRecord[] = [];
  for (const id of changeIds) {
    const change = all.get(id);
    if (!change || change.status !== "completed" || !change.validation_passed || !change.evidence_complete) {
      throw new Error(`Change is not integration-ready: ${id}.`);
    }
    if (change.integrated_by) throw new Error(`Change is already integrated: ${id}.`);
    const stored = change.completion_commit ? await resolveCommit(input.projectRoot, change.completion_commit, git) : null;
    const overrideValue = overrides.get(id);
    const override = overrideValue ? await resolveCommit(input.projectRoot, overrideValue, git) : null;
    if (change.completion_commit && !stored) throw new Error(`Recorded completion commit is unavailable for Change: ${id}.`);
    if (overrideValue && !override) throw new Error(`Completion commit is unavailable for Change: ${id}.`);
    if (stored && override && stored !== override) throw new Error(`Completion commit conflicts with the recorded boundary: ${id}.`);
    const completion = stored ?? override;
    if (!completion) throw new Error(`Change has no Integration commit boundary: ${id}.`);
    selected.push({ ...change, completion_commit: completion });
  }
  return selected;
}

async function orderChanges(skillRoot: string, selected: ProjectHarnessChangeRecord[]): Promise<ProjectHarnessChangeRecord[]> {
  const selectedById = new Map(selected.map((change) => [change.change_id, change]));
  const remaining = [...selected];
  const ordered: ProjectHarnessChangeRecord[] = [];
  const orderedIds = new Set<string>();
  while (remaining.length > 0) {
    let progressed = false;
    for (const change of [...remaining]) {
      const contract = await loadProjectHarnessContract(skillRoot, change.change_id);
      const dependencies = new Set(contract?.depends_on_changes ?? []);
      for (const dependency of dependencies) {
        if (!selectedById.has(dependency)) {
          const external = (await listProjectHarnessChanges(skillRoot)).find((item) => item.change_id === dependency);
          if (!external?.integrated_by) throw new Error(`Change ${change.change_id} has unintegrated dependency: ${dependency}.`);
        }
      }
      const selectedDependencies = [...dependencies].filter((dependency) => selectedById.has(dependency));
      if (selectedDependencies.every((dependency) => orderedIds.has(dependency))) {
        ordered.push(change);
        orderedIds.add(change.change_id);
        remaining.splice(remaining.indexOf(change), 1);
        progressed = true;
      }
    }
    if (!progressed) throw new Error(`Integration dependency cycle among: ${remaining.map((item) => item.change_id).join(", ")}.`);
  }
  return ordered;
}

async function exactChangeCommits(
  projectRoot: string,
  change: ProjectHarnessChangeRecord,
  git: ProjectHarnessGitPort,
): Promise<string[]> {
  if (!change.base_commit || !change.completion_commit) {
    throw new Error(`Change has no exact base/completion range: ${change.change_id}.`);
  }
  const base = await resolveCommit(projectRoot, change.base_commit, git);
  const completion = await resolveCommit(projectRoot, change.completion_commit, git);
  if (!base || !completion) throw new Error(`Change commit range is unavailable: ${change.change_id}.`);
  if ((await git.run(projectRoot, ["merge-base", "--is-ancestor", base, completion])).exitCode !== 0) {
    throw new Error(`Completion commit is not descended from base: ${change.change_id}.`);
  }
  const commits = sortedLines((await gitChecked(projectRoot, ["rev-list", "--reverse", "--topo-order", `${base}..${completion}`], git)).stdout);
  if (commits.length === 0) throw new Error(`Change has an empty commit range: ${change.change_id}.`);
  for (const commit of commits) {
    const parents = sortedLines((await gitChecked(projectRoot, ["rev-list", "--parents", "-n", "1", commit], git)).stdout)[0].split(/\s+/);
    if (parents.length > 2) throw new Error(`Change ${change.change_id} contains merge commit ${commit}.`);
  }
  return commits;
}

async function applyRemainingCommits(
  skillRoot: string,
  sidecarRoot: string,
  record: ProjectHarnessIntegrationRecord,
  git: ProjectHarnessGitPort,
): Promise<ProjectHarnessIntegrationRecord> {
  const worktree = await resolveIntegrationWorktree(sidecarRoot, record);
  record.status = "preparing";
  while (record.remaining_commits.length > 0) {
    const commit = record.remaining_commits[0];
    const before = await requireCommit(worktree, "HEAD", git);
    const result = await git.run(worktree, ["cherry-pick", commit]);
    if (result.exitCode !== 0) {
      record.status = "conflict";
      record.conflicts.push({
        change_id: changeForCommit(record, commit),
        commit,
        head_before_conflict: before,
        detail: gitError(result),
      });
      break;
    }
    record.remaining_commits.shift();
    record.applied_commits.push(commit);
  }
  if (record.remaining_commits.length === 0) {
    record.status = "ready_for_review";
    record.candidate_commit = await requireCommit(worktree, "HEAD", git);
  }
  record.updated_at = new Date().toISOString();
  await writeIntegrationRecord(skillRoot, record);
  return record;
}

async function commitIntegrationRegistry(
  skillRoot: string,
  projectRoot: string,
  record: ProjectHarnessIntegrationRecord,
  git: ProjectHarnessGitPort,
): Promise<ProjectHarnessIntegrationRecord["registry_result"] & object> {
  const landing = record.landing_commit as string;
  const affectedPaths = sortedLines((await gitChecked(projectRoot, ["diff", "--name-only", record.canonical_base, landing], git)).stdout);
  const contractChangeIds: string[] = [];
  for (const changeId of record.change_ids) {
    const changes = await listProjectHarnessChanges(skillRoot);
    const change = changes.find((item) => item.change_id === changeId);
    if (!change) throw new Error(`Integration Change disappeared: ${changeId}.`);
    await writeRegistryEntity(skillRoot, "changes", changeId, {
      ...change,
      integrated_by: record.integration_id,
      integration_status: "integrated",
      updated_at: new Date().toISOString(),
    });
    const contract = await loadProjectHarnessContract(skillRoot, changeId);
    if (contract) {
      contractChangeIds.push(changeId);
      await writeRegistryEntity(skillRoot, "contracts", changeId, {
        ...contract,
        status: "integrated",
        updated_at: new Date().toISOString(),
      });
    }
  }
  const eventId = `${record.integration_id}-${landing.slice(0, 12)}`;
  await writeRegistryEntity(skillRoot, "baseline-events", eventId, {
    schema_version: "1.0",
    event: "canonical-baseline-advanced",
    integration_id: record.integration_id,
    previous_canonical_commit: record.canonical_base,
    canonical_commit: landing,
    change_ids: record.change_ids,
    affected_paths: affectedPaths,
    contracts: contractChangeIds,
    knowledge_status: "refresh-needed-for-affected-scopes",
    knowledge_refresh_deferred_to_evolution: true,
    updated_at: new Date().toISOString(),
  });
  await writeProjectHarnessBaseline(skillRoot, {
    schema_version: "1.0",
    canonical_branch: record.canonical_branch,
    canonical_commit: landing,
    updated_at: new Date().toISOString(),
  });
  return { affected_paths: affectedPaths, contract_change_ids: contractChangeIds, event_id: eventId };
}

async function inspectCanonical(
  projectRoot: string,
  skillRoot: string,
  git: ProjectHarnessGitPort,
  expectedBranch?: string,
): Promise<{ branch: string; head: string }> {
  const project = await assertPhysicalDirectory(projectRoot, "canonical project worktree");
  const status = await gitChecked(project, ["status", "--porcelain"], git);
  if (status.stdout.trim()) throw new Error("Canonical worktree must be clean for Integration.");
  const branch = (await gitChecked(project, ["branch", "--show-current"], git)).stdout.trim();
  const head = await requireCommit(project, "HEAD", git);
  const baseline = await readProjectHarnessBaseline(skillRoot);
  const requiredBranch = expectedBranch ?? baseline?.canonical_branch;
  if (!branch || !requiredBranch || branch !== requiredBranch) {
    throw new Error(`Integration must run from canonical branch ${requiredBranch ?? "<unknown>"}.`);
  }
  if (baseline?.canonical_commit && baseline.canonical_commit !== head) {
    if ((await git.run(project, ["merge-base", "--is-ancestor", baseline.canonical_commit, head])).exitCode !== 0) {
      throw new Error("Canonical branch diverged from the Registry baseline.");
    }
    await writeProjectHarnessBaseline(skillRoot, {
      ...baseline,
      canonical_commit: head,
      updated_at: new Date().toISOString(),
    });
  }
  return { branch, head };
}

async function resolveIntegrationWorktree(
  sidecarRoot: string,
  record: ProjectHarnessIntegrationRecord,
  required = true,
): Promise<string> {
  const sidecar = await assertPhysicalDirectory(sidecarRoot, "project runtime sidecar");
  const path = await resolveWithinPhysicalRoot(sidecar, record.worktree_ref.path, "Integration worktree");
  const expected = await resolveWithinPhysicalRoot(sidecar, `integrations/${record.integration_id}/worktree`, "Integration worktree");
  if (resolve(path) !== resolve(expected)) throw new Error("Integration worktree reference is invalid.");
  if (required) await assertPhysicalDirectory(path, "Integration worktree");
  return path;
}

async function detachIntegrationDiscoveryLinks(worktree: string, skillRoot: string, skillName: string): Promise<void> {
  const target = normalizeIdentity(await realpath(skillRoot));
  for (const link of [
    join(worktree, ".agents", "skills", skillName),
    join(worktree, ".claude", "skills", skillName),
  ]) {
    if (!existsSync(link)) continue;
    const info = await lstat(link);
    if (!info.isSymbolicLink()) throw new Error(`Integration discovery path is not a removable link: ${link}.`);
    if (normalizeIdentity(await realpath(link)) !== target) {
      throw new Error(`Integration discovery link targets another Skill: ${link}.`);
    }
    await rm(link, { force: false });
  }
}

async function assertNoDirectoryLinks(root: string): Promise<void> {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.name === ".git") continue;
    const path = join(root, entry.name);
    const info = await lstat(path);
    if (info.isSymbolicLink()) throw new Error(`Integration worktree contains an unknown link or Junction: ${path}.`);
    if (info.isDirectory()) await assertNoDirectoryLinks(path);
  }
}

async function claimOrReuseWriterLock(sidecarRoot: string, projectId: string, integrationId: string) {
  const existing = await readProjectHarnessWriterLock(sidecarRoot);
  if (existing) {
    try {
      await assertProjectHarnessWriterLockCurrent(sidecarRoot, existing.token);
      if (existing.projectId !== projectId || existing.ownerId !== integrationId || existing.operation !== "integration-finalize") {
        throw new Error(`Project Harness writer lock is already held by ${existing.operation} by ${existing.ownerId}.`);
      }
      return existing;
    } catch (error) {
      if (!/expired/.test(error instanceof Error ? error.message : String(error))) throw error;
    }
  }
  return claimProjectHarnessWriterLock(sidecarRoot, {
    projectId,
    ownerId: integrationId,
    operation: "integration-finalize",
  });
}

async function heartbeatIntegrationWriter(sidecarRoot: string, token: string): Promise<void> {
  await heartbeatProjectHarnessWriterLock(sidecarRoot, token, WRITER_LOCK_TTL_MS, new Date());
}

async function releaseOwnedWriterLock(sidecarRoot: string, integrationId: string): Promise<void> {
  const lock = await readProjectHarnessWriterLock(sidecarRoot);
  if (!lock) return;
  if (lock.ownerId !== integrationId || lock.operation !== "integration-finalize") return;
  await releaseProjectHarnessWriterLock(sidecarRoot, lock.token);
}

async function assertIntegrationIdentity(skillRoot: string, projectId: string): Promise<void> {
  const manifest = await readProjectHarnessManifest(skillRoot);
  if (manifest.project_id !== projectId || basename(skillRoot) !== manifest.skill_name) {
    throw new Error("Integration project identity does not match the project Harness Skill.");
  }
}

async function integrationRecordPath(skillRoot: string, integrationId: string, create: boolean): Promise<string> {
  const root = await resolveWithinPhysicalRoot(skillRoot, "state/registry/integrations", "project Harness integrations");
  if (!existsSync(root)) {
    if (!create) return join(root, `${canonicalProjectHarnessId(integrationId, "Integration id")}.json`);
    await mkdir(root, { recursive: true });
  }
  return resolveWithinPhysicalRoot(root, `${canonicalProjectHarnessId(integrationId, "Integration id")}.json`, "Integration record");
}

async function writeIntegrationRecord(skillRoot: string, record: ProjectHarnessIntegrationRecord): Promise<void> {
  await writeJsonFile(await integrationRecordPath(skillRoot, record.integration_id, true), integrationRecordSchema.parse(record));
}

async function writeRegistryEntity(skillRoot: string, collection: string, id: string, value: unknown): Promise<void> {
  const root = await resolveWithinPhysicalRoot(skillRoot, `state/registry/${collection}`, `project Harness ${collection}`);
  await mkdir(root, { recursive: true });
  await writeJsonFile(await resolveWithinPhysicalRoot(root, `${canonicalProjectHarnessId(id)}.json`, `project Harness ${collection}`), value);
}

async function requireIntegration(skillRoot: string, integrationId: string): Promise<ProjectHarnessIntegrationRecord> {
  return await loadProjectHarnessIntegration(skillRoot, integrationId, true) as ProjectHarnessIntegrationRecord;
}

async function ensurePhysicalDirectory(path: string, label: string): Promise<string> {
  await mkdir(path, { recursive: true });
  return assertPhysicalDirectory(path, label);
}

async function resolveCommit(cwd: string, reference: string, git: ProjectHarnessGitPort): Promise<string | null> {
  const result = await git.run(cwd, ["rev-parse", "--verify", `${reference}^{commit}`]);
  const commit = result.stdout.trim().toLowerCase();
  return result.exitCode === 0 && /^[a-f0-9]{40,64}$/.test(commit) ? commit : null;
}

async function requireCommit(cwd: string, reference: string, git: ProjectHarnessGitPort): Promise<string> {
  const commit = await resolveCommit(cwd, reference, git);
  if (!commit) throw new Error(`Git commit is unavailable: ${reference}.`);
  return commit;
}

async function gitChecked(cwd: string, args: readonly string[], git: ProjectHarnessGitPort): Promise<ProjectHarnessGitResult> {
  const result = await git.run(cwd, args);
  if (result.exitCode !== 0) throw new Error(`Git ${args.join(" ")} failed: ${gitError(result)}`);
  return result;
}

function changeForCommit(record: ProjectHarnessIntegrationRecord, commit: string): string | null {
  return record.change_ids.find((id) => record.change_commit_ranges[id]?.includes(commit)) ?? null;
}

function gitError(result: ProjectHarnessGitResult): string {
  return (result.stderr || result.stdout).trim() || `exit ${result.exitCode}`;
}

function sortedLines(value: string): string[] {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function normalizeIdentity(path: string): string {
  const value = resolve(path);
  return process.platform === "win32" ? value.toLowerCase() : value;
}
