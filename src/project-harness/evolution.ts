import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, lstat, mkdir, open, readFile, readdir, rm } from "node:fs/promises";
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
  base_revision?: number;
  base_content_fingerprint?: string;
  attempt_kind?: "initial" | "reconsideration";
  reconsidered_from_proposal_id?: string;
  reconsidered_result_fingerprint?: string;
  queued_change_ids_snapshot?: string[];
  queued_change_ids_digest?: string;
  proposal_fingerprint?: string;
  staged_at: string;
}

export interface ReconsiderProjectHarnessEvolutionInput {
  rejectedProposalId: string;
  proposalId: string;
  ownerId: string;
  e1Approved: boolean;
  reconsiderApproved: boolean;
}

export interface ReconsiderProjectHarnessEvolutionRecord {
  schema_version: "1.0";
  kind: "evolution-reconsideration-claim";
  proposal_id: string;
  owner_id: string;
  claim_token: string;
  attempt_kind: "reconsideration";
  reconsidered_from_proposal_id: string;
  reconsidered_result_fingerprint: string;
  change_ids: string[];
  queued_change_ids_snapshot: string[];
  queued_change_ids_digest: string;
  base_revision: number;
  base_content_fingerprint: string;
  proposal_fingerprint: string;
  claimed_at: string;
}

export interface ProjectHarnessEvolutionAttemptRecord {
  schema_version: "1.0";
  proposal_id: string;
  owner_id: string;
  attempt_kind: "initial" | "reconsideration";
  parent_proposal_id: string | null;
  parent_result_fingerprint: string | null;
  status: "keep" | "rejected" | "noop";
  published: boolean;
  change_ids: string[];
  queued_change_ids_snapshot: string[];
  queued_change_ids_digest: string;
  score: number | null;
  judge: unknown;
  candidate_fingerprint: string;
  candidate_content_fingerprint: string;
  source_snapshot_digest: string;
  base_revision: number;
  base_content_fingerprint: string;
  proposal_fingerprint: string;
  claim_token_hash: string;
  completed_at: string;
  result_row_fingerprint: string;
  result_fingerprint: string;
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
  base_revision: z.number().int().positive().optional(),
  base_content_fingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  attempt_kind: z.enum(["initial", "reconsideration"]).optional(),
  reconsidered_from_proposal_id: z.string().optional(),
  reconsidered_result_fingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  queued_change_ids_snapshot: z.array(z.string()).optional(),
  queued_change_ids_digest: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  proposal_fingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  staged_at: z.string(),
}).strict();

const reconsiderClaimSchema = z.object({
  schema_version: z.literal("1.0"),
  kind: z.literal("evolution-reconsideration-claim"),
  proposal_id: z.string(),
  owner_id: z.string(),
  claim_token: z.string(),
  attempt_kind: z.literal("reconsideration"),
  reconsidered_from_proposal_id: z.string(),
  reconsidered_result_fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  change_ids: z.array(z.string()).min(1),
  queued_change_ids_snapshot: z.array(z.string()),
  queued_change_ids_digest: z.string().regex(/^[a-f0-9]{64}$/),
  base_revision: z.number().int().positive(),
  base_content_fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  proposal_fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  claimed_at: z.string(),
}).strict();

