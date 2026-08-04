import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, lstat, mkdir, readFile, readdir, rename, rm } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { atomicWriteFile, parseJsonText, writeJsonFile } from "../fs/json.js";
import {
  abandonProjectHarnessChange,
  loadProjectHarnessChange,
  type ProjectHarnessChangeRecord,
  type ProjectHarnessChangeIndex,
} from "../project-harness/change.js";
import { validateProjectHarnessChangeEvidence } from "../project-harness/change-evidence.js";
import { fingerprintProjectHarness, fingerprintProjectHarnessContent } from "../project-harness/fingerprint.js";
import {
  assertNoLinkedPathAncestors,
  assertPhysicalDirectory,
  resolveWithinPhysicalRoot,
} from "../project-harness/path-safety.js";
import {
  canonicalProjectHarnessId,
  projectHarnessConversationLane,
  projectHarnessLaneId,
  readProjectHarnessLane,
  resolveProjectHarnessRegistryContext,
  type ProjectHarnessRegistryContext,
} from "../project-harness/registry.js";
import {
  projectHarnessSharedWriterRoot,
  withProjectHarnessWriterLock,
  type WriterLockScope,
} from "../project-harness/writer-lock.js";
import type { ManagedProject } from "../types/index.js";
import type {
  StoredConversation,
  StoredConversationGraphScope,
  StoredDecisionRecord,
} from "../workbench/persistence/contracts.js";
import { openProjectRuntimeWorkbenchDatabase } from "../workbench/persistence/open-workbench-database.js";
import type { ProjectRuntimeResolution } from "./context.js";

export type ProjectHarnessChangeAbandonmentFailureStage =
  | "preparation-recorded"
  | "journal-prepared"
  | "evidence-moved"
  | "archive-published"
  | "registry-record-written"
  | "lane-cleared"
  | "index-rebuilt"
  | "before-sqlite-commit"
  | "sqlite-committed"
  | "before-journal-complete"
  | "before-terminal-cleanup"
  | "rollback-evidence-restored"
  | "rollback-record-restored"
  | "rollback-lane-restored"
  | "rollback-index-restored"
  | "rollback-sidecar-restored";

export interface ProjectHarnessChangeAbandonmentInput {
  changeId: string;
  expectedConversationId: string;
  expectedGraphScopeId: string;
  reason?: string;
  now?: () => string;
  createTransactionId?: () => string;
  failureInjection?: (stage: ProjectHarnessChangeAbandonmentFailureStage) => void;
}

export interface ProjectHarnessChangeAbandonmentResult {
  status: "abandoned" | "already_abandoned";
  transactionId: string | null;
  archivePath: string;
  change: {
    id: string;
    state: "archived";
    updatedAt: string;
    closedAt: string;
    archivePath: string;
  };
  index: ProjectHarnessChangeIndex;
  reason?: string;
}

type ProjectHarnessChangeAbandonmentStage =
  | "prepared"
  | "evidence-moved"
  | "archive-published"
  | "record-published"
  | "lane-published"
  | "skill-published"
  | "sidecar-published"
  | "rollback-evidence-restored"
  | "rollback-record-restored"
  | "rollback-lane-restored"
  | "rollback-index-restored"
  | "rollback-sidecar-restored"
  | "completed"
  | "rolled-back";

interface ProjectHarnessChangeAbandonmentJournal {
  version: "1.0";
  transactionId: string;
  stage: ProjectHarnessChangeAbandonmentStage;
  projectId: string;
  projectRoot: string;
  skillName: string;
  skillRoot: string;
  sidecarRoot: string;
  changeId: string;
  conversationId: string;
  graphScopeId: string;
  laneId: string;
  candidateRoot: string;
  previousEvidenceRoot: string;
  activeEvidenceRoot: string;
  archiveEvidenceRoot: string;
  activeEvidenceFingerprint: string;
  archiveEvidenceFingerprint: string;
  changeRecordPath: string;
  changeRecordBefore: string;
  changeRecordAfter: string;
  lanePath: string;
  laneBefore: string | null;
  laneAfter: string;
  indexPath: string;
  indexBefore: string;
  indexAfter: string;
  conversationBefore: StoredConversation;
  graphScopeBefore: StoredConversationGraphScope;
  decisionBefore: StoredDecisionRecord | null;
  decisionAfter: StoredDecisionRecord;
  sidecarCommittedAt: string;
  createdAt: string;
  updatedAt: string;
  error: string | null;
}

interface ProjectHarnessChangeAbandonmentPreparation {
  version: "1.0";
  kind: "change-abandon-preparation";
  transactionId: string;
  projectId: string;
  projectRoot: string;
  skillName: string;
  skillRoot: string;
  sidecarRoot: string;
  candidateRoot: string;
  createdAt: string;
}

const JOURNAL_VERSION = "1.0";
const DECISION_TYPE = "workpad.abandon";
const JOURNAL_STAGES = new Set<ProjectHarnessChangeAbandonmentStage>([
  "prepared",
  "evidence-moved",
  "archive-published",
  "record-published",
  "lane-published",
  "skill-published",
  "sidecar-published",
  "rollback-evidence-restored",
  "rollback-record-restored",
  "rollback-lane-restored",
  "rollback-index-restored",
  "rollback-sidecar-restored",
  "completed",
  "rolled-back",
]);

export async function abandonSkillNativeProjectHarnessChange(
  project: ManagedProject,
  resolution: ProjectRuntimeResolution,
  input: ProjectHarnessChangeAbandonmentInput,
): Promise<ProjectHarnessChangeAbandonmentResult> {
  assertProjectIdentity(project, resolution);
  return withProjectHarnessWriterLock(projectHarnessSharedWriterRoot(resolution.paths.sidecarRoot), {
    projectId: resolution.harness.projectId,
    ownerId: `change-abandon-${input.changeId}`,
    operation: "change-abandon",
  }, async (lock) => {
    await recoverPendingProjectHarnessChangeAbandonmentsLocked(resolution);
    await assertResolutionCurrent(resolution);
    const prepared = await prepareAbandonment(project, resolution, input);
    if (prepared.result) return prepared.result;
    let journal = prepared.journal;
    try {
      await writeJournal(resolution, journal);
      await rm(prepared.preparationPath);
      input.failureInjection?.("journal-prepared");
      await lock.assertCurrent();
      await assertRecoveryArtifactSafety(resolution, journal);
      await assertForwardStateCurrent(journal);

      await rename(journal.activeEvidenceRoot, journal.previousEvidenceRoot);
      journal = await advanceJournal(resolution, journal, "evidence-moved");
      input.failureInjection?.("evidence-moved");

      const candidateArchive = candidateArtifactPath(journal, `state/changes/archive/${journal.changeId}`);
      await rename(candidateArchive, journal.archiveEvidenceRoot);
      journal = await advanceJournal(resolution, journal, "archive-published");
      input.failureInjection?.("archive-published");

      await atomicWriteFile(journal.changeRecordPath, journal.changeRecordAfter);
      journal = await advanceJournal(resolution, journal, "record-published");
      input.failureInjection?.("registry-record-written");

      await atomicWriteFile(journal.lanePath, journal.laneAfter);
      journal = await advanceJournal(resolution, journal, "lane-published");
      input.failureInjection?.("lane-cleared");

      await atomicWriteFile(journal.indexPath, journal.indexAfter);
      journal = await advanceJournal(resolution, journal, "skill-published");
      input.failureInjection?.("index-rebuilt");
      await lock.assertCurrent();

      await commitSidecarAbandonment(resolution, journal, input.failureInjection);
      input.failureInjection?.("sqlite-committed");
      journal = await advanceJournal(resolution, journal, "sidecar-published");
      input.failureInjection?.("before-journal-complete");

      await assertPublishedState(resolution, journal);
      journal = await advanceJournal(resolution, journal, "completed");
      input.failureInjection?.("before-terminal-cleanup");
      await cleanupTerminalTransaction(resolution, journal);
      return resultFromJournal(journal, prepared.index, input.reason);
    } catch (error) {
      try {
        journal = await rollbackAbandonment(resolution, journal, error, input.failureInjection);
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          "Skill-native Change abandon failed and rollback could not restore Skill and sidecar state.",
        );
      }
      throw error;
    }
  });
}

