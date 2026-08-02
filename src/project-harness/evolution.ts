import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, lstat, mkdir, readFile, readdir, rm } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { z } from "zod";
import { atomicWriteFile, parseJsonText, writeJsonFile } from "../fs/json.js";
import { listProjectHarnessChanges, type ProjectHarnessChangeRecord } from "./change.js";
import { fingerprintProjectHarness, fingerprintProjectHarnessContent } from "./fingerprint.js";
import { readProjectHarnessManifest } from "./manifest.js";
import { assertPhysicalDirectory, resolveWithinPhysicalRoot } from "./path-safety.js";
import { publishProjectHarnessCandidate } from "./publication.js";
import { parseEvolutionCandidateJudge, type EvolutionCandidateJudge } from "./reviews.js";
import type { SourceFingerprintSnapshot } from "./source-fingerprint.js";
import { canonicalProjectHarnessId } from "./registry.js";
import { projectHarnessSharedWriterRoot, withProjectHarnessWriterLock } from "./writer-lock.js";

export interface ProjectHarnessEvolutionState {
  schema_version: "1.0";
  threshold: number;
  evaluated_change_ids: string[];
  pending_change_ids: string[];
  pending: boolean;
  last_completed_at?: string;
  last_proposal_id?: string;
  last_owner_id?: string;
  last_result_status?: "keep" | "rejected" | "noop";
  last_score?: number | null;
  last_judge_report?: unknown;
  last_evaluated_change_ids?: string[];
  last_claim_token_hash?: string;
}

export interface ProjectHarnessEvolutionStageRecord {
  schema_version: "1.0";
  proposal_id: string;
  owner_id: string;
  claim_token: string;
  mode: "focused" | "full";
  change_ids: string[];
  candidate_ref: { owner: "runtime-sidecar"; path: string };
  candidate_fingerprint: string;
  source_paths: string[];
  source_snapshot_digest: string;
  current_content_fingerprint: string;
  staged_at: string;
}

export interface StageProjectHarnessEvolutionInput {
  proposalId: string;
  ownerId: string;
  mode: "focused" | "full";
  e1Approved: boolean;
  candidateRoot: string;
  sourcePaths: readonly string[];
  sourceSnapshot: SourceFingerprintSnapshot;
  changeIds?: readonly string[];
}

export interface CompleteProjectHarnessEvolutionInput {
  proposalId: string;
  ownerId: string;
  claimToken: string;
  status: "keep" | "rejected" | "noop";
  judge?: unknown;
  judgeUnavailable?: boolean;
  validation: {
    harnessPassed: boolean;
    projectPassed: boolean;
    fullTestRequired: boolean;
    fullTestPassed: boolean;
  };
  note: string;
  sourceSnapshot: SourceFingerprintSnapshot;
}

export interface ProjectHarnessEvolutionResult {
  proposalId: string;
  status: "keep" | "rejected" | "noop";
  score: number | null;
  revision: number;
  evaluatedChangeIds: string[];
  pendingChangeIds: string[];
  cleanupPending: boolean;
}

