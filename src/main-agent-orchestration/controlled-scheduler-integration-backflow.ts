import {
  readLatestSchedulerIntegrationCandidateStrict,
  readLatestSchedulerIntegrationCheckHandoffStrict,
  readLatestSchedulerIntegrationOutcomeStrict,
  readLatestSchedulerRunBlockedCloseoutStrict,
  readLatestSchedulerRunCompletionStrict,
  schedulerIntegrationCandidateArtifactRefs,
  schedulerIntegrationCheckHandoffArtifactRefs,
  schedulerIntegrationOutcomeArtifactRefs,
  schedulerRunBlockedCloseoutArtifactRefs,
  schedulerRunCompletionArtifactRefs,
} from "../scheduler-runtime/repository.js";
import type {
  SchedulerIntegrationCandidate,
  SchedulerIntegrationCheckHandoff,
  SchedulerIntegrationOutcome,
  SchedulerRunBlockedCloseout,
  SchedulerRunCompletion,
} from "../scheduler-runtime/types.js";
import { readIntegrationCheck } from "../integration-check/repository.js";
import type { IntegrationCheckRecord, IntegrationCheckStatus, IntegrationCheckTarget } from "../integration-check/types.js";
import type { ManagedProject, ResolvedMemory } from "../types/index.js";
import type { MainAgentReplayEvidenceHealthStatus } from "./workflowgraph-replay.js";

export interface MainAgentControlledSchedulerIntegrationBackflowHealth {
  source: "controlled-scheduler-integration";
  status: MainAgentReplayEvidenceHealthStatus;
  count: number;
  reasons: string[];
  paths: string[];
  issues?: Array<{ status: MainAgentReplayEvidenceHealthStatus; reason: string }>;
}

export interface MainAgentControlledSchedulerIntegrationBackflowSummary {
  version: "1.0";
  authority: "read-only-main-agent-controlled-scheduler-integration-backflow";
  executionStarted: false;
  changeId: string;
  projectId: string | null;
  schedulerRunId: string | null;
  candidate: {
    id: string;
    status: SchedulerIntegrationCandidate["status"];
    readyWorktreeIds: string[];
    readyCount: number;
    blockedCount: number;
  } | null;
  handoff: {
    id: string;
    status: SchedulerIntegrationCheckHandoff["status"];
    schedulerIntegrationCandidateId: string;
    integrationCheckId: string;
    integrationCheckStatus: string;
    readyWorktreeIds: string[];
    resultTargetWorktreeIds: string[];
  } | null;
  integrationCheck: {
    id: string;
    status: IntegrationCheckStatus;
    resultTargetWorktreeIds: string[];
    latestArtifactHash: string | null;
    latestArtifactRef: string | null;
  } | null;
  outcome: {
    id: string;
    status: SchedulerIntegrationOutcome["status"];
    schedulerIntegrationCandidateId: string;
    schedulerIntegrationCheckHandoffId: string;
    integrationCheckId: string;
    integrationCheckStatus: string;
    readyWorktreeIds: string[];
    resultTargetWorktreeIds: string[];
    latestArtifactHash: string | null;
    latestArtifactRef: string | null;
  } | null;
  completion: {
    id: string;
    status: SchedulerRunCompletion["status"];
    schedulerIntegrationCandidateId: string;
    schedulerIntegrationCheckHandoffId: string;
    schedulerIntegrationOutcomeId: string;
    integrationCheckId: string;
    integrationCheckStatus: string;
    outcomeStatus: SchedulerRunCompletion["outcomeStatus"];
    readyWorktreeIds: string[];
    resultTargetWorktreeIds: string[];
  } | null;
  blockedCloseout: {
    id: string;
    status: SchedulerRunBlockedCloseout["status"];
    reason: SchedulerRunBlockedCloseout["reason"];
    schedulerIntegrationCandidateId: string;
    readyWorktreeIds: string[];
    readyCount: number;
    blockedCount: number;
  } | null;
  health: MainAgentControlledSchedulerIntegrationBackflowHealth;
  artifactRefs: string[];
}