export async function recoverPendingProjectHarnessChangeAbandonments(
  resolution: ProjectRuntimeResolution,
): Promise<ProjectHarnessChangeAbandonmentJournal[]> {
  return withProjectHarnessWriterLock(projectHarnessSharedWriterRoot(resolution.paths.sidecarRoot), {
    projectId: resolution.harness.projectId,
    ownerId: `change-abandon-recovery-${process.pid}`,
    operation: "change-abandon",
  }, () => recoverPendingProjectHarnessChangeAbandonmentsLocked(resolution));
}

export async function recoverPendingProjectHarnessChangeAbandonmentsUnderWriterLock(
  resolution: ProjectRuntimeResolution,
  lock: Pick<WriterLockScope, "assertCurrent">,
): Promise<ProjectHarnessChangeAbandonmentJournal[]> {
  await lock.assertCurrent();
  const recovered = await recoverPendingProjectHarnessChangeAbandonmentsLocked(resolution);
  await lock.assertCurrent();
  return recovered;
}

async function recoverPendingProjectHarnessChangeAbandonmentsLocked(
  resolution: ProjectRuntimeResolution,
): Promise<ProjectHarnessChangeAbandonmentJournal[]> {
  const root = abandonmentTransactionsRoot(resolution);
  if (!existsSync(root)) return [];
  await assertPhysicalDirectory(root, "Change abandon transaction journals");
  await recoverAbandonmentPreparations(resolution, root);
  const recovered: ProjectHarnessChangeAbandonmentJournal[] = [];
  for (const entry of (await readdir(root, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isFile()) {
      throw new Error(`Change abandon transaction journals contain a link, Junction, or non-file entry: ${entry.name}.`);
    }
    if (entry.name.endsWith(".preparing.json")) continue;
    if (!entry.name.endsWith(".json")) {
      throw new Error(`Change abandon transaction journals contain an unexpected file: ${entry.name}.`);
    }
    const journalPath = await resolveWithinPhysicalRoot(root, entry.name, "Change abandon transaction journal");
    let journal = await readJournal(journalPath);
    assertRecoveryBinding(resolution, journal, journalPath);
    await assertRecoveryArtifactSafety(resolution, journal);
    if (journal.stage === "completed") {
      await assertPublishedState(resolution, journal);
      await cleanupTerminalTransaction(resolution, journal);
      recovered.push(journal);
      continue;
    }
    if (journal.stage === "rolled-back") {
      await assertRolledBackState(resolution, journal);
      await cleanupTerminalTransaction(resolution, journal);
      recovered.push(journal);
      continue;
    }
    journal = await rollbackAbandonment(
      resolution,
      journal,
      new Error(`Recovered incomplete Change abandon transaction at ${journal.stage}.`),
    );
    recovered.push(journal);
  }
  return recovered;
}

async function prepareAbandonment(
  project: ManagedProject,
  resolution: ProjectRuntimeResolution,
  input: ProjectHarnessChangeAbandonmentInput,
): Promise<{
  result: ProjectHarnessChangeAbandonmentResult | null;
  journal: ProjectHarnessChangeAbandonmentJournal;
  index: ProjectHarnessChangeIndex;
  preparationPath: string;
}> {
  const now = (input.now ?? (() => new Date().toISOString()))();
  const store = await openProjectRuntimeWorkbenchDatabase(resolution.paths);
  let conversation: StoredConversation;
  let decisionBefore: StoredDecisionRecord | null;
  let graphScopeBefore: StoredConversationGraphScope;
  try {
    const candidates = store.conversations.listConversations(resolution.harness.projectId)
      .filter((candidate) => candidate.boundChangeId === input.changeId
        || store.conversations.listConversationChangeIds(resolution.harness.projectId, candidate.conversationId).includes(input.changeId));
    if (candidates.length !== 1) {
      throw new Error(`Change abandon requires one exact bound Conversation; found ${candidates.length}.`);
    }
    conversation = candidates[0]!;
    if (!conversation.currentGraphScopeId
      || conversation.boundChangeId !== input.changeId
      || conversation.conversationId !== input.expectedConversationId
      || conversation.currentGraphScopeId !== input.expectedGraphScopeId) {
      throw new Error("Change abandon requires the exact current Conversation graph and Change binding.");
    }
    decisionBefore = store.decisions.listDecisions(resolution.harness.projectId, input.changeId)
      .find((candidate) => candidate.id === decisionId(resolution.harness.projectId, conversation, input.changeId)) ?? null;
    const scope = store.conversations.readConversationGraphScope(
      resolution.harness.projectId,
      conversation.currentGraphScopeId,
    );
    if (!scope || scope.conversationId !== conversation.conversationId) {
      throw new Error("Change abandon requires the exact Conversation graph scope.");
    }
    graphScopeBefore = scope;
  } finally {
    store.close();
  }

  const registry = await resolveProjectHarnessRegistryContext({
    projectId: resolution.harness.projectId,
    projectRoot: project.path,
    skillRoot: resolution.harness.skillRoot,
  });
  const lane = projectHarnessConversationLane(conversation.conversationId, conversation.currentGraphScopeId);
  const context = { ...registry, lane };
  const current = await loadProjectHarnessChange(resolution.harness.skillRoot, input.changeId, true);
  const archivePath = `state/changes/archive/${input.changeId}`;
  if (current.status === "abandoned") {
    const index = await assertCompletedAbandonmentState(
      resolution,
      context,
      current,
      conversation,
      graphScopeBefore,
      decisionBefore,
    );
    return {
      result: {
        status: "already_abandoned",
        transactionId: null,
        archivePath,
        change: {
          id: input.changeId,
          state: "archived",
          updatedAt: current.updated_at,
          closedAt: current.updated_at,
          archivePath,
        },
        index,
        ...(input.reason ? { reason: input.reason } : {}),
      },
      journal: null as never,
      index,
      preparationPath: "",
    };
  }
  if (conversation.state !== "active" || graphScopeBefore.status !== "active") {
    throw new Error("Change abandon requires an active, non-terminal Conversation graph.");
  }
  if (decisionBefore) throw new Error("Change abandon decision identity already exists for a non-terminal Change.");

  const transactionId = input.createTransactionId?.() ?? `change-abandon-${randomUUID().toLowerCase()}`;
  assertTransactionId(transactionId);
  const parent = await assertPhysicalDirectory(dirname(resolution.harness.skillRoot), "project Harness parent");
  const candidateRoot = join(parent, `.${resolution.harness.skillName}.${transactionId}.abandon-candidate`);
  if (existsSync(candidateRoot)) throw new Error(`Change abandon candidate already exists: ${candidateRoot}.`);
  const preparation: ProjectHarnessChangeAbandonmentPreparation = {
    version: JOURNAL_VERSION,
    kind: "change-abandon-preparation",
    transactionId,
    projectId: resolution.harness.projectId,
    projectRoot: resolution.projectRoot,
    skillName: resolution.harness.skillName,
    skillRoot: resolution.harness.skillRoot,
    sidecarRoot: resolution.paths.sidecarRoot,
    candidateRoot,
    createdAt: now,
  };
  const preparationPath = await writePreparation(resolution, preparation);
  try {
    input.failureInjection?.("preparation-recorded");
    await mkdir(candidateRoot);
    await copyPhysicalTree(join(resolution.harness.skillRoot, "state"), join(candidateRoot, "state"));
    const candidateContext = { ...context, skillRoot: candidateRoot };
    const projected = await abandonProjectHarnessChange(candidateContext, { changeId: input.changeId, now: () => now });
    const laneId = projectHarnessLaneId(context);
    const paths = await transactionPaths(resolution, candidateRoot, transactionId, input.changeId, laneId);
    const [changeRecordBefore, changeRecordAfter, laneBefore, laneAfter, indexBefore, indexAfter] = await Promise.all([
      readFile(paths.changeRecordPath, "utf8"),
      readFile(candidateArtifactPathFromRoot(candidateRoot, `state/registry/changes/${input.changeId}.json`), "utf8"),
      existsSync(paths.lanePath) ? readFile(paths.lanePath, "utf8") : Promise.resolve(null),
      readFile(candidateArtifactPathFromRoot(candidateRoot, `state/registry/lanes/${laneId}.json`), "utf8"),
      readFile(paths.indexPath, "utf8"),
      readFile(candidateArtifactPathFromRoot(candidateRoot, "state/changes/INDEX.json"), "utf8"),
    ]);
    const decisionAfter = abandonmentDecision(resolution, conversation, input.changeId, input.reason, now);
    const journal: ProjectHarnessChangeAbandonmentJournal = {
      version: JOURNAL_VERSION,
      transactionId,
      stage: "prepared",
      projectId: resolution.harness.projectId,
      projectRoot: resolution.projectRoot,
      skillName: resolution.harness.skillName,
      skillRoot: resolution.harness.skillRoot,
      sidecarRoot: resolution.paths.sidecarRoot,
      changeId: input.changeId,
      conversationId: conversation.conversationId,
      graphScopeId: conversation.currentGraphScopeId,
      laneId,
      candidateRoot,
      previousEvidenceRoot: join(candidateRoot, "previous-active-evidence"),
      activeEvidenceRoot: paths.activeEvidenceRoot,
      archiveEvidenceRoot: paths.archiveEvidenceRoot,
      activeEvidenceFingerprint: await fingerprintProjectHarness(paths.activeEvidenceRoot),
      archiveEvidenceFingerprint: await fingerprintProjectHarness(
        candidateArtifactPathFromRoot(candidateRoot, `state/changes/archive/${input.changeId}`),
      ),
      changeRecordPath: paths.changeRecordPath,
      changeRecordBefore,
      changeRecordAfter,
      lanePath: paths.lanePath,
      laneBefore,
      laneAfter,
      indexPath: paths.indexPath,
      indexBefore,
      indexAfter,
      conversationBefore: conversation,
      graphScopeBefore,
      decisionBefore,
      decisionAfter,
      sidecarCommittedAt: now,
      createdAt: now,
      updatedAt: now,
      error: null,
    };
    return { result: null, journal, index: projected.index, preparationPath };
  } catch (error) {
    try {
      await removeCandidateRoot(candidateRoot);
      await rm(preparationPath, { force: true });
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "Change abandon preparation failed and its recovery authority was retained.",
      );
    }
    throw error;
  }
}