const stateSchema = z.object({
  schema_version: z.literal("1.0"),
  threshold: z.number().int().positive(),
  evaluated_change_ids: z.array(z.string()),
  pending_change_ids: z.array(z.string()),
  pending: z.boolean(),
  last_completed_at: z.string().optional(),
  last_proposal_id: z.string().optional(),
  last_owner_id: z.string().optional(),
  last_result_status: z.enum(["keep", "rejected", "noop"]).optional(),
  last_score: z.number().nullable().optional(),
  last_judge_report: z.unknown().optional(),
  last_evaluated_change_ids: z.array(z.string()).optional(),
  last_claim_token_hash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).passthrough();

const stageSchema = z.object({
  schema_version: z.literal("1.0"),
  proposal_id: z.string(),
  owner_id: z.string(),
  claim_token: z.string(),
  mode: z.enum(["focused", "full"]),
  change_ids: z.array(z.string()).min(1),
  candidate_ref: z.object({ owner: z.literal("runtime-sidecar"), path: z.string() }).strict(),
  candidate_fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  source_paths: z.array(z.string()),
  source_snapshot_digest: z.string().regex(/^[a-f0-9]{64}$/),
  current_content_fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  staged_at: z.string(),
}).strict();

export async function checkProjectHarnessEvolution(
  skillRoot: string,
  sidecarRoot: string,
  ownerId = "evolution-check",
): Promise<ProjectHarnessEvolutionState> {
  const manifest = await readProjectHarnessManifest(skillRoot);
  return withProjectHarnessWriterLock(projectHarnessSharedWriterRoot(sidecarRoot), {
    projectId: manifest.project_id,
    ownerId: canonicalProjectHarnessId(ownerId, "Evolution check owner id"),
    operation: "evolution-publish",
  }, async () => refreshProjectHarnessEvolutionState(skillRoot));
}

async function refreshProjectHarnessEvolutionState(skillRoot: string): Promise<ProjectHarnessEvolutionState> {
  const state = await readProjectHarnessEvolutionState(skillRoot);
  const changes = await listProjectHarnessChanges(skillRoot);
  const pending = eligibleUnevaluatedChanges(changes, state.evaluated_change_ids);
  const next: ProjectHarnessEvolutionState = {
    ...state,
    pending_change_ids: pending.map((change) => change.change_id),
    pending: pending.length >= state.threshold,
  };
  await writeEvolutionState(skillRoot, next);
  return next;
}

export async function readProjectHarnessEvolutionState(skillRoot: string): Promise<ProjectHarnessEvolutionState> {
  const root = await evolutionRoot(skillRoot, false);
  const path = join(root, "state.json");
  if (!existsSync(path)) {
    return {
      schema_version: "1.0",
      threshold: 5,
      evaluated_change_ids: [],
      pending_change_ids: [],
      pending: false,
    };
  }
  const value = stateSchema.parse(parseJsonText(await readFile(path, "utf8"), path));
  return {
    ...value,
    evaluated_change_ids: uniqueCanonicalIds(value.evaluated_change_ids, "evaluated Change id"),
    pending_change_ids: uniqueCanonicalIds(value.pending_change_ids, "pending Change id"),
  } as ProjectHarnessEvolutionState;
}

export async function stageProjectHarnessEvolution(
  skillRoot: string,
  sidecarRoot: string,
  input: StageProjectHarnessEvolutionInput,
): Promise<ProjectHarnessEvolutionStageRecord> {
  if (input.e1Approved !== true) throw new Error("Evolution staging requires explicit E1 approval.");
  if (input.mode !== "focused" && input.mode !== "full") throw new Error("Evolution mode must be focused or full.");
  const proposalId = canonicalProjectHarnessId(input.proposalId, "Evolution proposal id");
  const ownerId = canonicalProjectHarnessId(input.ownerId, "Evolution owner id");
  const sourcePaths = uniqueSourcePaths(input.sourcePaths);
  const sourceSnapshotDigest = await input.sourceSnapshot.digest(sourcePaths);
  const currentContentFingerprint = await fingerprintProjectHarnessContent(skillRoot);
  const candidate = await assertPhysicalDirectory(input.candidateRoot, "Evolution candidate");
  const currentManifest = await readProjectHarnessManifest(skillRoot);
  const candidateManifest = await readProjectHarnessManifest(candidate);
  if (candidateManifest.project_id !== currentManifest.project_id
    || candidateManifest.skill_name !== currentManifest.skill_name
    || candidateManifest.skill_revision !== currentManifest.skill_revision + 1) {
    throw new Error("Evolution candidate identity or revision is invalid.");
  }
  const candidateFingerprint = await fingerprintProjectHarnessContent(candidate);
  if (candidateFingerprint === currentContentFingerprint) {
    throw new Error("Evolution candidate content must differ from the current Harness.");
  }
  return withProjectHarnessWriterLock(projectHarnessSharedWriterRoot(sidecarRoot), {
    projectId: currentManifest.project_id,
    ownerId,
    operation: "evolution-publish",
  }, async () => {
    if (await fingerprintProjectHarnessContent(skillRoot) !== currentContentFingerprint) {
      throw new Error("Current project Harness content changed before Evolution staging.");
    }
    const state = await refreshProjectHarnessEvolutionState(skillRoot);
    if (!state.pending) throw new Error("Project Harness Evolution is not pending.");
    const frozen = state.pending_change_ids.slice(0, state.threshold);
    const requested = input.changeIds ? uniqueCanonicalIds(input.changeIds, "Evolution Change id") : frozen;
    if (requested.length !== frozen.length || requested.some((id, index) => id !== frozen[index])) {
      throw new Error("Evolution must freeze the first complete pending Change window in stable order.");
    }

    const ownerRoot = await evolutionOwnerRoot(skillRoot, true);
    await recoverIncompleteEvolutionClaim(skillRoot, sidecarRoot, ownerRoot);
    try {
      await mkdir(ownerRoot);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        throw new Error("Another Project Harness Evolution owner is already active.");
      }
      throw error;
    }
    const claimToken = randomUUID();
    const sidecarCandidate = await evolutionCandidateRoot(sidecarRoot, proposalId, true);
    try {
      await copyPhysicalTree(candidate, sidecarCandidate);
      const stage: ProjectHarnessEvolutionStageRecord = {
        schema_version: "1.0",
        proposal_id: proposalId,
        owner_id: ownerId,
        claim_token: claimToken,
        mode: input.mode,
        change_ids: frozen,
        candidate_ref: {
          owner: "runtime-sidecar",
          path: relative(resolve(sidecarRoot), sidecarCandidate).replace(/\\/g, "/"),
        },
        candidate_fingerprint: candidateFingerprint,
        source_paths: sourcePaths,
        source_snapshot_digest: sourceSnapshotDigest,
        current_content_fingerprint: currentContentFingerprint,
        staged_at: new Date().toISOString(),
      };
      await writeJsonFile(join(ownerRoot, "owner.json"), stage);
      const root = await evolutionRoot(skillRoot, true);
      await mkdir(join(root, "staging"), { recursive: true });
      await writeJsonFile(join(root, "staging", `${proposalId}.json`), stage);
      return stage;
    } catch (error) {
      await rm(dirname(sidecarCandidate), { recursive: true, force: true });
      await rm(ownerRoot, { recursive: true, force: true });
      throw error;
    }
  });
}