export async function buildMainAgentControlledSchedulerIntegrationBackflow(input: {
  memory: ResolvedMemory;
  project: ManagedProject;
  changeId: string;
  changePath?: string | null;
  schedulerRunId?: string | null;
}): Promise<MainAgentControlledSchedulerIntegrationBackflowSummary> {
  const schedulerRunId = normalize(input.schedulerRunId);
  const health: MainAgentControlledSchedulerIntegrationBackflowHealth = {
    source: "controlled-scheduler-integration",
    status: "available",
    count: 0,
    reasons: [],
    paths: [],
    issues: [],
  };
  if (!input.changePath) {
    markHealth(health, "missing", "Active Change path is unavailable; controlled Scheduler integration backflow cannot be read.");
    return emptyMainAgentControlledSchedulerIntegrationBackflow(input, schedulerRunId, health);
  }
  if (!schedulerRunId) {
    markHealth(health, "missing", "SchedulerRun id is unavailable; controlled Scheduler integration backflow cannot be scoped.");
    return emptyMainAgentControlledSchedulerIntegrationBackflow(input, schedulerRunId, health);
  }

  const candidate = await readLatestSchedulerIntegrationCandidateForBackflow(input.memory, input.changePath, input.changeId, schedulerRunId, health);
  const handoff = await readLatestSchedulerIntegrationCheckHandoffForBackflow(input.memory, input.changePath, input.changeId, schedulerRunId, health);
  const outcome = await readLatestSchedulerIntegrationOutcomeForBackflow(input.memory, input.changePath, input.changeId, schedulerRunId, health);
  const completion = await readLatestSchedulerRunCompletionForBackflow(input.memory, input.changePath, input.changeId, schedulerRunId, health);
  const blockedCloseout = await readLatestSchedulerRunBlockedCloseoutForBackflow(input.memory, input.changePath, input.changeId, schedulerRunId, health);
  const integrationCheckId = handoff?.integrationCheckId ?? outcome?.integrationCheckId ?? completion?.integrationCheckId ?? null;
  const integrationCheck = integrationCheckId
    ? await readIntegrationCheckForBackflow(input.memory, integrationCheckId, input.changeId, health)
    : null;

  validateLineage({
    changeId: input.changeId,
    schedulerRunId,
    candidate,
    handoff,
    integrationCheck,
    outcome,
    completion,
    blockedCloseout,
    health,
  });

  const artifactRefs = dedupeStrings([
    ...(candidate ? Object.values(schedulerIntegrationCandidateArtifactRefs(input.memory, input.changePath, schedulerRunId, candidate.id)) : []),
    ...(handoff ? Object.values(schedulerIntegrationCheckHandoffArtifactRefs(input.memory, input.changePath, schedulerRunId, handoff.id)) : []),
    ...(outcome ? Object.values(schedulerIntegrationOutcomeArtifactRefs(input.memory, input.changePath, schedulerRunId, outcome.id)) : []),
    ...(completion ? Object.values(schedulerRunCompletionArtifactRefs(input.memory, input.changePath, schedulerRunId, completion.id)) : []),
    ...(blockedCloseout ? Object.values(schedulerRunBlockedCloseoutArtifactRefs(input.memory, input.changePath, schedulerRunId, blockedCloseout.id)) : []),
    ...(integrationCheck?.artifactRefs ?? []),
  ]);
  health.count = [candidate, handoff, integrationCheck, outcome, completion, blockedCloseout].filter(Boolean).length;
  if (health.count === 0 && health.status === "available") {
    markHealth(health, "missing", "No controlled Scheduler integration terminal evidence exists yet.");
  }

  return {
    version: "1.0",
    authority: "read-only-main-agent-controlled-scheduler-integration-backflow",
    executionStarted: false,
    changeId: input.changeId,
    projectId: input.project.id,
    schedulerRunId,
    candidate: candidate ? summarizeCandidate(candidate) : null,
    handoff: handoff ? summarizeHandoff(handoff) : null,
    integrationCheck: integrationCheck ? summarizeIntegrationCheck(integrationCheck) : null,
    outcome: outcome ? summarizeOutcome(outcome) : null,
    completion: completion ? summarizeCompletion(completion) : null,
    blockedCloseout: blockedCloseout ? summarizeBlockedCloseout(blockedCloseout) : null,
    health,
    artifactRefs,
  };
}