async function commitSidecarAbandonment(
  resolution: ProjectRuntimeResolution,
  journal: ProjectHarnessChangeAbandonmentJournal,
  failureInjection?: (stage: ProjectHarnessChangeAbandonmentFailureStage) => void,
): Promise<void> {
  const store = await openProjectRuntimeWorkbenchDatabase(resolution.paths);
  try {
    store.transaction(() => {
      const current = store.conversations.readConversation(journal.projectId, journal.conversationId);
      if (!current || !matchesConversationSnapshot(current, journal.conversationBefore)) {
        throw new Error("Change abandon Conversation lineage changed before sidecar commit.");
      }
      const existing = store.decisions.listDecisions(journal.projectId, journal.changeId)
        .find((candidate) => candidate.id === journal.decisionAfter.id) ?? null;
      if (!matchesOptionalDecision(existing, journal.decisionBefore)) {
        throw new Error("Change abandon decision lineage changed before sidecar commit.");
      }
      store.conversations.archiveBoundConversation(
        journal.projectId,
        journal.conversationId,
        journal.changeId,
        journal.graphScopeId,
        journal.sidecarCommittedAt,
      );
      store.conversations.terminalizeConversationGraphScopeForAbandonment(
        journal.graphScopeBefore,
        journal.sidecarCommittedAt,
      );
      store.decisions.upsertDecision(journal.decisionAfter);
      failureInjection?.("before-sqlite-commit");
    });
  } finally {
    store.close();
  }
}

async function rollbackAbandonment(
  resolution: ProjectRuntimeResolution,
  journal: ProjectHarnessChangeAbandonmentJournal,
  error: unknown,
  failureInjection?: (stage: ProjectHarnessChangeAbandonmentFailureStage) => void,
): Promise<ProjectHarnessChangeAbandonmentJournal> {
  if (journal.stage === "completed") return journal;
  await assertRecoveryArtifactSafety(resolution, journal);
  await assertRollbackPossible(resolution, journal);
  await rollbackSkillEvidence(journal);
  journal = await advanceJournal(resolution, journal, "rollback-evidence-restored");
  failureInjection?.("rollback-evidence-restored");
  await restoreTextArtifact(journal.changeRecordPath, journal.changeRecordBefore, journal.changeRecordAfter, "Change record");
  journal = await advanceJournal(resolution, journal, "rollback-record-restored");
  failureInjection?.("rollback-record-restored");
  await restoreOptionalTextArtifact(journal.lanePath, journal.laneBefore, journal.laneAfter, "Lane record");
  journal = await advanceJournal(resolution, journal, "rollback-lane-restored");
  failureInjection?.("rollback-lane-restored");
  await restoreTextArtifact(journal.indexPath, journal.indexBefore, journal.indexAfter, "Change INDEX");
  journal = await advanceJournal(resolution, journal, "rollback-index-restored");
  failureInjection?.("rollback-index-restored");
  await rollbackSidecar(resolution, journal);
  journal = await advanceJournal(resolution, journal, "rollback-sidecar-restored");
  failureInjection?.("rollback-sidecar-restored");
  await assertRolledBackState(resolution, journal);
  const rolledBack: ProjectHarnessChangeAbandonmentJournal = {
    ...journal,
    stage: "rolled-back",
    updatedAt: new Date().toISOString(),
    error: error instanceof Error ? error.message : String(error),
  };
  await writeJournal(resolution, rolledBack);
  await cleanupTerminalTransaction(resolution, rolledBack);
  return rolledBack;
}