export async function completeProjectHarnessEvolution(
  skillRoot: string,
  sidecarRoot: string,
  input: CompleteProjectHarnessEvolutionInput,
): Promise<ProjectHarnessEvolutionResult> {
  if (!["keep", "rejected", "noop"].includes(input.status)) {
    throw new Error("Evolution terminal status must be keep, rejected, or noop.");
  }
  let stage: ProjectHarnessEvolutionStageRecord;
  try {
    stage = await readEvolutionStage(skillRoot, input.proposalId);
  } catch (error) {
    if (!(error instanceof EvolutionStageNotActiveError)) throw error;
    return readCompletedEvolutionResult(skillRoot, sidecarRoot, input);
  }
  assertEvolutionOwner(stage, input);
  const candidateRoot = await resolveEvolutionCandidate(sidecarRoot, stage);
  const candidateFingerprint = await fingerprintProjectHarnessContent(candidateRoot);
  if (candidateFingerprint !== stage.candidate_fingerprint) {
    throw new Error("Evolution candidate changed after staging.");
  }
  const sourceSnapshotDigest = await input.sourceSnapshot.digest(stage.source_paths);
  if (sourceSnapshotDigest !== stage.source_snapshot_digest) {
    throw new Error("Evolution source snapshot changed after staging.");
  }
  const currentFingerprint = await fingerprintProjectHarnessContent(skillRoot);
  if (currentFingerprint !== stage.current_content_fingerprint) {
    throw new Error("Current project Harness content changed during Evolution.");
  }
  const judge = validateEvolutionOutcome(input, stage);
  const score = judge?.score ?? null;
  const currentManifest = await readProjectHarnessManifest(skillRoot);

  let result: ProjectHarnessEvolutionResult;
  if (input.status === "keep") {
    const currentTreeFingerprint = await fingerprintProjectHarness(skillRoot);
    await publishProjectHarnessCandidate({
      projectId: currentManifest.project_id,
      ownerId: input.ownerId,
      currentSkillRoot: skillRoot,
      candidateSkillRoot: candidateRoot,
      sidecarRoot,
      expectedCurrentFingerprint: currentTreeFingerprint,
      expectedCandidateContentFingerprint: stage.candidate_fingerprint,
      transactionId: `evolution-${stage.proposal_id}-${stage.claim_token}`,
      commitEffectPaths: [
        "state/evolution/results.tsv",
        "state/evolution/state.json",
        `state/evolution/staging/${stage.proposal_id}.json`,
        "state/registry/locks/evolution-owner",
      ],
      async commitEffect(publishedRoot) {
        await writeEvolutionTerminalState(publishedRoot, stage, input, judge);
      },
    });
    const nextState = await readProjectHarnessEvolutionState(skillRoot);
    result = {
      proposalId: stage.proposal_id,
      status: "keep",
      score,
      revision: currentManifest.skill_revision + 1,
      evaluatedChangeIds: stage.change_ids,
      pendingChangeIds: nextState.pending_change_ids,
      cleanupPending: false,
    };
  } else {
    await withProjectHarnessWriterLock(projectHarnessSharedWriterRoot(sidecarRoot), {
      projectId: currentManifest.project_id,
      ownerId: input.ownerId,
      operation: "evolution-publish",
    }, async () => {
      if (await fingerprintProjectHarnessContent(skillRoot) !== stage.current_content_fingerprint) {
        throw new Error("Current project Harness content changed before Evolution result publication.");
      }
      await writeEvolutionTerminalState(skillRoot, stage, input, judge);
    });
    const nextState = await readProjectHarnessEvolutionState(skillRoot);
    result = {
      proposalId: stage.proposal_id,
      status: input.status,
      score,
      revision: currentManifest.skill_revision,
      evaluatedChangeIds: stage.change_ids,
      pendingChangeIds: nextState.pending_change_ids,
      cleanupPending: false,
    };
  }
  try {
    await rm(dirname(candidateRoot), { recursive: true, force: false });
  } catch {
    result.cleanupPending = true;
  }
  return result;
}