export function emptyMainAgentControlledSchedulerIntegrationBackflow(
  input: { project: ManagedProject; changeId: string },
  schedulerRunId: string | null,
  health?: MainAgentControlledSchedulerIntegrationBackflowHealth,
): MainAgentControlledSchedulerIntegrationBackflowSummary {
  return {
    version: "1.0",
    authority: "read-only-main-agent-controlled-scheduler-integration-backflow",
    executionStarted: false,
    changeId: input.changeId,
    projectId: input.project.id,
    schedulerRunId,
    candidate: null,
    handoff: null,
    integrationCheck: null,
    outcome: null,
    completion: null,
    blockedCloseout: null,
    health: health ?? {
      source: "controlled-scheduler-integration",
      status: "missing",
      count: 0,
      reasons: ["Controlled Scheduler integration backflow was not attempted."],
      paths: [],
    },
    artifactRefs: [],
  };
}

async function readLatestSchedulerIntegrationCandidateForBackflow(
  memory: ResolvedMemory,
  changePath: string,
  changeId: string,
  schedulerRunId: string,
  health: MainAgentControlledSchedulerIntegrationBackflowHealth,
): Promise<SchedulerIntegrationCandidate | null> {
  try {
    const candidate = await readLatestSchedulerIntegrationCandidateStrict(memory, changePath, schedulerRunId);
    if (candidate) validateSchedulerScope(candidate, changeId, schedulerRunId, health, `SchedulerIntegrationCandidate ${candidate.id}`);
    return candidate;
  } catch (error) {
    markHealth(health, classifyReadError(error), `SchedulerIntegrationCandidate could not be read: ${errorMessage(error)}.`);
    return null;
  }
}

async function readLatestSchedulerIntegrationCheckHandoffForBackflow(
  memory: ResolvedMemory,
  changePath: string,
  changeId: string,
  schedulerRunId: string,
  health: MainAgentControlledSchedulerIntegrationBackflowHealth,
): Promise<SchedulerIntegrationCheckHandoff | null> {
  try {
    const handoff = await readLatestSchedulerIntegrationCheckHandoffStrict(memory, changePath, schedulerRunId);
    if (handoff) validateSchedulerScope(handoff, changeId, schedulerRunId, health, `SchedulerIntegrationCheckHandoff ${handoff.id}`);
    return handoff;
  } catch (error) {
    markHealth(health, classifyReadError(error), `SchedulerIntegrationCheckHandoff could not be read: ${errorMessage(error)}.`);
    return null;
  }
}

async function readLatestSchedulerIntegrationOutcomeForBackflow(
  memory: ResolvedMemory,
  changePath: string,
  changeId: string,
  schedulerRunId: string,
  health: MainAgentControlledSchedulerIntegrationBackflowHealth,
): Promise<SchedulerIntegrationOutcome | null> {
  try {
    const outcome = await readLatestSchedulerIntegrationOutcomeStrict(memory, changePath, schedulerRunId);
    if (outcome) validateSchedulerScope(outcome, changeId, schedulerRunId, health, `SchedulerIntegrationOutcome ${outcome.id}`);
    return outcome;
  } catch (error) {
    markHealth(health, classifyReadError(error), `SchedulerIntegrationOutcome could not be read: ${errorMessage(error)}.`);
    return null;
  }
}

async function readLatestSchedulerRunCompletionForBackflow(
  memory: ResolvedMemory,
  changePath: string,
  changeId: string,
  schedulerRunId: string,
  health: MainAgentControlledSchedulerIntegrationBackflowHealth,
): Promise<SchedulerRunCompletion | null> {
  try {
    const completion = await readLatestSchedulerRunCompletionStrict(memory, changePath, schedulerRunId);
    if (completion) validateSchedulerScope(completion, changeId, schedulerRunId, health, `SchedulerRunCompletion ${completion.id}`);
    return completion;
  } catch (error) {
    markHealth(health, classifyReadError(error), `SchedulerRunCompletion could not be read: ${errorMessage(error)}.`);
    return null;
  }
}