async function rollbackSidecar(
  resolution: ProjectRuntimeResolution,
  journal: ProjectHarnessChangeAbandonmentJournal,
): Promise<void> {
  const store = await openProjectRuntimeWorkbenchDatabase(resolution.paths);
  try {
    store.transaction(() => {
      const current = store.conversations.readConversation(journal.projectId, journal.conversationId);
      const graphScope = store.conversations.readConversationGraphScope(journal.projectId, journal.graphScopeId);
      const decision = store.decisions.listDecisions(journal.projectId, journal.changeId)
        .find((candidate) => candidate.id === journal.decisionAfter.id) ?? null;
      if (current && matchesConversationSnapshot(current, journal.conversationBefore)
        && matchesGraphScopeSnapshot(graphScope, journal.graphScopeBefore)
        && matchesOptionalDecision(decision, journal.decisionBefore)) return;
      if (!current
        || current.state !== "archive"
        || current.boundChangeId !== journal.changeId
        || current.currentGraphScopeId !== journal.graphScopeId
        || current.updatedAt !== journal.sidecarCommittedAt
        || !isTransactionTerminalGraphScope(graphScope, journal)
        || !matchesOptionalDecision(decision, journal.decisionAfter)) {
        throw new Error("Change abandon rollback refused because runtime sidecar state is neither before nor transaction-owned.");
      }
      store.conversations.restoreConversationAfterAbandonment(journal.conversationBefore, journal.sidecarCommittedAt);
      store.conversations.restoreConversationGraphScopeAfterAbandonment(
        journal.graphScopeBefore,
        journal.sidecarCommittedAt,
      );
      if (journal.decisionBefore) store.decisions.upsertDecision(journal.decisionBefore);
      else if (!store.decisions.deleteDecision(journal.projectId, journal.decisionAfter.id)) {
        throw new Error("Change abandon rollback could not remove its decision record.");
      }
    });
  } finally {
    store.close();
  }
}

async function rollbackSkillEvidence(journal: ProjectHarnessChangeAbandonmentJournal): Promise<void> {
  if (existsSync(journal.previousEvidenceRoot)) {
    if (existsSync(journal.activeEvidenceRoot)) {
      throw new Error("Change abandon rollback found both active and transaction backup evidence.");
    }
    const fingerprint = await fingerprintProjectHarness(journal.previousEvidenceRoot);
    if (fingerprint !== journal.activeEvidenceFingerprint) {
      throw new Error("Change abandon rollback refused because active evidence backup changed.");
    }
    await rename(journal.previousEvidenceRoot, journal.activeEvidenceRoot);
  }
  if (existsSync(journal.archiveEvidenceRoot)) {
    const fingerprint = await fingerprintProjectHarness(journal.archiveEvidenceRoot);
    if (fingerprint !== journal.archiveEvidenceFingerprint) {
      throw new Error("Change abandon rollback refused because archived evidence changed.");
    }
    await removePhysicalTree(journal.archiveEvidenceRoot);
  }
}

async function assertForwardStateCurrent(journal: ProjectHarnessChangeAbandonmentJournal): Promise<void> {
  if (!existsSync(journal.activeEvidenceRoot) || existsSync(journal.archiveEvidenceRoot)) {
    throw new Error("Change abandon publication no longer owns the expected active evidence state.");
  }
  if (await fingerprintProjectHarness(journal.activeEvidenceRoot) !== journal.activeEvidenceFingerprint) {
    throw new Error("Change abandon active evidence changed before publication.");
  }
  await assertTextArtifact(journal.changeRecordPath, journal.changeRecordBefore, "current Change record");
  await assertOptionalTextArtifact(journal.lanePath, journal.laneBefore, "current Lane record");
  await assertTextArtifact(journal.indexPath, journal.indexBefore, "current Change INDEX");
}

async function assertRollbackPossible(
  resolution: ProjectRuntimeResolution,
  journal: ProjectHarnessChangeAbandonmentJournal,
): Promise<void> {
  await assertTextArtifactOneOf(
    journal.changeRecordPath,
    [journal.changeRecordBefore, journal.changeRecordAfter],
    "Change record",
  );
  await assertOptionalTextArtifactOneOf(
    journal.lanePath,
    [journal.laneBefore, journal.laneAfter],
    "Lane record",
  );
  await assertTextArtifactOneOf(journal.indexPath, [journal.indexBefore, journal.indexAfter], "Change INDEX");

  const activeExists = existsSync(journal.activeEvidenceRoot);
  const previousExists = existsSync(journal.previousEvidenceRoot);
  if (activeExists === previousExists) {
    throw new Error("Change abandon rollback requires exactly one active evidence authority.");
  }
  const activeAuthority = activeExists ? journal.activeEvidenceRoot : journal.previousEvidenceRoot;
  if (await fingerprintProjectHarness(activeAuthority) !== journal.activeEvidenceFingerprint) {
    throw new Error("Change abandon rollback active evidence authority changed.");
  }
  if (existsSync(journal.archiveEvidenceRoot)
    && await fingerprintProjectHarness(journal.archiveEvidenceRoot) !== journal.archiveEvidenceFingerprint) {
    throw new Error("Change abandon rollback archived evidence authority changed.");
  }

  const store = await openProjectRuntimeWorkbenchDatabase(resolution.paths);
  try {
    const current = store.conversations.readConversation(journal.projectId, journal.conversationId);
    const graphScope = store.conversations.readConversationGraphScope(journal.projectId, journal.graphScopeId);
    const decision = store.decisions.listDecisions(journal.projectId, journal.changeId)
      .find((candidate) => candidate.id === journal.decisionAfter.id) ?? null;
    const isBefore = Boolean(current
      && matchesConversationSnapshot(current, journal.conversationBefore)
      && matchesGraphScopeSnapshot(graphScope, journal.graphScopeBefore)
      && matchesOptionalDecision(decision, journal.decisionBefore));
    const isAfter = Boolean(current
      && current.state === "archive"
      && current.boundChangeId === journal.changeId
      && current.currentGraphScopeId === journal.graphScopeId
      && current.updatedAt === journal.sidecarCommittedAt
      && isTransactionTerminalGraphScope(graphScope, journal)
      && matchesOptionalDecision(decision, journal.decisionAfter));
    if (!isBefore && !isAfter) {
      throw new Error("Change abandon rollback runtime sidecar state is neither before nor transaction-owned.");
    }
  } finally {
    store.close();
  }
}