function validateEvolutionOutcome(
  input: CompleteProjectHarnessEvolutionInput,
  stage: ProjectHarnessEvolutionStageRecord,
): EvolutionCandidateJudge | null {
  const validationValues = [
    input.validation.harnessPassed,
    input.validation.projectPassed,
    input.validation.fullTestRequired,
    input.validation.fullTestPassed,
  ];
  if (validationValues.some((value) => typeof value !== "boolean")) {
    throw new Error("Evolution validation fields must be boolean.");
  }
  if (input.status === "keep" && (input.validation.harnessPassed !== true || input.validation.projectPassed !== true
    || (input.validation.fullTestRequired === true && input.validation.fullTestPassed !== true))) {
    throw new Error("Evolution terminal result requires all declared validation to pass.");
  }
  if (input.status === "noop") {
    if (input.judgeUnavailable !== true || input.judge !== undefined) {
      throw new Error("Evolution noop is reserved for an unavailable independent Judge.");
    }
    return null;
  }
  if (!input.judge) throw new Error("Evolution keep/rejected requires an independent Judge report.");
  const judge = parseEvolutionCandidateJudge(input.judge, {
    candidateFingerprint: stage.candidate_fingerprint,
    sourceSnapshotDigest: stage.source_snapshot_digest,
  });
  if (judge.proposal_id !== stage.proposal_id) throw new Error("Evolution Judge proposal id is stale.");
  if (judge.author_id !== stage.owner_id) throw new Error("Evolution Judge author identity does not match the staged owner.");
  if (input.status === "keep" && judge.decision !== "keep") throw new Error("Evolution keep requires a keep Judge decision.");
  if (input.status === "rejected" && judge.decision !== "reject") throw new Error("Evolution rejected requires a reject Judge decision.");
  return judge;
}