async function readLatestSchedulerRunBlockedCloseoutForBackflow(
  memory: ResolvedMemory,
  changePath: string,
  changeId: string,
  schedulerRunId: string,
  health: MainAgentControlledSchedulerIntegrationBackflowHealth,
): Promise<SchedulerRunBlockedCloseout | null> {
  try {
    const closeout = await readLatestSchedulerRunBlockedCloseoutStrict(memory, changePath, schedulerRunId);
    if (closeout) validateSchedulerScope(closeout, changeId, schedulerRunId, health, `SchedulerRunBlockedCloseout ${closeout.id}`);
    return closeout;
  } catch (error) {
    markHealth(health, classifyReadError(error), `SchedulerRunBlockedCloseout could not be read: ${errorMessage(error)}.`);
    return null;
  }
}

async function readIntegrationCheckForBackflow(
  memory: ResolvedMemory,
  integrationCheckId: string,
  changeId: string,
  health: MainAgentControlledSchedulerIntegrationBackflowHealth,
): Promise<IntegrationCheckRecord | null> {
  try {
    const check = await readIntegrationCheck(memory, integrationCheckId);
    if (check.id !== integrationCheckId) {
      markHealth(health, "scope-mismatch", `IntegrationCheck ${check.id} does not match expected ${integrationCheckId}.`);
    }
    for (const target of check.resultTargets) {
      if (target.changeId !== changeId) {
        markHealth(health, "scope-mismatch", `IntegrationCheck ${check.id} target ${target.worktreeId} belongs to Change ${target.changeId} instead of ${changeId}.`);
      }
    }
    return check;
  } catch (error) {
    markHealth(health, "stale", `IntegrationCheck ${integrationCheckId} is referenced by Scheduler integration evidence but could not be read: ${errorMessage(error)}.`);
    return null;
  }
}