async function assertCompletedAbandonmentState(
  resolution: ProjectRuntimeResolution,
  context: ProjectHarnessRegistryContext,
  record: ProjectHarnessChangeRecord,
  conversation: StoredConversation,
  graphScope: StoredConversationGraphScope,
  decision: StoredDecisionRecord | null,
): Promise<ProjectHarnessChangeIndex> {
  const archivePath = `state/changes/archive/${record.change_id}`;
  const activeRoot = await resolveWithinPhysicalRoot(
    resolution.harness.skillRoot,
    `state/changes/active/${record.change_id}`,
    "active Change evidence",
  );
  const archiveRoot = await resolveWithinPhysicalRoot(
    resolution.harness.skillRoot,
    archivePath,
    "archive Change evidence",
  );
  if (existsSync(activeRoot) || !existsSync(archiveRoot)) {
    throw new Error("Completed Change abandon evidence state is inconsistent.");
  }
  const evidence = await validateProjectHarnessChangeEvidence(archiveRoot);
  if (record.evidence_complete !== evidence.valid
    || record.evidence_paths.length !== 1
    || record.evidence_paths[0] !== archivePath) {
    throw new Error("Completed Change abandon evidence is invalid or not bound to its archive path.");
  }
  const lane = await readProjectHarnessLane(context);
  if (!lane
    || lane.lane_id !== record.lane_id
    || lane.conversation_id !== conversation.conversationId
    || lane.graph_scope_id !== conversation.currentGraphScopeId
    || lane.active_change_id !== null
    || lane.status !== "idle") {
    throw new Error("Completed Change abandon Lane state is inconsistent.");
  }
  if (conversation.state !== "archive"
    || graphScope.status !== "terminal"
    || graphScope.conversationId !== conversation.conversationId
    || !decision
    || !matchesAbandonDecision(decision, resolution, conversation, record.change_id)) {
    throw new Error("Completed Change abandon runtime sidecar state is inconsistent.");
  }
  const index = parseJsonText(
    await readFile(join(resolution.harness.skillRoot, "state", "changes", "INDEX.json"), "utf8"),
    "Change INDEX",
  ) as ProjectHarnessChangeIndex;
  const entries = index.changes.filter((candidate) => candidate.change_id === record.change_id);
  if (entries.length !== 1
    || entries[0]?.status !== "abandoned"
    || entries[0]?.evidence_state !== "archive"
    || entries[0]?.summary_path !== `${archivePath}/summary.md`) {
    throw new Error("Completed Change abandon INDEX state is inconsistent.");
  }
  return index;
}

async function assertPublishedState(
  resolution: ProjectRuntimeResolution,
  journal: ProjectHarnessChangeAbandonmentJournal,
): Promise<void> {
  assertRecoveryBinding(resolution, journal, journalPath(resolution, journal.transactionId));
  if (existsSync(journal.activeEvidenceRoot) || !existsSync(journal.archiveEvidenceRoot)) {
    throw new Error("Published Change abandon evidence state is invalid.");
  }
  if (await fingerprintProjectHarness(journal.archiveEvidenceRoot) !== journal.archiveEvidenceFingerprint) {
    throw new Error("Published Change abandon evidence fingerprint changed.");
  }
  await assertTextArtifact(journal.changeRecordPath, journal.changeRecordAfter, "published Change record");
  await assertTextArtifact(journal.lanePath, journal.laneAfter, "published Lane record");
  await assertTextArtifact(journal.indexPath, journal.indexAfter, "published Change INDEX");
  const store = await openProjectRuntimeWorkbenchDatabase(resolution.paths);
  try {
    const current = store.conversations.readConversation(journal.projectId, journal.conversationId);
    const graphScope = store.conversations.readConversationGraphScope(journal.projectId, journal.graphScopeId);
    const decision = store.decisions.listDecisions(journal.projectId, journal.changeId)
      .find((candidate) => candidate.id === journal.decisionAfter.id) ?? null;
    if (!current
      || current.state !== "archive"
      || current.boundChangeId !== journal.changeId
      || current.currentGraphScopeId !== journal.graphScopeId
      || current.updatedAt !== journal.sidecarCommittedAt
      || !isTransactionTerminalGraphScope(graphScope, journal)
      || !matchesOptionalDecision(decision, journal.decisionAfter)) {
      throw new Error("Published Change abandon runtime sidecar state is invalid.");
    }
  } finally {
    store.close();
  }
}

async function assertRolledBackState(
  resolution: ProjectRuntimeResolution,
  journal: ProjectHarnessChangeAbandonmentJournal,
): Promise<void> {
  if (!existsSync(journal.activeEvidenceRoot) || existsSync(journal.archiveEvidenceRoot)) {
    throw new Error("Rolled-back Change abandon evidence state is invalid.");
  }
  if (await fingerprintProjectHarness(journal.activeEvidenceRoot) !== journal.activeEvidenceFingerprint) {
    throw new Error("Rolled-back Change abandon evidence fingerprint changed.");
  }
  await assertTextArtifact(journal.changeRecordPath, journal.changeRecordBefore, "rolled-back Change record");
  await assertOptionalTextArtifact(journal.lanePath, journal.laneBefore, "rolled-back Lane record");
  await assertTextArtifact(journal.indexPath, journal.indexBefore, "rolled-back Change INDEX");
  const store = await openProjectRuntimeWorkbenchDatabase(resolution.paths);
  try {
    const current = store.conversations.readConversation(journal.projectId, journal.conversationId);
    const graphScope = store.conversations.readConversationGraphScope(journal.projectId, journal.graphScopeId);
    const decision = store.decisions.listDecisions(journal.projectId, journal.changeId)
      .find((candidate) => candidate.id === journal.decisionAfter.id) ?? null;
    if (!current
      || !matchesConversationSnapshot(current, journal.conversationBefore)
      || !matchesGraphScopeSnapshot(graphScope, journal.graphScopeBefore)
      || !matchesOptionalDecision(decision, journal.decisionBefore)) {
      throw new Error("Rolled-back Change abandon runtime sidecar state is invalid.");
    }
  } finally {
    store.close();
  }
}

function abandonmentDecision(
  resolution: ProjectRuntimeResolution,
  conversation: StoredConversation,
  changeId: string,
  reason: string | undefined,
  now: string,
): StoredDecisionRecord {
  const payload = {
    version: "1.0",
    projectId: resolution.harness.projectId,
    conversationId: conversation.conversationId,
    changeId,
    graphScopeId: conversation.currentGraphScopeId,
    skillContentFingerprint: resolution.harness.contentFingerprint,
    reason: reason ?? null,
  };
  return {
    id: decisionId(resolution.harness.projectId, conversation, changeId),
    projectId: resolution.harness.projectId,
    changeId,
    decisionType: DECISION_TYPE,
    status: "dismissed",
    label: "放弃这个需求对话",
    summary: "User abandoned this demand conversation. Source code was not changed by this action.",
    targetId: changeId,
    runId: null,
    artifact: null,
    actionId: DECISION_TYPE,
    feedback: reason ?? null,
    payloadJson: JSON.stringify(payload),
    createdAt: now,
    updatedAt: now,
    completedAt: now,
  };
}