async function writeEvolutionTerminalState(
  skillRoot: string,
  stage: ProjectHarnessEvolutionStageRecord,
  input: CompleteProjectHarnessEvolutionInput,
  judge: EvolutionCandidateJudge | null,
): Promise<void> {
  const root = await evolutionRoot(skillRoot, true);
  const state = await readProjectHarnessEvolutionState(skillRoot);
  const evaluated = uniqueCanonicalIds([...state.evaluated_change_ids, ...stage.change_ids], "evaluated Change id");
  const eligible = eligibleUnevaluatedChanges(await listProjectHarnessChanges(skillRoot), evaluated);
  const now = new Date().toISOString();
  const next: ProjectHarnessEvolutionState = {
    ...state,
    evaluated_change_ids: evaluated,
    pending_change_ids: eligible.map((change) => change.change_id),
    pending: eligible.length >= state.threshold,
    last_completed_at: now,
    last_proposal_id: stage.proposal_id,
    last_owner_id: stage.owner_id,
    last_result_status: input.status,
    last_score: judge?.score ?? null,
    last_judge_report: judge ?? { judge_unavailable: true },
    last_evaluated_change_ids: stage.change_ids,
    last_claim_token_hash: hashClaimToken(stage.claim_token),
  };
  const resultsPath = join(root, "results.tsv");
  const beforeResults = existsSync(resultsPath) ? await readFile(resultsPath, "utf8") : "timestamp\tproposal_id\tchange_ids\tscore\tstatus\teval_mode\tnote\n";
  const row = [
    now,
    stage.proposal_id,
    stage.change_ids.join(","),
    judge?.score ?? "",
    input.status,
    judge?.eval_mode ?? "judge-unavailable",
    sanitizeTsv(input.note),
  ].join("\t");
  const hasRow = beforeResults.split(/\r?\n/).some((line) => line.split("\t")[1] === stage.proposal_id);
  if (hasRow && state.last_proposal_id !== stage.proposal_id) {
    throw new Error("Evolution results already contain this proposal without matching terminal state.");
  }
  const nextResults = hasRow ? beforeResults : `${beforeResults.replace(/\s*$/, "\n")}${row}\n`;
  const statePath = join(root, "state.json");
  const stagePath = join(root, "staging", `${stage.proposal_id}.json`);
  const ownerRoot = await evolutionOwnerRoot(skillRoot, false);
  const ownerPath = join(ownerRoot, "owner.json");
  const beforeState = existsSync(statePath) ? await readFile(statePath, "utf8") : null;
  const beforeStage = await readFile(stagePath, "utf8");
  const beforeOwner = await readFile(ownerPath, "utf8");
  try {
    await atomicWriteFile(resultsPath, nextResults);
    await writeEvolutionState(skillRoot, next);
    await rm(stagePath, { force: true });
    await rm(ownerRoot, { recursive: true, force: false });
  } catch (error) {
    const restoreErrors: unknown[] = [];
    for (const restore of [
      () => atomicWriteFile(resultsPath, beforeResults),
      () => beforeState === null ? rm(statePath, { force: true }) : atomicWriteFile(statePath, beforeState),
      async () => {
        await mkdir(dirname(stagePath), { recursive: true });
        await atomicWriteFile(stagePath, beforeStage);
      },
      async () => {
        await mkdir(ownerRoot, { recursive: true });
        await atomicWriteFile(ownerPath, beforeOwner);
      },
    ]) {
      try {
        await restore();
      } catch (restoreError) {
        restoreErrors.push(restoreError);
      }
    }
    if (restoreErrors.length > 0) {
      throw new AggregateError([error, ...restoreErrors], "Evolution terminal state failed and could not be fully restored.");
    }
    throw error;
  }
}