function validateLineage(input: {
  changeId: string;
  schedulerRunId: string;
  candidate: SchedulerIntegrationCandidate | null;
  handoff: SchedulerIntegrationCheckHandoff | null;
  integrationCheck: IntegrationCheckRecord | null;
  outcome: SchedulerIntegrationOutcome | null;
  completion: SchedulerRunCompletion | null;
  blockedCloseout: SchedulerRunBlockedCloseout | null;
  health: MainAgentControlledSchedulerIntegrationBackflowHealth;
}): void {
  const { candidate, handoff, integrationCheck, outcome, completion, blockedCloseout, health } = input;
  if (handoff && !candidate) {
    markHealth(health, "stale", `SchedulerIntegrationCheckHandoff ${handoff.id} exists without readable latest SchedulerIntegrationCandidate ${handoff.schedulerIntegrationCandidateId}.`);
  }
  if (outcome && !handoff) {
    markHealth(health, "stale", `SchedulerIntegrationOutcome ${outcome.id} exists without readable latest SchedulerIntegrationCheckHandoff ${outcome.schedulerIntegrationCheckHandoffId}.`);
  }
  if (completion && !outcome) {
    markHealth(health, "stale", `SchedulerRunCompletion ${completion.id} exists without readable latest SchedulerIntegrationOutcome ${completion.schedulerIntegrationOutcomeId}.`);
  }
  if (blockedCloseout && (handoff || outcome || completion)) {
    markHealth(health, "scope-mismatch", `SchedulerRunBlockedCloseout ${blockedCloseout.id} conflicts with IntegrationCheck handoff/outcome/completion evidence.`);
  }
  if (candidate && handoff) {
    if (handoff.schedulerIntegrationCandidateId !== candidate.id) {
      markHealth(health, "scope-mismatch", `Handoff ${handoff.id} points to candidate ${handoff.schedulerIntegrationCandidateId} instead of latest candidate ${candidate.id}.`);
    }
    validateReadyTargets(candidate.readyTargets, handoff.readyTargets, health, `Handoff ${handoff.id}`);
    validateWorktreeSet(candidate.readyWorktreeIds, handoff.readyWorktreeIds, health, `Handoff ${handoff.id} ready worktree ids`);
    validateSourceArtifactHashes(candidate.sourceArtifactHashes, handoff.sourceArtifactHashes, health, `Handoff ${handoff.id}`);
  }
  if (handoff && integrationCheck) {
    if (handoff.integrationCheckId !== integrationCheck.id) {
      markHealth(health, "scope-mismatch", `Handoff ${handoff.id} points to IntegrationCheck ${handoff.integrationCheckId} but read ${integrationCheck.id}.`);
    }
    if (handoff.integrationCheckStatus !== integrationCheck.status && !outcome) {
      markHealth(health, "stale", `Handoff ${handoff.id} recorded IntegrationCheck status ${handoff.integrationCheckStatus} but current status is ${integrationCheck.status}.`);
    }
    validateWorktreeSet(handoff.resultTargetWorktreeIds, integrationCheck.resultTargets.map((target) => target.worktreeId), health, `Handoff ${handoff.id} result target ids`);
    validateIntegrationTargets(handoff.readyTargets, integrationCheck.resultTargets, health, `Handoff ${handoff.id}`);
  }
  if (outcome && candidate) {
    if (outcome.schedulerIntegrationCandidateId !== candidate.id) {
      markHealth(health, "scope-mismatch", `Outcome ${outcome.id} points to candidate ${outcome.schedulerIntegrationCandidateId} instead of latest candidate ${candidate.id}.`);
    }
    validateSourceArtifactHashes(candidate.sourceArtifactHashes, outcome.sourceArtifactHashes, health, `Outcome ${outcome.id}`);
  }
  if (outcome && handoff) {
    if (outcome.schedulerIntegrationCheckHandoffId !== handoff.id) {
      markHealth(health, "scope-mismatch", `Outcome ${outcome.id} points to handoff ${outcome.schedulerIntegrationCheckHandoffId} instead of latest handoff ${handoff.id}.`);
    }
    if (outcome.integrationCheckId !== handoff.integrationCheckId) {
      markHealth(health, "scope-mismatch", `Outcome ${outcome.id} IntegrationCheck ${outcome.integrationCheckId} does not match handoff ${handoff.integrationCheckId}.`);
    }
    validateWorktreeSet(handoff.readyWorktreeIds, outcome.readyWorktreeIds, health, `Outcome ${outcome.id} ready worktree ids`);
    validateWorktreeSet(handoff.resultTargetWorktreeIds, outcome.resultTargetWorktreeIds, health, `Outcome ${outcome.id} result target ids`);
  }
  if (outcome && integrationCheck) {
    if (outcome.integrationCheckStatus !== integrationCheck.status) {
      markHealth(health, "stale", `Outcome ${outcome.id} recorded IntegrationCheck status ${outcome.integrationCheckStatus} but current status is ${integrationCheck.status}.`);
    }
    validateWorktreeSet(outcome.resultTargetWorktreeIds, integrationCheck.resultTargets.map((target) => target.worktreeId), health, `Outcome ${outcome.id} result target ids`);
    validateOutcomeTargets(outcome.targets, integrationCheck.resultTargets, health, `Outcome ${outcome.id}`);
  }
  if (completion && outcome) {
    if (completion.schedulerIntegrationOutcomeId !== outcome.id) {
      markHealth(health, "scope-mismatch", `Completion ${completion.id} points to outcome ${completion.schedulerIntegrationOutcomeId} instead of latest outcome ${outcome.id}.`);
    }
    if (completion.outcomeStatus !== outcome.status) {
      markHealth(health, "stale", `Completion ${completion.id} recorded outcome status ${completion.outcomeStatus} but latest outcome is ${outcome.status}.`);
    }
    validateWorktreeSet(completion.readyWorktreeIds, outcome.readyWorktreeIds, health, `Completion ${completion.id} ready worktree ids`);
    validateWorktreeSet(completion.resultTargetWorktreeIds, outcome.resultTargetWorktreeIds, health, `Completion ${completion.id} result target ids`);
    validateSourceArtifactHashes(outcome.sourceArtifactHashes, completion.sourceArtifactHashes, health, `Completion ${completion.id}`);
  }
  if (completion && handoff && completion.schedulerIntegrationCheckHandoffId !== handoff.id) {
    markHealth(health, "scope-mismatch", `Completion ${completion.id} points to handoff ${completion.schedulerIntegrationCheckHandoffId} instead of latest handoff ${handoff.id}.`);
  }
  if (completion && candidate && completion.schedulerIntegrationCandidateId !== candidate.id) {
    markHealth(health, "scope-mismatch", `Completion ${completion.id} points to candidate ${completion.schedulerIntegrationCandidateId} instead of latest candidate ${candidate.id}.`);
  }
  if (completion && integrationCheck) {
    if (completion.integrationCheckId !== integrationCheck.id) {
      markHealth(health, "scope-mismatch", `Completion ${completion.id} IntegrationCheck ${completion.integrationCheckId} does not match ${integrationCheck.id}.`);
    }
    if (completion.integrationCheckStatus !== integrationCheck.status) {
      markHealth(health, "stale", `Completion ${completion.id} recorded IntegrationCheck status ${completion.integrationCheckStatus} but current status is ${integrationCheck.status}.`);
    }
    if (completion.status !== completionStatusForIntegration(integrationCheck.status)) {
      markHealth(health, "stale", `Completion ${completion.id} status ${completion.status} does not match IntegrationCheck status ${integrationCheck.status}.`);
    }
  }
  if (blockedCloseout && candidate) {
    if (blockedCloseout.schedulerIntegrationCandidateId !== candidate.id) {
      markHealth(health, "scope-mismatch", `Blocked closeout ${blockedCloseout.id} points to candidate ${blockedCloseout.schedulerIntegrationCandidateId} instead of latest candidate ${candidate.id}.`);
    }
    validateWorktreeSet(blockedCloseout.readyWorktreeIds, candidate.readyWorktreeIds, health, `Blocked closeout ${blockedCloseout.id} ready worktree ids`);
    validateSourceArtifactHashes(candidate.sourceArtifactHashes, blockedCloseout.sourceArtifactHashes, health, `Blocked closeout ${blockedCloseout.id}`);
  }
}