function decisionId(projectId: string, conversation: StoredConversation, changeId: string): string {
  return `abandon-${createHash("sha256").update(JSON.stringify({
    projectId,
    conversationId: conversation.conversationId,
    changeId,
    graphScopeId: conversation.currentGraphScopeId,
  })).digest("hex")}`;
}

function matchesAbandonDecision(
  decision: StoredDecisionRecord,
  resolution: ProjectRuntimeResolution,
  conversation: StoredConversation,
  changeId: string,
): boolean {
  if (decision.id !== decisionId(resolution.harness.projectId, conversation, changeId)
    || decision.projectId !== resolution.harness.projectId
    || decision.changeId !== changeId
    || decision.decisionType !== DECISION_TYPE
    || decision.actionId !== DECISION_TYPE
    || decision.status !== "dismissed"
    || decision.label !== "放弃这个需求对话"
    || decision.summary !== "User abandoned this demand conversation. Source code was not changed by this action."
    || decision.targetId !== changeId
    || decision.runId !== null
    || decision.artifact !== null) return false;
  try {
    const payload = JSON.parse(decision.payloadJson) as Record<string, unknown>;
    return payload.projectId === resolution.harness.projectId
      && payload.conversationId === conversation.conversationId
      && payload.changeId === changeId
      && payload.graphScopeId === conversation.currentGraphScopeId
      && payload.skillContentFingerprint === resolution.harness.contentFingerprint
      && payload.reason === decision.feedback;
  } catch {
    return false;
  }
}

function matchesConversationSnapshot(current: StoredConversation, snapshot: StoredConversation): boolean {
  return JSON.stringify(normalizeConversation(current)) === JSON.stringify(normalizeConversation(snapshot));
}

function matchesGraphScopeSnapshot(
  current: StoredConversationGraphScope | null,
  snapshot: StoredConversationGraphScope,
): boolean {
  return current !== null && JSON.stringify(current) === JSON.stringify(snapshot);
}

function isTransactionTerminalGraphScope(
  current: StoredConversationGraphScope | null,
  journal: ProjectHarnessChangeAbandonmentJournal,
): boolean {
  return current?.projectId === journal.projectId
    && current.conversationId === journal.conversationId
    && current.graphScopeId === journal.graphScopeId
    && current.status === "terminal"
    && current.updatedAt === journal.sidecarCommittedAt;
}

function normalizeConversation(value: StoredConversation): StoredConversation {
  return { ...value, surfaceKind: value.surfaceKind ?? "user" };
}

function matchesOptionalDecision(
  current: StoredDecisionRecord | null,
  expected: StoredDecisionRecord | null,
): boolean {
  return current === null && expected === null
    || current !== null && expected !== null && JSON.stringify(current) === JSON.stringify(expected);
}

async function assertResolutionCurrent(resolution: ProjectRuntimeResolution): Promise<void> {
  const current = await fingerprintProjectHarnessContent(resolution.harness.skillRoot);
  if (current !== resolution.harness.contentFingerprint) {
    throw new Error("Project Harness content fingerprint changed before Change abandon.");
  }
}

function assertProjectIdentity(project: ManagedProject, resolution: ProjectRuntimeResolution): void {
  if (project.id !== resolution.harness.projectId
    || resolve(project.path) !== resolve(resolution.projectRoot)
    || resolution.paths.projectId !== resolution.harness.projectId) {
    throw new Error("Change abandon project identity is stale.");
  }
}

async function transactionPaths(
  resolution: ProjectRuntimeResolution,
  candidateRoot: string,
  transactionId: string,
  changeId: string,
  laneId: string,
) {
  return {
    activeEvidenceRoot: await resolveWithinPhysicalRoot(
      resolution.harness.skillRoot,
      `state/changes/active/${changeId}`,
      "active Change evidence",
    ),
    archiveEvidenceRoot: await resolveWithinPhysicalRoot(
      resolution.harness.skillRoot,
      `state/changes/archive/${changeId}`,
      "archive Change evidence",
    ),
    changeRecordPath: await resolveWithinPhysicalRoot(
      resolution.harness.skillRoot,
      `state/registry/changes/${changeId}.json`,
      "Change Registry record",
    ),
    lanePath: await resolveWithinPhysicalRoot(
      resolution.harness.skillRoot,
      `state/registry/lanes/${laneId}.json`,
      "Change Lane record",
    ),
    indexPath: await resolveWithinPhysicalRoot(
      resolution.harness.skillRoot,
      "state/changes/INDEX.json",
      "Change INDEX",
    ),
    candidateRoot,
    transactionId,
  };
}

function candidateArtifactPath(journal: ProjectHarnessChangeAbandonmentJournal, path: string): string {
  return candidateArtifactPathFromRoot(journal.candidateRoot, path);
}

function candidateArtifactPathFromRoot(candidateRoot: string, path: string): string {
  const target = resolve(candidateRoot, ...path.split("/"));
  const rel = relative(resolve(candidateRoot), target);
  if (!rel || rel.startsWith("..") || resolve(rel) === rel) {
    throw new Error(`Change abandon candidate path escapes its root: ${path}.`);
  }
  return target;
}

async function copyPhysicalTree(source: string, target: string): Promise<void> {
  const sourceInfo = await lstat(source);
  if (sourceInfo.isSymbolicLink() || !sourceInfo.isDirectory()) {
    throw new Error(`Change abandon candidate source is a link, Junction, or non-directory: ${source}.`);
  }
  await mkdir(target);
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const from = join(source, entry.name);
    const to = join(target, entry.name);
    const info = await lstat(from);
    if (info.isSymbolicLink()) throw new Error(`Change abandon candidate contains a link or Junction: ${from}.`);
    if (info.isDirectory()) await copyPhysicalTree(from, to);
    else if (info.isFile()) await copyFile(from, to);
    else throw new Error(`Change abandon candidate contains an unsupported filesystem entry: ${from}.`);
  }
}

async function removePhysicalTree(path: string): Promise<void> {
  await assertPhysicalTree(path, "Change abandon owned tree");
  await rm(path, { recursive: true });
}

async function assertPhysicalTree(path: string, label: string): Promise<void> {
  await assertPhysicalDirectory(path, label);
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    const info = await lstat(child);
    if (info.isSymbolicLink()) throw new Error(`${label} contains a link or Junction: ${child}.`);
    if (info.isDirectory()) await assertPhysicalTree(child, label);
    else if (!info.isFile()) throw new Error(`${label} contains an unsupported filesystem entry: ${child}.`);
  }
}

async function removeCandidateRoot(path: string): Promise<void> {
  if (!existsSync(path)) return;
  const parent = await assertPhysicalDirectory(dirname(path), "project Harness parent");
  if (dirname(resolve(path)) !== parent || !basename(path).includes(".abandon-candidate")) {
    throw new Error("Refusing to remove a Change abandon candidate outside its owned sibling path.");
  }
  await removePhysicalTree(path);
}

async function cleanupTransactionCandidate(journal: ProjectHarnessChangeAbandonmentJournal): Promise<void> {
  await removeCandidateRoot(journal.candidateRoot);
}