async function readEvolutionStage(skillRoot: string, proposalId: string): Promise<ProjectHarnessEvolutionStageRecord> {
  const id = canonicalProjectHarnessId(proposalId, "Evolution proposal id");
  const ownerPath = join(await evolutionOwnerRoot(skillRoot, false), "owner.json");
  const stagePath = join(await evolutionRoot(skillRoot, false), "staging", `${id}.json`);
  if (!existsSync(ownerPath) || !existsSync(stagePath)) throw new EvolutionStageNotActiveError(id);
  const owner = stageSchema.parse(parseJsonText(await readFile(ownerPath, "utf8"), ownerPath));
  const stage = stageSchema.parse(parseJsonText(await readFile(stagePath, "utf8"), stagePath));
  if (JSON.stringify(owner) !== JSON.stringify(stage)) throw new Error("Evolution owner and stage records differ.");
  return stage;
}

function assertEvolutionOwner(
  stage: ProjectHarnessEvolutionStageRecord,
  input: CompleteProjectHarnessEvolutionInput,
): void {
  if (stage.owner_id !== canonicalProjectHarnessId(input.ownerId, "Evolution owner id")
    || stage.claim_token !== input.claimToken
    || stage.proposal_id !== canonicalProjectHarnessId(input.proposalId, "Evolution proposal id")) {
    throw new Error("Evolution terminal result is not owned by this claim.");
  }
}

async function writeEvolutionState(skillRoot: string, state: ProjectHarnessEvolutionState): Promise<void> {
  const root = await evolutionRoot(skillRoot, true);
  await writeJsonFile(join(root, "state.json"), stateSchema.parse(state));
}

async function evolutionRoot(skillRoot: string, create: boolean): Promise<string> {
  const skill = await assertPhysicalDirectory(skillRoot, "project Harness Skill");
  const root = await resolveWithinPhysicalRoot(skill, "state/evolution", "project Harness Evolution");
  if (create) await mkdir(root, { recursive: true });
  return root;
}

async function evolutionOwnerRoot(skillRoot: string, create: boolean): Promise<string> {
  const skill = await assertPhysicalDirectory(skillRoot, "project Harness Skill");
  const locks = await resolveWithinPhysicalRoot(skill, "state/registry/locks", "project Harness Registry locks");
  if (create) await mkdir(locks, { recursive: true });
  return resolveWithinPhysicalRoot(locks, "evolution-owner", "project Harness Evolution owner");
}

async function evolutionCandidateRoot(sidecarRoot: string, proposalId: string, create: boolean): Promise<string> {
  await mkdir(sidecarRoot, { recursive: true });
  const sidecar = await assertPhysicalDirectory(sidecarRoot, "project runtime sidecar");
  const parent = await resolveWithinPhysicalRoot(sidecar, `evolution/staging/${proposalId}`, "Evolution candidate staging");
  if (create) {
    if (existsSync(parent)) throw new Error(`Evolution sidecar staging already exists: ${proposalId}.`);
    await mkdir(parent, { recursive: true });
  }
  const candidate = join(parent, "candidate");
  if (create && existsSync(candidate)) throw new Error(`Evolution candidate already exists: ${proposalId}.`);
  return candidate;
}

async function resolveEvolutionCandidate(
  sidecarRoot: string,
  stage: ProjectHarnessEvolutionStageRecord,
): Promise<string> {
  const sidecar = await assertPhysicalDirectory(sidecarRoot, "project runtime sidecar");
  const expected = await evolutionCandidateRoot(sidecar, stage.proposal_id, false);
  const recorded = resolve(sidecar, stage.candidate_ref.path);
  if (recorded !== expected) throw new Error("Evolution candidate sidecar reference is invalid.");
  return assertPhysicalDirectory(recorded, "staged Evolution candidate");
}

async function recoverIncompleteEvolutionClaim(
  skillRoot: string,
  sidecarRoot: string,
  ownerRoot: string,
): Promise<void> {
  if (!existsSync(ownerRoot)) return;
  const ownerPath = join(ownerRoot, "owner.json");
  if (!existsSync(ownerPath)) {
    await rm(ownerRoot, { recursive: true, force: false });
    return;
  }
  const owner = stageSchema.parse(parseJsonText(await readFile(ownerPath, "utf8"), ownerPath));
  const stagePath = join(await evolutionRoot(skillRoot, false), "staging", `${owner.proposal_id}.json`);
  if (existsSync(stagePath)) throw new Error("Another Project Harness Evolution owner is already active.");
  const candidate = await resolveEvolutionCandidate(sidecarRoot, owner).catch(() => null);
  if (candidate) await rm(dirname(candidate), { recursive: true, force: false });
  await rm(ownerRoot, { recursive: true, force: false });
}