function validateSchedulerScope(
  item: { id: string; changeId: string; schedulerRunId: string },
  changeId: string,
  schedulerRunId: string,
  health: MainAgentControlledSchedulerIntegrationBackflowHealth,
  label: string,
): void {
  if (item.changeId !== changeId) {
    markHealth(health, "scope-mismatch", `${label} belongs to Change ${item.changeId} instead of ${changeId}.`);
  }
  if (item.schedulerRunId !== schedulerRunId) {
    markHealth(health, "scope-mismatch", `${label} belongs to SchedulerRun ${item.schedulerRunId} instead of ${schedulerRunId}.`);
  }
}

function validateReadyTargets(
  expected: Array<{ worktreeId: string; worktreeDiffHash: string; sourceHead: string | null; validationRunId: string; auditRunId: string }>,
  actual: Array<{ worktreeId: string; worktreeDiffHash: string; sourceHead: string | null; validationRunId: string; auditRunId: string }>,
  health: MainAgentControlledSchedulerIntegrationBackflowHealth,
  label: string,
): void {
  const expectedByWorktree = new Map(expected.map((target) => [target.worktreeId, target]));
  for (const target of actual) {
    const source = expectedByWorktree.get(target.worktreeId);
    if (!source) {
      markHealth(health, "scope-mismatch", `${label} includes unexpected ready target ${target.worktreeId}.`);
      continue;
    }
    if (
      source.worktreeDiffHash !== target.worktreeDiffHash
      || source.sourceHead !== target.sourceHead
      || source.validationRunId !== target.validationRunId
      || source.auditRunId !== target.auditRunId
    ) {
      markHealth(health, "stale", `${label} ready target ${target.worktreeId} does not match candidate diff/source/validation/audit lineage.`);
    }
  }
  validateWorktreeSet(expected.map((target) => target.worktreeId), actual.map((target) => target.worktreeId), health, `${label} ready targets`);
}