async function cleanupTerminalTransaction(
  resolution: ProjectRuntimeResolution,
  journal: ProjectHarnessChangeAbandonmentJournal,
): Promise<void> {
  if (journal.stage !== "completed" && journal.stage !== "rolled-back") {
    throw new Error(`Refusing to remove a non-terminal Change abandon journal at ${journal.stage}.`);
  }
  await cleanupTransactionCandidate(journal);
  const path = journalPath(resolution, journal.transactionId);
  if (!existsSync(path)) return;
  const info = await lstat(path);
  if (info.isSymbolicLink() || !info.isFile()) {
    throw new Error("Change abandon terminal journal is a link, Junction, or non-file entry.");
  }
  await rm(path);
}

function abandonmentTransactionsRoot(resolution: ProjectRuntimeResolution): string {
  return join(resolution.paths.transactionStagingRoot, "change-abandon");
}

function journalPath(resolution: ProjectRuntimeResolution, transactionId: string): string {
  return join(abandonmentTransactionsRoot(resolution), `${transactionId}.json`);
}

async function writeJournal(
  resolution: ProjectRuntimeResolution,
  journal: ProjectHarnessChangeAbandonmentJournal,
): Promise<void> {
  const root = abandonmentTransactionsRoot(resolution);
  await assertNoLinkedPathAncestors(root, "Change abandon transaction journals");
  await mkdir(root, { recursive: true });
  await assertPhysicalDirectory(root, "Change abandon transaction journals");
  const path = await resolveWithinPhysicalRoot(root, `${journal.transactionId}.json`, "Change abandon transaction journal");
  await writeJsonFile(path, journal);
}

async function writePreparation(
  resolution: ProjectRuntimeResolution,
  preparation: ProjectHarnessChangeAbandonmentPreparation,
): Promise<string> {
  const root = abandonmentTransactionsRoot(resolution);
  await assertNoLinkedPathAncestors(root, "Change abandon transaction journals");
  await mkdir(root, { recursive: true });
  await assertPhysicalDirectory(root, "Change abandon transaction journals");
  const path = await resolveWithinPhysicalRoot(
    root,
    `${preparation.transactionId}.preparing.json`,
    "Change abandon preparation record",
  );
  await writeJsonFile(path, preparation);
  return path;
}