const attemptSchema = z.object({
  schema_version: z.literal("1.0"),
  proposal_id: z.string(),
  owner_id: z.string(),
  attempt_kind: z.enum(["initial", "reconsideration"]),
  parent_proposal_id: z.string().nullable(),
  parent_result_fingerprint: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  status: z.enum(["keep", "rejected", "noop"]),
  published: z.boolean(),
  change_ids: z.array(z.string()).min(1),
  queued_change_ids_snapshot: z.array(z.string()),
  queued_change_ids_digest: z.string().regex(/^[a-f0-9]{64}$/),
  score: z.number().nullable(),
  judge: z.unknown(),
  candidate_fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  candidate_content_fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  source_snapshot_digest: z.string().regex(/^[a-f0-9]{64}$/),
  base_revision: z.number().int().positive(),
  base_content_fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  proposal_fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  claim_token_hash: z.string().regex(/^[a-f0-9]{64}$/),
  completed_at: z.string(),
  result_row_fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  result_fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
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
  const next = await deriveProjectHarnessEvolutionState(skillRoot);
  await writeEvolutionState(skillRoot, next);
  return next;
}

async function deriveProjectHarnessEvolutionState(skillRoot: string): Promise<ProjectHarnessEvolutionState> {
  const state = await readProjectHarnessEvolutionState(skillRoot);
  const changes = await listProjectHarnessChanges(skillRoot);
  const pending = eligibleUnevaluatedChanges(changes, state.evaluated_change_ids);
  const due = pending.length >= state.threshold;
  return {
    ...state,
    pending_change_ids: due ? pending.slice(0, state.threshold).map((change) => change.change_id) : [],
    pending: due,
  };
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

export async function reconsiderProjectHarnessEvolution(
  skillRoot: string,
  sidecarRoot: string,
  input: ReconsiderProjectHarnessEvolutionInput,
): Promise<ReconsiderProjectHarnessEvolutionRecord> {
  if (input.e1Approved !== true) throw new Error("Evolution reconsideration requires explicit E1 approval.");
  if (input.reconsiderApproved !== true) {
    throw new Error("Evolution reconsideration requires explicit reconsider approval.");
  }
  const rejectedProposalId = canonicalProjectHarnessId(input.rejectedProposalId, "Rejected Evolution proposal id");
  const proposalId = canonicalProjectHarnessId(input.proposalId, "Evolution proposal id");
  const ownerId = canonicalProjectHarnessId(input.ownerId, "Evolution owner id");
  if (proposalId === rejectedProposalId) throw new Error("Evolution reconsideration requires a fresh proposal id.");
  const manifest = await readProjectHarnessManifest(skillRoot);
  const contentFingerprint = await fingerprintProjectHarnessContent(skillRoot);

  return withProjectHarnessWriterLock(projectHarnessSharedWriterRoot(sidecarRoot), {
    projectId: manifest.project_id,
    ownerId,
    operation: "evolution-publish",
  }, async () => {
    if (await fingerprintProjectHarnessContent(skillRoot) !== contentFingerprint) {
      throw new Error("Current project Harness content changed before Evolution reconsideration.");
    }
    const state = await deriveProjectHarnessEvolutionState(skillRoot);
    if (state.last_proposal_id !== rejectedProposalId || state.last_result_status !== "rejected"
      || !state.last_owner_id || !state.last_evaluated_change_ids || state.last_evaluated_change_ids.length === 0) {
      throw new Error("Evolution reconsideration requires the latest terminal result to be the selected rejection.");
    }
    const changeIds = uniqueCanonicalIds(state.last_evaluated_change_ids, "reconsidered Evolution Change id");
    assertReconsideredWindowAlreadyEvaluated(state, changeIds);
    if (state.pending) {
      throw new Error("Evolution reconsideration cannot overlap a complete pending Evolution window.");
    }
    const queuedChangeIds = await eligibleUnevaluatedChangeIds(skillRoot, state.evaluated_change_ids);
    const proposalFingerprint = await fingerprintEvolutionProposal(skillRoot, proposalId);
    await assertFreshEvolutionJudge(skillRoot, proposalId);
    const ownerRoot = await evolutionOwnerRoot(skillRoot, true);
    const ownerPath = join(ownerRoot, "owner.json");
    if (existsSync(ownerRoot)) {
      if (existsSync(ownerPath)) {
        const existing = reconsiderClaimSchema.safeParse(parseJsonText(await readFile(ownerPath, "utf8"), ownerPath));
        if (existing.success && existing.data.proposal_id === proposalId && existing.data.owner_id === ownerId) {
          await validateExistingReconsiderClaim(skillRoot, existing.data, {
            rejectedProposalId,
            state,
            revision: manifest.skill_revision,
            contentFingerprint,
            proposalFingerprint,
          });
          return existing.data;
        }
        throw new Error("Another Project Harness Evolution owner is already active.");
      }
      await rm(ownerRoot, { recursive: true, force: false });
    }
    await assertFreshEvolutionAttemptIdentity(skillRoot, proposalId);
    const parent = await synthesizeOrReadRejectedAttempt(skillRoot, rejectedProposalId, state, manifest.skill_revision);
    if (parent.status !== "rejected" || parent.published) {
      throw new Error("Only an unpublished rejected Evolution attempt can be reconsidered.");
    }
    if (parent.change_ids.length !== changeIds.length
      || parent.change_ids.some((id, index) => id !== changeIds[index])) {
      throw new Error("Rejected Evolution attempt does not match the latest evaluated Change window.");
    }
    await mkdir(ownerRoot);
    const claim: ReconsiderProjectHarnessEvolutionRecord = {
      schema_version: "1.0",
      kind: "evolution-reconsideration-claim",
      proposal_id: proposalId,
      owner_id: ownerId,
      claim_token: randomUUID(),
      attempt_kind: "reconsideration",
      reconsidered_from_proposal_id: rejectedProposalId,
      reconsidered_result_fingerprint: parent.result_fingerprint,
      change_ids: changeIds,
      queued_change_ids_snapshot: queuedChangeIds,
      queued_change_ids_digest: digestIds(queuedChangeIds),
      base_revision: manifest.skill_revision,
      base_content_fingerprint: contentFingerprint,
      proposal_fingerprint: proposalFingerprint,
      claimed_at: new Date().toISOString(),
    };
    try {
      await writeJsonFile(ownerPath, claim);
    } catch (error) {
      await rm(ownerRoot, { recursive: true, force: true });
      throw error;
    }
    return claim;
  });
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
    const ownerRoot = await evolutionOwnerRoot(skillRoot, true);
    const ownerPath = join(ownerRoot, "owner.json");
    let reconsiderClaim: ReconsiderProjectHarnessEvolutionRecord | null = null;
    if (existsSync(ownerPath)) {
      const parsed = reconsiderClaimSchema.safeParse(parseJsonText(await readFile(ownerPath, "utf8"), ownerPath));
      if (parsed.success) reconsiderClaim = parsed.data;
    }
    if (!reconsiderClaim) await recoverIncompleteEvolutionClaim(skillRoot, sidecarRoot, ownerRoot);

    const state = await deriveProjectHarnessEvolutionState(skillRoot);
    let frozen: string[];
    if (reconsiderClaim) {
      assertReconsiderClaimForStage(reconsiderClaim, proposalId, ownerId, currentManifest.skill_revision, currentContentFingerprint);
      const proposalFingerprint = await fingerprintEvolutionProposal(skillRoot, proposalId);
      if (proposalFingerprint !== reconsiderClaim.proposal_fingerprint) {
        throw new Error("Evolution reconsideration proposal changed after claim.");
      }
      await assertFreshEvolutionJudge(skillRoot, proposalId);
      const queued = await eligibleUnevaluatedChangeIds(skillRoot, state.evaluated_change_ids);
      if (digestIds(queued) !== reconsiderClaim.queued_change_ids_digest
        || queued.length !== reconsiderClaim.queued_change_ids_snapshot.length
        || queued.some((id, index) => id !== reconsiderClaim.queued_change_ids_snapshot[index])) {
        throw new Error("Queued Evolution Changes changed after reconsideration claim.");
      }
      frozen = reconsiderClaim.change_ids;
    } else {
      if (!state.pending) throw new Error("Project Harness Evolution is not pending.");
      frozen = state.pending_change_ids.slice(0, state.threshold);
    }
    const requested = input.changeIds ? uniqueCanonicalIds(input.changeIds, "Evolution Change id") : frozen;
    if (requested.length !== frozen.length || requested.some((id, index) => id !== frozen[index])) {
      throw new Error(reconsiderClaim
        ? "Evolution reconsideration must reuse the exact rejected Change window."
        : "Evolution must freeze the first complete pending Change window in stable order.");
    }

    if (!reconsiderClaim) {
      try {
        await mkdir(ownerRoot);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") {
          throw new Error("Another Project Harness Evolution owner is already active.");
        }
        throw error;
      }
    }
    const claimToken = reconsiderClaim?.claim_token ?? randomUUID();
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
        base_revision: currentManifest.skill_revision,
        base_content_fingerprint: currentContentFingerprint,
        attempt_kind: reconsiderClaim ? "reconsideration" : "initial",
        ...(reconsiderClaim ? {
          reconsidered_from_proposal_id: reconsiderClaim.reconsidered_from_proposal_id,
          reconsidered_result_fingerprint: reconsiderClaim.reconsidered_result_fingerprint,
          queued_change_ids_snapshot: reconsiderClaim.queued_change_ids_snapshot,
          queued_change_ids_digest: reconsiderClaim.queued_change_ids_digest,
          proposal_fingerprint: reconsiderClaim.proposal_fingerprint,
        } : {}),
        staged_at: new Date().toISOString(),
      };
      await writeJsonFile(ownerPath, stage);
      const root = await evolutionRoot(skillRoot, true);
      await mkdir(join(root, "staging"), { recursive: true });
      await writeJsonFile(join(root, "staging", `${proposalId}.json`), stage);
      return stage;
    } catch (error) {
      await rm(dirname(sidecarCandidate), { recursive: true, force: true });
      if (reconsiderClaim) await writeJsonFile(ownerPath, reconsiderClaim);
      else await rm(ownerRoot, { recursive: true, force: true });
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
  await validateReconsiderationStage(skillRoot, stage);
  const judge = validateEvolutionOutcome(input, stage);
  await validateReconsiderationJudgeEvidence(skillRoot, stage, judge);
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
        `state/evolution/attempts/${stage.proposal_id}.json`,
        `state/evolution/staging/${stage.proposal_id}.json`,
        "state/registry/locks/evolution-owner",
      ],
      async commitEffect(publishedRoot) {
        await writeEvolutionTerminalState(publishedRoot, stage, input, judge);
      },
    });
    const nextState = await readProjectHarnessEvolutionState(skillRoot);
    const queuedChangeIds = await eligibleUnevaluatedChangeIds(skillRoot, nextState.evaluated_change_ids);
    result = {
      proposalId: stage.proposal_id,
      status: "keep",
      score,
      revision: currentManifest.skill_revision + 1,
      evaluatedChangeIds: stage.change_ids,
      pendingChangeIds: queuedChangeIds,
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
    const queuedChangeIds = await eligibleUnevaluatedChangeIds(skillRoot, nextState.evaluated_change_ids);
    result = {
      proposalId: stage.proposal_id,
      status: input.status,
      score,
      revision: currentManifest.skill_revision,
      evaluatedChangeIds: stage.change_ids,
      pendingChangeIds: queuedChangeIds,
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
  const isReconsideration = (stage.attempt_kind ?? "initial") === "reconsideration";
  const evaluatedBefore = uniqueCanonicalIds(state.evaluated_change_ids, "evaluated Change id");
  if (isReconsideration) assertReconsideredWindowAlreadyEvaluated(state, stage.change_ids);
  const evaluated = isReconsideration
    ? evaluatedBefore
    : mergeCanonicalIds(evaluatedBefore, stage.change_ids, "evaluated Change id");
  const eligible = eligibleUnevaluatedChanges(await listProjectHarnessChanges(skillRoot), evaluated);
  const eligibleIds = eligible.map((change) => change.change_id);
  if (isReconsideration) {
    const queued = eligibleIds;
    if (state.pending || digestIds(queued) !== stage.queued_change_ids_digest
      || queued.length !== stage.queued_change_ids_snapshot?.length
      || queued.some((id, index) => id !== stage.queued_change_ids_snapshot?.[index])) {
      throw new Error("Evolution reconsideration queued Change state changed before terminal publication.");
    }
  }
  const now = new Date().toISOString();
  const next: ProjectHarnessEvolutionState = {
    ...state,
    evaluated_change_ids: evaluated,
    pending_change_ids: eligible.length >= state.threshold ? eligibleIds.slice(0, state.threshold) : [],
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
  const attemptPath = join(root, "attempts", `${stage.proposal_id}.json`);
  const stagePath = join(root, "staging", `${stage.proposal_id}.json`);
  const ownerRoot = await evolutionOwnerRoot(skillRoot, false);
  const ownerPath = join(ownerRoot, "owner.json");
  const beforeState = existsSync(statePath) ? await readFile(statePath, "utf8") : null;
  const beforeStage = await readFile(stagePath, "utf8");
  const beforeOwner = await readFile(ownerPath, "utf8");
  if (existsSync(attemptPath)) throw new Error(`Evolution attempt already exists: ${stage.proposal_id}.`);
  const manifest = await readProjectHarnessManifest(skillRoot);
  const proposalFingerprint = stage.proposal_fingerprint
    ?? await fingerprintEvolutionProposalIfPresent(skillRoot, stage.proposal_id);
  const attempt = createAttemptRecord({
    stage,
    status: input.status,
    judge,
    queuedChangeIds: eligibleIds,
    baseRevision: stage.base_revision ?? (input.status === "keep" ? manifest.skill_revision - 1 : manifest.skill_revision),
    baseContentFingerprint: stage.base_content_fingerprint ?? stage.current_content_fingerprint,
    proposalFingerprint,
    completedAt: now,
    resultRow: row,
  });
  try {
    await atomicWriteFile(resultsPath, nextResults);
    await writeEvolutionState(skillRoot, next);
    await writeExclusiveJsonFile(attemptPath, attempt);
    await rm(stagePath, { force: true });
    await rm(ownerRoot, { recursive: true, force: false });
  } catch (error) {
    const restoreErrors: unknown[] = [];
    for (const restore of [
      () => atomicWriteFile(resultsPath, beforeResults),
      () => beforeState === null ? rm(statePath, { force: true }) : atomicWriteFile(statePath, beforeState),
      () => rm(attemptPath, { force: true }),
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

async function eligibleUnevaluatedChangeIds(
  skillRoot: string,
  evaluatedIds: readonly string[],
): Promise<string[]> {
  return eligibleUnevaluatedChanges(await listProjectHarnessChanges(skillRoot), evaluatedIds)
    .map((change) => change.change_id);
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

function mergeCanonicalIds(left: readonly string[], right: readonly string[], label: string): string[] {
  const result = uniqueCanonicalIds(left, label);
  const seen = new Set(result);
  for (const value of uniqueCanonicalIds(right, label)) {
    if (!seen.has(value)) {
      result.push(value);
      seen.add(value);
    }
  }
  return result;
}

function digestIds(ids: readonly string[]): string {
  return createHash("sha256").update(JSON.stringify(ids)).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashCanonical(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function attemptFingerprint(attempt: Omit<ProjectHarnessEvolutionAttemptRecord, "result_fingerprint">): string {
  return hashCanonical(attempt);
}

function createAttemptRecord(input: {
  stage: ProjectHarnessEvolutionStageRecord;
  status: "keep" | "rejected" | "noop";
  judge: EvolutionCandidateJudge | null;
  queuedChangeIds: string[];
  baseRevision: number;
  baseContentFingerprint: string;
  proposalFingerprint: string;
  completedAt: string;
  resultRow: string;
}): ProjectHarnessEvolutionAttemptRecord {
  const record: Omit<ProjectHarnessEvolutionAttemptRecord, "result_fingerprint"> = {
    schema_version: "1.0",
    proposal_id: input.stage.proposal_id,
    owner_id: input.stage.owner_id,
    attempt_kind: input.stage.attempt_kind ?? "initial",
    parent_proposal_id: input.stage.reconsidered_from_proposal_id ?? null,
    parent_result_fingerprint: input.stage.reconsidered_result_fingerprint ?? null,
    status: input.status,
    published: input.status === "keep",
    change_ids: input.stage.change_ids,
    queued_change_ids_snapshot: input.queuedChangeIds,
    queued_change_ids_digest: digestIds(input.queuedChangeIds),
    score: input.judge?.score ?? null,
    judge: input.judge ?? { judge_unavailable: true },
    candidate_fingerprint: input.stage.candidate_fingerprint,
    candidate_content_fingerprint: input.stage.candidate_fingerprint,
    source_snapshot_digest: input.stage.source_snapshot_digest,
    base_revision: input.baseRevision,
    base_content_fingerprint: input.baseContentFingerprint,
    proposal_fingerprint: input.proposalFingerprint,
    claim_token_hash: hashClaimToken(input.stage.claim_token),
    completed_at: input.completedAt,
    result_row_fingerprint: createHash("sha256").update(input.resultRow).digest("hex"),
  };
  return { ...record, result_fingerprint: attemptFingerprint(record) };
}

async function writeExclusiveJsonFile(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const handle = await open(path, "wx");
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  } finally {
    await handle.close();
  }
}

async function readEvolutionAttempt(
  skillRoot: string,
  proposalId: string,
): Promise<ProjectHarnessEvolutionAttemptRecord | null> {
  const path = join(await evolutionRoot(skillRoot, false), "attempts", `${proposalId}.json`);
  if (!existsSync(path)) return null;
  const attempt = attemptSchema.parse(
    parseJsonText(await readFile(path, "utf8"), path),
  ) as ProjectHarnessEvolutionAttemptRecord;
  const { result_fingerprint: recorded, ...body } = attempt;
  if (attemptFingerprint(body) !== recorded) throw new Error(`Evolution attempt fingerprint drifted: ${proposalId}.`);
  if (attempt.candidate_content_fingerprint !== attempt.candidate_fingerprint) {
    throw new Error(`Evolution attempt candidate content binding is inconsistent: ${proposalId}.`);
  }
  if (digestIds(attempt.queued_change_ids_snapshot) !== attempt.queued_change_ids_digest) {
    throw new Error(`Evolution attempt queued Change binding is inconsistent: ${proposalId}.`);
  }
  if (attempt.published !== (attempt.status === "keep")) {
    throw new Error(`Evolution attempt publication state is inconsistent: ${proposalId}.`);
  }
  if ((attempt.attempt_kind === "initial" && (attempt.parent_proposal_id !== null
      || attempt.parent_result_fingerprint !== null))
    || (attempt.attempt_kind === "reconsideration" && (!attempt.parent_proposal_id
      || !attempt.parent_result_fingerprint))) {
    throw new Error(`Evolution attempt lineage is inconsistent: ${proposalId}.`);
  }
  const resultsPath = join(await evolutionRoot(skillRoot, false), "results.tsv");
  const rows = existsSync(resultsPath)
    ? (await readFile(resultsPath, "utf8")).split(/\r?\n/).filter((line) => line.trim() && line.split("\t")[1] === proposalId)
    : [];
  if (rows.length !== 1
    || createHash("sha256").update(rows[0]).digest("hex") !== attempt.result_row_fingerprint) {
    throw new Error(`Evolution attempt results ledger drifted: ${proposalId}.`);
  }
  return attempt;
}

async function fingerprintEvolutionProposal(skillRoot: string, proposalId: string): Promise<string> {
  const path = join(await evolutionRoot(skillRoot, false), "proposals", `${proposalId}.md`);
  if (!existsSync(path)) throw new Error(`Evolution proposal does not exist: ${proposalId}.`);
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function fingerprintEvolutionProposalIfPresent(skillRoot: string, proposalId: string): Promise<string> {
  const path = join(await evolutionRoot(skillRoot, false), "proposals", `${proposalId}.md`);
  if (!existsSync(path)) return createHash("sha256").update(`legacy-missing-proposal:${proposalId}`).digest("hex");
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function assertFreshEvolutionJudge(skillRoot: string, proposalId: string): Promise<void> {
  const path = join(await evolutionRoot(skillRoot, false), "proposals", `${proposalId}-judge.json`);
  if (existsSync(path)) throw new Error("Evolution reconsideration requires a fresh independent Judge report.");
}

async function assertFreshEvolutionAttemptIdentity(skillRoot: string, proposalId: string): Promise<void> {
  const root = await evolutionRoot(skillRoot, false);
  if (existsSync(join(root, "attempts", `${proposalId}.json`))
    || existsSync(join(root, "staging", `${proposalId}.json`))) {
    throw new Error("Evolution reconsideration requires a fresh candidate and attempt id.");
  }
  const resultsPath = join(root, "results.tsv");
  if (existsSync(resultsPath)) {
    const reused = (await readFile(resultsPath, "utf8")).split(/\r?\n/)
      .some((line) => line.trim() && line.split("\t")[1] === proposalId);
    if (reused) throw new Error("Evolution reconsideration requires a fresh candidate and attempt id.");
  }
}

function judgeFingerprintField(judge: unknown, ...keys: string[]): string {
  if (judge === null || typeof judge !== "object") throw new Error("Rejected Evolution Judge evidence is invalid.");
  for (const key of keys) {
    const value = (judge as Record<string, unknown>)[key];
    if (typeof value === "string" && /^[a-f0-9]{64}$/.test(value)) return value;
  }
  throw new Error(`Rejected Evolution Judge is missing ${keys.join(" or ")}.`);
}

async function synthesizeOrReadRejectedAttempt(
  skillRoot: string,
  proposalId: string,
  state: ProjectHarnessEvolutionState,
  revision: number,
): Promise<ProjectHarnessEvolutionAttemptRecord> {
  const existing = await readEvolutionAttempt(skillRoot, proposalId);
  if (existing) {
    if (await fingerprintEvolutionProposal(skillRoot, proposalId) !== existing.proposal_fingerprint) {
      throw new Error("Rejected Evolution proposal evidence drifted.");
    }
    const existingJudgePath = join(await evolutionRoot(skillRoot, false), "proposals", `${proposalId}-judge.json`);
    if (!existsSync(existingJudgePath)) throw new Error("Rejected Evolution Judge evidence does not exist.");
    const existingJudge = parseJsonText(await readFile(existingJudgePath, "utf8"), existingJudgePath);
    if (canonicalJson(existingJudge) !== canonicalJson(existing.judge)) {
      throw new Error("Rejected Evolution Judge evidence drifted.");
    }
    const currentContentFingerprint = await fingerprintProjectHarnessContent(skillRoot);
    const currentQueued = await eligibleUnevaluatedChangeIds(skillRoot, state.evaluated_change_ids);
    if (existing.owner_id !== state.last_owner_id
      || existing.completed_at !== state.last_completed_at
      || existing.score !== state.last_score
      || existing.base_revision !== revision
      || existing.base_content_fingerprint !== currentContentFingerprint
      || existing.change_ids.length !== state.last_evaluated_change_ids?.length
      || existing.change_ids.some((id, index) => id !== state.last_evaluated_change_ids?.[index])
      || existing.queued_change_ids_digest !== digestIds(currentQueued)
      || existing.queued_change_ids_snapshot.length !== currentQueued.length
      || existing.queued_change_ids_snapshot.some((id, index) => id !== currentQueued[index])) {
      throw new Error("Rejected Evolution attempt differs from the latest terminal state or current base.");
    }
    return existing;
  }
  const root = await evolutionRoot(skillRoot, false);
  const resultsPath = join(root, "results.tsv");
  if (!existsSync(resultsPath)) throw new Error("Rejected Evolution results ledger does not exist.");
  const rows = (await readFile(resultsPath, "utf8")).split(/\r?\n/)
    .filter((line) => line.trim() && line.split("\t")[1] === proposalId);
  if (rows.length !== 1) throw new Error("Rejected Evolution must have exactly one results ledger row.");
  const columns = rows[0].split("\t");
  if (columns.length !== 7 || columns[4] !== "rejected") {
    throw new Error("Selected Evolution result is not a valid rejection.");
  }
  const changeIds = uniqueCanonicalIds(columns[2].split(","), "rejected Evolution Change id");
  const score = Number(columns[3]);
  if (state.last_proposal_id !== proposalId || state.last_result_status !== "rejected"
    || state.last_score !== score || !state.last_owner_id || !state.last_completed_at
    || !state.last_evaluated_change_ids
    || changeIds.length !== state.last_evaluated_change_ids.length
    || changeIds.some((id, index) => id !== state.last_evaluated_change_ids?.[index])) {
    throw new Error("Rejected Evolution ledger and terminal state differ.");
  }
  const judgePath = join(root, "proposals", `${proposalId}-judge.json`);
  if (!existsSync(judgePath)) throw new Error("Rejected Evolution Judge evidence does not exist.");
  const judge = parseJsonText(await readFile(judgePath, "utf8"), judgePath);
  if (canonicalJson(judge) !== canonicalJson(state.last_judge_report)) {
    throw new Error("Rejected Evolution Judge evidence differs from terminal state.");
  }
  const queued = await eligibleUnevaluatedChangeIds(skillRoot, state.evaluated_change_ids);
  const body: Omit<ProjectHarnessEvolutionAttemptRecord, "result_fingerprint"> = {
    schema_version: "1.0",
    proposal_id: proposalId,
    owner_id: state.last_owner_id,
    attempt_kind: "initial",
    parent_proposal_id: null,
    parent_result_fingerprint: null,
    status: "rejected",
    published: false,
    change_ids: changeIds,
    queued_change_ids_snapshot: queued,
    queued_change_ids_digest: digestIds(queued),
    score,
    judge,
    candidate_fingerprint: judgeFingerprintField(judge, "candidate_fingerprint", "reviewed_candidate_content_fingerprint"),
    candidate_content_fingerprint: judgeFingerprintField(
      judge,
      "candidate_fingerprint",
      "reviewed_candidate_content_fingerprint",
    ),
    source_snapshot_digest: judgeFingerprintField(judge, "source_snapshot_digest"),
    base_revision: revision,
    base_content_fingerprint: await fingerprintProjectHarnessContent(skillRoot),
    proposal_fingerprint: await fingerprintEvolutionProposal(skillRoot, proposalId),
    claim_token_hash: state.last_claim_token_hash
      ?? hashCanonical({ kind: "legacy-evolution-claim", proposal_id: proposalId, row: rows[0] }),
    completed_at: state.last_completed_at,
    result_row_fingerprint: createHash("sha256").update(rows[0]).digest("hex"),
  };
  const attempt = { ...body, result_fingerprint: attemptFingerprint(body) };
  await writeExclusiveJsonFile(join(root, "attempts", `${proposalId}.json`), attempt);
  return attempt;
}

function assertReconsiderClaimForStage(
  claim: ReconsiderProjectHarnessEvolutionRecord,
  proposalId: string,
  ownerId: string,
  revision: number,
  contentFingerprint: string,
): void {
  if (claim.proposal_id !== proposalId || claim.owner_id !== ownerId) {
    throw new Error("Evolution stage is not owned by the active reconsideration claim.");
  }
  if (claim.base_revision !== revision || claim.base_content_fingerprint !== contentFingerprint) {
    throw new Error("Evolution reconsideration base changed before staging.");
  }
}

async function validateExistingReconsiderClaim(
  skillRoot: string,
  claim: ReconsiderProjectHarnessEvolutionRecord,
  expected: {
    rejectedProposalId: string;
    state: ProjectHarnessEvolutionState;
    revision: number;
    contentFingerprint: string;
    proposalFingerprint: string;
  },
): Promise<void> {
  if (!claim.claim_token.trim()) throw new Error("Evolution reconsideration claim token is invalid.");
  if (claim.reconsidered_from_proposal_id !== expected.rejectedProposalId) {
    throw new Error("Evolution reconsideration parent proposal changed after claim.");
  }
  if (claim.base_revision !== expected.revision
    || claim.base_content_fingerprint !== expected.contentFingerprint
    || claim.proposal_fingerprint !== expected.proposalFingerprint) {
    throw new Error("Evolution reconsideration base or proposal changed after claim.");
  }
  assertReconsideredWindowAlreadyEvaluated(expected.state, claim.change_ids);
  if (expected.state.pending) {
    throw new Error("Evolution reconsideration cannot overlap a complete pending Evolution window.");
  }
  const parent = await synthesizeOrReadRejectedAttempt(
    skillRoot,
    expected.rejectedProposalId,
    expected.state,
    expected.revision,
  );
  if (claim.reconsidered_result_fingerprint !== parent.result_fingerprint
    || claim.change_ids.length !== parent.change_ids.length
    || claim.change_ids.some((id, index) => id !== parent.change_ids[index])) {
    throw new Error("Evolution reconsideration parent attempt changed after claim.");
  }
  const queued = await eligibleUnevaluatedChangeIds(skillRoot, expected.state.evaluated_change_ids);
  if (digestIds(queued) !== claim.queued_change_ids_digest
    || queued.length !== claim.queued_change_ids_snapshot.length
    || queued.some((id, index) => id !== claim.queued_change_ids_snapshot[index])) {
    throw new Error("Queued Evolution Changes changed after reconsideration claim.");
  }
}

async function validateReconsiderationStage(
  skillRoot: string,
  stage: ProjectHarnessEvolutionStageRecord,
): Promise<void> {
  if ((stage.attempt_kind ?? "initial") !== "reconsideration") return;
  if (!stage.reconsidered_from_proposal_id || !stage.reconsidered_result_fingerprint
    || !stage.queued_change_ids_snapshot || !stage.queued_change_ids_digest || !stage.proposal_fingerprint
    || !stage.base_revision || !stage.base_content_fingerprint) {
    throw new Error("Evolution reconsideration stage lineage is incomplete.");
  }
  const parent = await readEvolutionAttempt(skillRoot, stage.reconsidered_from_proposal_id);
  if (!parent || parent.status !== "rejected" || parent.published
    || parent.result_fingerprint !== stage.reconsidered_result_fingerprint) {
    throw new Error("Evolution reconsideration parent attempt changed after staging.");
  }
  if (await fingerprintEvolutionProposal(skillRoot, stage.proposal_id) !== stage.proposal_fingerprint) {
    throw new Error("Evolution reconsideration proposal changed after staging.");
  }
  const state = await readProjectHarnessEvolutionState(skillRoot);
  if (state.pending) {
    throw new Error("Evolution reconsideration cannot overlap a complete pending Evolution window.");
  }
  const queued = eligibleUnevaluatedChanges(await listProjectHarnessChanges(skillRoot), state.evaluated_change_ids)
    .map((change) => change.change_id);
  if (digestIds(queued) !== stage.queued_change_ids_digest
    || queued.length !== stage.queued_change_ids_snapshot.length
    || queued.some((id, index) => id !== stage.queued_change_ids_snapshot?.[index])) {
    throw new Error("Queued Evolution Changes changed during reconsideration.");
  }
  const manifest = await readProjectHarnessManifest(skillRoot);
  if (manifest.skill_revision !== stage.base_revision
    || await fingerprintProjectHarnessContent(skillRoot) !== stage.base_content_fingerprint) {
    throw new Error("Evolution reconsideration base changed during review.");
  }
}

function assertReconsideredWindowAlreadyEvaluated(
  state: ProjectHarnessEvolutionState,
  changeIds: readonly string[],
): void {
  const evaluated = new Set(uniqueCanonicalIds(state.evaluated_change_ids, "evaluated Change id"));
  const reconsidered = uniqueCanonicalIds(changeIds, "reconsidered Evolution Change id");
  if (reconsidered.some((changeId) => !evaluated.has(changeId))) {
    throw new Error("Reconsidered Evolution Change ids must already exist in the evaluated Change set.");
  }
}

async function validateReconsiderationJudgeEvidence(
  skillRoot: string,
  stage: ProjectHarnessEvolutionStageRecord,
  judge: EvolutionCandidateJudge | null,
): Promise<void> {
  if ((stage.attempt_kind ?? "initial") !== "reconsideration") return;
  if (!judge) throw new Error("Evolution reconsideration requires a fresh independent Judge report.");
  const path = join(await evolutionRoot(skillRoot, false), "proposals", `${stage.proposal_id}-judge.json`);
  if (!existsSync(path)) throw new Error("Evolution reconsideration Judge evidence does not exist.");
  const persisted = parseJsonText(await readFile(path, "utf8"), path);
  if (canonicalJson(persisted) !== canonicalJson(judge)) {
    throw new Error("Evolution reconsideration Judge evidence does not match the terminal request.");
  }
}

async function readCompletedEvolutionResult(
  skillRoot: string,
  sidecarRoot: string,
  input: CompleteProjectHarnessEvolutionInput,
): Promise<ProjectHarnessEvolutionResult> {
  const proposalId = canonicalProjectHarnessId(input.proposalId, "Evolution proposal id");
  const ownerId = canonicalProjectHarnessId(input.ownerId, "Evolution owner id");
  const attempt = await readEvolutionAttempt(skillRoot, proposalId);
  if (attempt) {
    if (attempt.owner_id !== ownerId || attempt.status !== input.status
      || attempt.claim_token_hash !== hashClaimToken(input.claimToken)) {
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
      status: attempt.status,
      score: attempt.score,
      revision: manifest.skill_revision,
      evaluatedChangeIds: attempt.change_ids,
      pendingChangeIds: attempt.queued_change_ids_snapshot,
      cleanupPending,
    };
  }
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
    pendingChangeIds: await eligibleUnevaluatedChangeIds(skillRoot, state.evaluated_change_ids),
    cleanupPending,
  };
}

class EvolutionStageNotActiveError extends Error {
  constructor(proposalId: string) {
    super(`Evolution stage is not active: ${proposalId}.`);
    this.name = "EvolutionStageNotActiveError";
  }
}