async function copyPhysicalTree(source: string, target: string): Promise<void> {
  await mkdir(target);
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const from = join(source, entry.name);
    const to = join(target, entry.name);
    const info = await lstat(from);
    if (info.isSymbolicLink()) throw new Error(`Evolution candidate contains a link or Junction: ${from}`);
    if (info.isDirectory()) await copyPhysicalTree(from, to);
    else if (info.isFile()) await copyFile(from, to);
    else throw new Error(`Evolution candidate contains an unsupported filesystem entry: ${from}`);
  }
}

function eligibleUnevaluatedChanges(
  changes: readonly ProjectHarnessChangeRecord[],
  evaluatedIds: readonly string[],
): ProjectHarnessChangeRecord[] {
  const evaluated = new Set(evaluatedIds);
  return changes
    .filter((change) => change.status === "completed"
      && change.validation_passed
      && change.evidence_complete
      && !evaluated.has(change.change_id))
    .sort((left, right) => left.updated_at.localeCompare(right.updated_at) || left.change_id.localeCompare(right.change_id));
}

function uniqueCanonicalIds(values: readonly string[], label: string): string[] {
  const result = values.map((value) => canonicalProjectHarnessId(value, label));
  if (new Set(result).size !== result.length) throw new Error(`${label} values must be unique.`);
  return result;
}

function uniqueSourcePaths(values: readonly string[]): string[] {
  const result = values.map((value) => {
    const normalized = value.trim().replace(/\\/g, "/");
    if (!normalized || normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)
      || normalized.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
      throw new Error(`Evolution source path must be project-relative: ${value}.`);
    }
    return normalized;
  });
  const unique = [...new Set(result)].sort();
  if (unique.length === 0) throw new Error("Evolution requires at least one project source path.");
  return unique;
}

function sanitizeTsv(value: string): string {
  const normalized = value.replace(/[\t\r\n]+/g, " ").trim();
  if (!normalized) throw new Error("Evolution result note must not be empty.");
  return normalized;
}

function hashClaimToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function readCompletedEvolutionResult(
  skillRoot: string,
  sidecarRoot: string,
  input: CompleteProjectHarnessEvolutionInput,
): Promise<ProjectHarnessEvolutionResult> {
  const proposalId = canonicalProjectHarnessId(input.proposalId, "Evolution proposal id");
  const ownerId = canonicalProjectHarnessId(input.ownerId, "Evolution owner id");
  const state = await readProjectHarnessEvolutionState(skillRoot);
  if (state.last_proposal_id !== proposalId
    || state.last_owner_id !== ownerId
    || state.last_result_status !== input.status
    || state.last_claim_token_hash !== hashClaimToken(input.claimToken)
    || !state.last_evaluated_change_ids) {
    throw new EvolutionStageNotActiveError(proposalId);
  }
  let cleanupPending = false;
  try {
    const candidate = await evolutionCandidateRoot(sidecarRoot, proposalId, false);
    if (existsSync(dirname(candidate))) await rm(dirname(candidate), { recursive: true, force: false });
  } catch {
    cleanupPending = true;
  }
  const manifest = await readProjectHarnessManifest(skillRoot);
  return {
    proposalId,
    status: state.last_result_status,
    score: state.last_score ?? null,
    revision: manifest.skill_revision,
    evaluatedChangeIds: state.last_evaluated_change_ids,
    pendingChangeIds: state.pending_change_ids,
    cleanupPending,
  };
}

class EvolutionStageNotActiveError extends Error {
  constructor(proposalId: string) {
    super(`Evolution stage is not active: ${proposalId}.`);
    this.name = "EvolutionStageNotActiveError";
  }
}