async function recoverAbandonmentPreparations(
  resolution: ProjectRuntimeResolution,
  root: string,
): Promise<void> {
  for (const entry of (await readdir(root, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.name.endsWith(".preparing.json") && !entry.isFile()) {
      throw new Error(`Change abandon preparations contain a link, Junction, or non-file entry: ${entry.name}.`);
    }
    if (!entry.name.endsWith(".preparing.json")) continue;
    const path = await resolveWithinPhysicalRoot(root, entry.name, "Change abandon preparation record");
    const value = parseJsonText(await readFile(path, "utf8"), path) as Partial<ProjectHarnessChangeAbandonmentPreparation>;
    if (value.version !== JOURNAL_VERSION
      || value.kind !== "change-abandon-preparation"
      || typeof value.transactionId !== "string"
      || typeof value.projectId !== "string"
      || typeof value.projectRoot !== "string"
      || typeof value.skillName !== "string"
      || typeof value.skillRoot !== "string"
      || typeof value.sidecarRoot !== "string"
      || typeof value.candidateRoot !== "string") {
      throw new Error(`Invalid Change abandon preparation record: ${path}.`);
    }
    const preparation = value as ProjectHarnessChangeAbandonmentPreparation;
    assertPreparationBinding(resolution, preparation, path);
    if (!existsSync(journalPath(resolution, preparation.transactionId))) {
      await removeCandidateRoot(preparation.candidateRoot);
    }
    await rm(path);
  }
}

async function advanceJournal(
  resolution: ProjectRuntimeResolution,
  journal: ProjectHarnessChangeAbandonmentJournal,
  stage: ProjectHarnessChangeAbandonmentStage,
): Promise<ProjectHarnessChangeAbandonmentJournal> {
  const next = { ...journal, stage, updatedAt: new Date().toISOString(), error: null };
  await writeJournal(resolution, next);
  return next;
}

async function readJournal(path: string): Promise<ProjectHarnessChangeAbandonmentJournal> {
  const value = parseJsonText(await readFile(path, "utf8"), path) as Partial<ProjectHarnessChangeAbandonmentJournal>;
  if (value.version !== JOURNAL_VERSION
    || typeof value.transactionId !== "string"
    || typeof value.projectId !== "string"
    || typeof value.skillRoot !== "string"
    || typeof value.sidecarRoot !== "string"
    || typeof value.changeId !== "string"
    || typeof value.conversationId !== "string"
    || typeof value.graphScopeId !== "string"
    || typeof value.stage !== "string"
    || !JOURNAL_STAGES.has(value.stage as ProjectHarnessChangeAbandonmentStage)
    || !value.conversationBefore
    || !value.graphScopeBefore
    || !value.decisionAfter) {
    throw new Error(`Invalid Change abandon transaction journal: ${path}.`);
  }
  return value as ProjectHarnessChangeAbandonmentJournal;
}

function assertRecoveryBinding(
  resolution: ProjectRuntimeResolution,
  journal: ProjectHarnessChangeAbandonmentJournal,
  path: string,
): void {
  const expectedPath = journalPath(resolution, journal.transactionId);
  if (journal.projectId !== resolution.harness.projectId
    || journal.skillName !== resolution.harness.skillName
    || resolve(journal.projectRoot) !== resolve(resolution.projectRoot)
    || resolve(journal.skillRoot) !== resolve(resolution.harness.skillRoot)
    || resolve(journal.sidecarRoot) !== resolve(resolution.paths.sidecarRoot)
    || resolve(path) !== resolve(expectedPath)
    || basename(path) !== `${journal.transactionId}.json`) {
    throw new Error("Change abandon recovery journal does not match current project authority.");
  }
  assertTransactionId(journal.transactionId);
  canonicalProjectHarnessId(journal.changeId, "Change abandon journal Change id");
  const expectedCandidate = join(
    dirname(resolution.harness.skillRoot),
    `.${resolution.harness.skillName}.${journal.transactionId}.abandon-candidate`,
  );
  if (resolve(journal.candidateRoot) !== resolve(expectedCandidate)
    || resolve(journal.previousEvidenceRoot) !== resolve(join(expectedCandidate, "previous-active-evidence"))) {
    throw new Error("Change abandon recovery staging paths do not match transaction authority.");
  }
  const expectedActive = join(resolution.harness.skillRoot, "state", "changes", "active", journal.changeId);
  const expectedArchive = join(resolution.harness.skillRoot, "state", "changes", "archive", journal.changeId);
  const expectedChangeRecord = join(
    resolution.harness.skillRoot,
    "state",
    "registry",
    "changes",
    `${journal.changeId}.json`,
  );
  const expectedLane = join(
    resolution.harness.skillRoot,
    "state",
    "registry",
    "lanes",
    `${canonicalProjectHarnessId(journal.laneId, "Change abandon journal Lane id")}.json`,
  );
  const expectedIndex = join(resolution.harness.skillRoot, "state", "changes", "INDEX.json");
  if (resolve(journal.activeEvidenceRoot) !== resolve(expectedActive)
    || resolve(journal.archiveEvidenceRoot) !== resolve(expectedArchive)
    || resolve(journal.changeRecordPath) !== resolve(expectedChangeRecord)
    || resolve(journal.lanePath) !== resolve(expectedLane)
    || resolve(journal.indexPath) !== resolve(expectedIndex)) {
    throw new Error("Change abandon recovery artifact paths do not match current Skill authority.");
  }
  if (journal.conversationBefore.projectId !== journal.projectId
    || journal.conversationBefore.conversationId !== journal.conversationId
    || journal.conversationBefore.boundChangeId !== journal.changeId
    || journal.conversationBefore.currentGraphScopeId !== journal.graphScopeId
    || journal.graphScopeBefore.projectId !== journal.projectId
    || journal.graphScopeBefore.conversationId !== journal.conversationId
    || journal.graphScopeBefore.graphScopeId !== journal.graphScopeId
    || journal.graphScopeBefore.status !== "active"
    || journal.decisionBefore !== null
    || !matchesAbandonDecision(
      journal.decisionAfter,
      resolution,
      journal.conversationBefore,
      journal.changeId,
    )
    || journal.decisionAfter.createdAt !== journal.sidecarCommittedAt
    || journal.decisionAfter.updatedAt !== journal.sidecarCommittedAt
    || journal.decisionAfter.completedAt !== journal.sidecarCommittedAt
    || journal.decisionAfter.projectId !== journal.projectId
    || journal.decisionAfter.changeId !== journal.changeId
    || journal.decisionAfter.targetId !== journal.changeId
    || journal.decisionAfter.decisionType !== DECISION_TYPE
    || journal.decisionAfter.actionId !== DECISION_TYPE) {
    throw new Error("Change abandon recovery dynamic-state lineage does not match journal authority.");
  }
}

function assertPreparationBinding(
  resolution: ProjectRuntimeResolution,
  preparation: ProjectHarnessChangeAbandonmentPreparation,
  path: string,
): void {
  assertTransactionId(preparation.transactionId);
  const expectedPath = join(
    abandonmentTransactionsRoot(resolution),
    `${preparation.transactionId}.preparing.json`,
  );
  const expectedCandidate = join(
    dirname(resolution.harness.skillRoot),
    `.${resolution.harness.skillName}.${preparation.transactionId}.abandon-candidate`,
  );
  if (preparation.projectId !== resolution.harness.projectId
    || preparation.skillName !== resolution.harness.skillName
    || resolve(preparation.projectRoot) !== resolve(resolution.projectRoot)
    || resolve(preparation.skillRoot) !== resolve(resolution.harness.skillRoot)
    || resolve(preparation.sidecarRoot) !== resolve(resolution.paths.sidecarRoot)
    || resolve(preparation.candidateRoot) !== resolve(expectedCandidate)
    || resolve(path) !== resolve(expectedPath)) {
    throw new Error("Change abandon preparation record does not match current project authority.");
  }
}

async function assertRecoveryArtifactSafety(
  resolution: ProjectRuntimeResolution,
  journal: ProjectHarnessChangeAbandonmentJournal,
): Promise<void> {
  const expected = [
    [journal.activeEvidenceRoot, `state/changes/active/${journal.changeId}`, "active Change evidence"],
    [journal.archiveEvidenceRoot, `state/changes/archive/${journal.changeId}`, "archive Change evidence"],
    [journal.changeRecordPath, `state/registry/changes/${journal.changeId}.json`, "Change Registry record"],
    [journal.lanePath, `state/registry/lanes/${journal.laneId}.json`, "Change Lane record"],
    [journal.indexPath, "state/changes/INDEX.json", "Change INDEX"],
  ] as const;
  for (const [absolute, relativePath, label] of expected) {
    const safe = await resolveWithinPhysicalRoot(resolution.harness.skillRoot, relativePath, label);
    if (resolve(safe) !== resolve(absolute)) throw new Error(`${label} path changed after journal validation.`);
  }
  if (existsSync(journal.candidateRoot)) {
    await assertPhysicalTree(journal.candidateRoot, "Change abandon candidate");
  }
}

function assertTransactionId(value: string): void {
  if (!/^change-abandon-[a-z0-9-]+$/.test(value)) {
    throw new Error(`Invalid Change abandon transaction id: ${value}.`);
  }
}

async function restoreTextArtifact(path: string, before: string, after: string, label: string): Promise<void> {
  if (!existsSync(path)) throw new Error(`${label} disappeared during Change abandon rollback.`);
  const current = await readFile(path, "utf8");
  if (current !== before && current !== after) {
    throw new Error(`${label} changed outside the Change abandon transaction.`);
  }
  if (current !== before) await atomicWriteFile(path, before);
}

async function restoreOptionalTextArtifact(
  path: string,
  before: string | null,
  after: string,
  label: string,
): Promise<void> {
  if (!existsSync(path)) {
    if (before === null) return;
    throw new Error(`${label} disappeared during Change abandon rollback.`);
  }
  const current = await readFile(path, "utf8");
  if (current !== after && current !== before) {
    throw new Error(`${label} changed outside the Change abandon transaction.`);
  }
  if (before === null) await rm(path);
  else if (current !== before) await atomicWriteFile(path, before);
}

async function assertTextArtifact(path: string, expected: string, label: string): Promise<void> {
  if (!existsSync(path) || await readFile(path, "utf8") !== expected) throw new Error(`${label} does not match its transaction snapshot.`);
}

async function assertTextArtifactOneOf(path: string, expected: readonly string[], label: string): Promise<void> {
  if (!existsSync(path)) throw new Error(`${label} disappeared during Change abandon rollback.`);
  const current = await readFile(path, "utf8");
  if (!expected.includes(current)) throw new Error(`${label} changed outside the Change abandon transaction.`);
}

async function assertOptionalTextArtifactOneOf(
  path: string,
  expected: readonly (string | null)[],
  label: string,
): Promise<void> {
  if (!existsSync(path)) {
    if (expected.includes(null)) return;
    throw new Error(`${label} disappeared during Change abandon rollback.`);
  }
  const current = await readFile(path, "utf8");
  if (!expected.includes(current)) throw new Error(`${label} changed outside the Change abandon transaction.`);
}

async function assertOptionalTextArtifact(path: string, expected: string | null, label: string): Promise<void> {
  if (expected === null) {
    if (existsSync(path)) throw new Error(`${label} should be absent.`);
    return;
  }
  await assertTextArtifact(path, expected, label);
}

function resultFromJournal(
  journal: ProjectHarnessChangeAbandonmentJournal,
  index: ProjectHarnessChangeIndex,
  reason?: string,
): ProjectHarnessChangeAbandonmentResult {
  const archivePath = `state/changes/archive/${journal.changeId}`;
  return {
    status: "abandoned",
    transactionId: journal.transactionId,
    archivePath,
    change: {
      id: journal.changeId,
      state: "archived",
      updatedAt: journal.sidecarCommittedAt,
      closedAt: journal.sidecarCommittedAt,
      archivePath,
    },
    index,
    ...(reason ? { reason } : {}),
  };
}