function validateIntegrationTargets(
  handoffTargets: SchedulerIntegrationCheckHandoff["readyTargets"],
  checkTargets: IntegrationCheckTarget[],
  health: MainAgentControlledSchedulerIntegrationBackflowHealth,
  label: string,
): void {
  const expectedByWorktree = new Map(handoffTargets.map((target) => [target.worktreeId, target]));
  for (const target of checkTargets) {
    const expected = expectedByWorktree.get(target.worktreeId);
    if (!expected) {
      markHealth(health, "scope-mismatch", `${label} IntegrationCheck has unexpected target ${target.worktreeId}.`);
      continue;
    }
    if (expected.worktreeDiffHash !== target.diffHash || expected.sourceHead !== target.sourceHead) {
      markHealth(health, "stale", `${label} IntegrationCheck target ${target.worktreeId} does not match handoff diff/source lineage.`);
    }
  }
}

function validateOutcomeTargets(
  outcomeTargets: SchedulerIntegrationOutcome["targets"],
  checkTargets: IntegrationCheckTarget[],
  health: MainAgentControlledSchedulerIntegrationBackflowHealth,
  label: string,
): void {
  const expectedByWorktree = new Map(checkTargets.map((target) => [target.worktreeId, target]));
  for (const target of outcomeTargets) {
    const expected = expectedByWorktree.get(target.worktreeId);
    if (!expected) {
      markHealth(health, "scope-mismatch", `${label} outcome has unexpected target ${target.worktreeId}.`);
      continue;
    }
    if (target.changeId !== expected.changeId || target.diffHash !== expected.diffHash || target.sourceHead !== expected.sourceHead) {
      markHealth(health, "stale", `${label} outcome target ${target.worktreeId} does not match IntegrationCheck target lineage.`);
    }
  }
}

function validateWorktreeSet(
  expected: string[],
  actual: string[],
  health: MainAgentControlledSchedulerIntegrationBackflowHealth,
  label: string,
): void {
  if (!sameStringSet(expected, actual)) {
    markHealth(health, "scope-mismatch", `${label} mismatch: expected [${normalizeStrings(expected).join(", ")}], got [${normalizeStrings(actual).join(", ")}].`);
  }
}

function validateSourceArtifactHashes(
  expected: Record<string, string>,
  actual: Record<string, string>,
  health: MainAgentControlledSchedulerIntegrationBackflowHealth,
  label: string,
): void {
  if (stableJson(expected) !== stableJson(actual)) {
    markHealth(health, "stale", `${label} source artifact hashes differ from upstream evidence.`);
  }
}

function completionStatusForIntegration(status: IntegrationCheckStatus): SchedulerRunCompletion["status"] {
  if (status === "applied") return "completed-applied";
  if (status === "discarded") return "completed-discarded";
  return "completed-blocked";
}

function summarizeCandidate(candidate: SchedulerIntegrationCandidate): MainAgentControlledSchedulerIntegrationBackflowSummary["candidate"] {
  return {
    id: candidate.id,
    status: candidate.status,
    readyWorktreeIds: [...candidate.readyWorktreeIds],
    readyCount: candidate.readyCount,
    blockedCount: candidate.blockedCount,
  };
}

function summarizeHandoff(handoff: SchedulerIntegrationCheckHandoff): MainAgentControlledSchedulerIntegrationBackflowSummary["handoff"] {
  return {
    id: handoff.id,
    status: handoff.status,
    schedulerIntegrationCandidateId: handoff.schedulerIntegrationCandidateId,
    integrationCheckId: handoff.integrationCheckId,
    integrationCheckStatus: handoff.integrationCheckStatus,
    readyWorktreeIds: [...handoff.readyWorktreeIds],
    resultTargetWorktreeIds: [...handoff.resultTargetWorktreeIds],
  };
}

function summarizeIntegrationCheck(check: IntegrationCheckRecord): MainAgentControlledSchedulerIntegrationBackflowSummary["integrationCheck"] {
  return {
    id: check.id,
    status: check.status,
    resultTargetWorktreeIds: check.resultTargets.map((target) => target.worktreeId),
    latestArtifactHash: check.latestArtifactHash ?? null,
    latestArtifactRef: check.latestArtifactRef ?? null,
  };
}

function summarizeOutcome(outcome: SchedulerIntegrationOutcome): MainAgentControlledSchedulerIntegrationBackflowSummary["outcome"] {
  return {
    id: outcome.id,
    status: outcome.status,
    schedulerIntegrationCandidateId: outcome.schedulerIntegrationCandidateId,
    schedulerIntegrationCheckHandoffId: outcome.schedulerIntegrationCheckHandoffId,
    integrationCheckId: outcome.integrationCheckId,
    integrationCheckStatus: outcome.integrationCheckStatus,
    readyWorktreeIds: [...outcome.readyWorktreeIds],
    resultTargetWorktreeIds: [...outcome.resultTargetWorktreeIds],
    latestArtifactHash: outcome.latestArtifactHash ?? null,
    latestArtifactRef: outcome.latestArtifactRef ?? null,
  };
}

function summarizeCompletion(completion: SchedulerRunCompletion): MainAgentControlledSchedulerIntegrationBackflowSummary["completion"] {
  return {
    id: completion.id,
    status: completion.status,
    schedulerIntegrationCandidateId: completion.schedulerIntegrationCandidateId,
    schedulerIntegrationCheckHandoffId: completion.schedulerIntegrationCheckHandoffId,
    schedulerIntegrationOutcomeId: completion.schedulerIntegrationOutcomeId,
    integrationCheckId: completion.integrationCheckId,
    integrationCheckStatus: completion.integrationCheckStatus,
    outcomeStatus: completion.outcomeStatus,
    readyWorktreeIds: [...completion.readyWorktreeIds],
    resultTargetWorktreeIds: [...completion.resultTargetWorktreeIds],
  };
}

function summarizeBlockedCloseout(closeout: SchedulerRunBlockedCloseout): MainAgentControlledSchedulerIntegrationBackflowSummary["blockedCloseout"] {
  return {
    id: closeout.id,
    status: closeout.status,
    reason: closeout.reason,
    schedulerIntegrationCandidateId: closeout.schedulerIntegrationCandidateId,
    readyWorktreeIds: [...closeout.readyWorktreeIds],
    readyCount: closeout.readyCount,
    blockedCount: closeout.blockedCount,
  };
}

function markHealth(
  health: MainAgentControlledSchedulerIntegrationBackflowHealth,
  status: MainAgentReplayEvidenceHealthStatus,
  reason: string,
): void {
  if (healthPriority(status) > healthPriority(health.status)) health.status = status;
  health.reasons = dedupeStrings([...health.reasons, reason]);
  health.issues = [...(health.issues ?? []), { status, reason }];
}

function classifyReadError(error: unknown): MainAgentReplayEvidenceHealthStatus {
  const message = errorMessage(error).toLowerCase();
  if (message.includes("enoent") || message.includes("no such file") || message.includes("cannot find")) return "missing";
  if (message.includes("scope") || message.includes("mismatch")) return "scope-mismatch";
  if (message.includes("schema") || message.includes("expected") || message.includes("invalid")) return "old-schema";
  return "malformed";
}

function healthPriority(status: MainAgentReplayEvidenceHealthStatus): number {
  switch (status) {
    case "malformed": return 6;
    case "scope-mismatch": return 5;
    case "old-schema": return 4;
    case "stale": return 3;
    case "missing": return 2;
    case "available": return 1;
  }
}

function sameStringSet(left: string[], right: string[]): boolean {
  const normalizedLeft = normalizeStrings(left);
  const normalizedRight = normalizeStrings(right);
  return normalizedLeft.length === normalizedRight.length && normalizedLeft.every((item, index) => item === normalizedRight[index]);
}

function normalizeStrings(values: string[]): string[] {
  return dedupeStrings(values).sort((a, b) => a.localeCompare(b));
}

function normalize(value: string | null | undefined): string | null {
  const normalized = `${value ?? ""}`.trim();
  return normalized || null;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "unknown error";
}

function stableJson(value: Record<string, string>): string {
  return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))));
}

function dedupeStrings(values: Array<string | null | undefined>): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = `${value ?? ""}`.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}
