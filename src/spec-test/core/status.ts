import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { getGitCommit, gitRaw } from "../../project/git.js";
import { SourceFingerprintSnapshot } from "../../project-harness/source-fingerprint.js";
import { withProjectHarnessWriterLock } from "../../project-harness/writer-lock.js";
import type {
  AcceptanceCriterion,
  ManagedProject,
  SpecTestAcStatus,
  SpecTestCommandEvidence,
  SpecTestConfidence,
  SpecTestMapping,
  SpecTestRef,
  SpecTestStatus,
  SpecTests,
  ValidationResult,
  ValidationStatus,
} from "../../types/index.js";
import { getLatestValidationSummary, listValidationResults } from "../../validation/repository.js";
import { getWorktreeStatus } from "../../worktree/status.js";
import { openProjectRuntimeWorkbenchDatabase } from "../../workbench/persistence/open-workbench-database.js";
import { getActiveSpecTestContext, getSpecTestContextForChange, requireActiveSpecTestExecutionAuthorization, type SpecTestContext } from "./context.js";
import {
  createEmptySpecTests,
  normalizeAcId,
  normalizeRef,
  normalizeSafeRepoPath,
  readOrCreateSpecTests,
  readSpecTestsOrDefault,
  removeSpecTestRefs,
  upsertSpecTestRefs,
  writeSpecTests,
} from "./repository.js";

export { createEmptySpecTests, getActiveSpecTestContext, getSpecTestContextForChange, readOrCreateSpecTests, readSpecTestsOrDefault, requireActiveSpecTestExecutionAuthorization };

export interface SpecTestLinkOptions {
  ac: string;
  file?: string;
  testName?: string;
  command?: string;
  note?: string;
}

export interface SpecTestStatusOptions {
  worktreeId?: string;
  changeId?: string;
}

export async function linkSpecTest(project: ManagedProject, options: SpecTestLinkOptions): Promise<SpecTestStatus> {
  const context = await getActiveSpecTestContext(project);
  const refs = buildRefs(options);
  const acId = normalizeAcId(options.ac);
  return linkSpecTestRefs(project, acId, refs, context);
}

export async function linkSpecTestRefs(
  project: ManagedProject,
  ac: string,
  refs: SpecTestRef[],
  existingContext?: SpecTestContext,
): Promise<SpecTestStatus> {
  const context = existingContext ?? await getActiveSpecTestContext(project);
  const acId = normalizeAcId(ac);
  assertKnownAc(acId, context.criteria);
  await mutateSpecTestMappings(project, context, (mappings) =>
    upsertSpecTestRefs(mappings, acId, refs.map(normalizeRef)));
  return getSpecTestStatus(project, { changeId: context.changeId });
}

export async function linkSpecTestEvidenceBatch(
  project: ManagedProject,
  changeId: string,
  evidence: Array<{ acId: string; refs: SpecTestRef[] }>,
  expectedEvidenceFingerprint?: string,
  publication?: SpecTestMappingPublicationHooks,
): Promise<SpecTestStatus> {
  const context = await getSpecTestContextForChange(project, changeId);
  for (const item of evidence) assertKnownAc(normalizeAcId(item.acId), context.criteria);
  await mutateSpecTestMappings(project, context, (current) => evidence.reduce(
    (mappings, item) => upsertSpecTestRefs(
      mappings,
      normalizeAcId(item.acId),
      item.refs.map(normalizeRef),
    ),
    current,
  ), expectedEvidenceFingerprint, publication, true);
  return getSpecTestStatus(project, { changeId });
}

export interface SpecTestMappingPublicationHooks {
  prepare(before: SpecTests, after: SpecTests): Promise<void>;
  committed(after: SpecTests): Promise<void>;
  rollback(): Promise<void>;
}

export async function unlinkSpecTest(project: ManagedProject, options: SpecTestLinkOptions): Promise<SpecTestStatus> {
  const context = await getActiveSpecTestContext(project);
  const refs = buildRefs(options);
  const acId = normalizeAcId(options.ac);
  assertKnownAc(acId, context.criteria);
  await mutateSpecTestMappings(project, context, (mappings) => removeSpecTestRefs(mappings, acId, refs));
  return getSpecTestStatus(project);
}

export async function getSpecTestStatus(project: ManagedProject, options: SpecTestStatusOptions = {}): Promise<SpecTestStatus> {
  const context = options.changeId
    ? await getSpecTestContextForChange(project, options.changeId)
    : await getActiveSpecTestContext(project);
  return buildSpecTestStatus(context, options);
}

async function buildSpecTestStatus(context: SpecTestContext, options: SpecTestStatusOptions = {}): Promise<SpecTestStatus> {
  const specTests = await readSpecTestsOrDefault(context.evidenceRoot, context.changeId);
  const selected = await selectValidationContext(context, options.worktreeId);
  const commandStatuses = selected.validation ? commandStatusMap(selected.validation) : new Map<string, ValidationStatus>();
  const warnings: string[] = [];
  const blockingIssues: string[] = [];
  const mappingsByAc = new Map(specTests.mappings.map((mapping) => [mapping.acId, mapping.refs]));

  for (const mapping of specTests.mappings) {
    if (!context.criteria.some((criterion) => criterion.id === mapping.acId)) {
      blockingIssues.push(`spec-tests.json references unknown Acceptance Criterion ${mapping.acId}.`);
    }
  }

  const acceptanceCriteria: SpecTestAcStatus[] = context.criteria.map((criterion) => {
    const refs = mappingsByAc.get(criterion.id) ?? [];
    const result = evaluateAcEvidence({
      criterion,
      refs,
      selectedRoot: selected.root,
      latestValidationStatus: selected.validation?.status ?? null,
      commandStatuses,
    });
    warnings.push(...result.warnings);
    blockingIssues.push(...result.blockingIssues);
    return result;
  });

  return {
    version: "1.0",
    changeId: context.changeId,
    selectedRoot: selected.root,
    selectedWorktreeId: selected.worktreeId,
    latestValidation: selected.validation ? {
      id: selected.validation.id,
      runId: selected.validation.runId,
      changeId: selected.validation.changeId,
      profile: selected.validation.profile,
      status: selected.validation.status,
      executionMode: selected.validation.executionMode,
      worktreeId: selected.validation.worktreeId,
      worktreeDiffHash: selected.validation.worktreeDiffHash,
      startedAt: selected.validation.startedAt,
      finishedAt: selected.validation.finishedAt,
      commandCount: selected.validation.commands.length,
    } : await getLatestValidationSummary(context.runtime, context.changeId, options.worktreeId ? { worktreeId: options.worktreeId } : {}),
    mappings: specTests.mappings,
    acceptanceCriteria,
    warnings: uniqueSorted(warnings),
    blockingIssues: uniqueSorted(blockingIssues),
  };
}

export async function checkSpecTests(project: ManagedProject, options: SpecTestStatusOptions = {}): Promise<SpecTestStatus> {
  return getSpecTestStatus(project, options);
}

export async function getSpecTestEvidenceFingerprint(project: ManagedProject, changeId: string): Promise<string> {
  const context = await getSpecTestContextForChange(project, changeId);
  const sourceFiles = await listCurrentSourceFiles(context.projectRoot);
  const sourceSnapshot = new SourceFingerprintSnapshot({ projectRoot: context.projectRoot });
  const [specTests, commit, sourceSnapshotDigest, actionDecisions] = await Promise.all([
    readSpecTestsOrDefault(context.evidenceRoot, changeId),
    getGitCommit(context.projectRoot),
    strictSourceSnapshotDigest(sourceSnapshot, sourceFiles),
    readSpecTestActionDecisions(context),
  ]);
  return createHash("sha256").update(stableJson({
    projectId: context.projectId,
    changeId,
    conversationId: context.conversationId,
    graphScopeId: context.graphScopeId,
    projectHarnessContentFingerprint: context.projectHarness.contentFingerprint,
    planningEvidenceDigest: context.planningEvidenceDigest,
    authorizationIntent: context.planning.authorizationIntent,
    sourceCommit: commit,
    sourceSnapshotDigest,
    specTests,
    actionDecisions,
  }), "utf8").digest("hex");
}

async function listCurrentSourceFiles(projectRoot: string): Promise<string[]> {
  const output = await gitRaw(projectRoot, ["ls-files", "--cached", "--others", "--exclude-standard", "-z"]);
  return [...new Set(output.toString("utf8").split("\0").filter(Boolean))].sort();
}

async function strictSourceSnapshotDigest(
  snapshot: SourceFingerprintSnapshot,
  sources: readonly string[],
): Promise<string> {
  await snapshot.prime(sources);
  for (const source of sources) {
    const result = await snapshot.result(source);
    if (result.status === "invalid") {
      throw new Error(`Spec-Test source fingerprint rejected an invalid link or path: ${source}.`);
    }
  }
  return snapshot.digest(sources);
}

async function readSpecTestActionDecisions(context: SpecTestContext): Promise<Array<{
  id: string;
  decisionType: string;
  status: string;
  targetId: string | null;
  actionId: string | null;
  payloadHash: string;
  completedAt: string | null;
}>> {
  const database = await openProjectRuntimeWorkbenchDatabase(context.runtime);
  try {
    return database.decisions.listDecisions(context.projectId, context.changeId)
      .filter((decision) => decision.decisionType.startsWith("spec-test."))
      .map((decision) => ({
        id: decision.id,
        decisionType: decision.decisionType,
        status: decision.status,
        targetId: decision.targetId,
        actionId: decision.actionId,
        payloadHash: createHash("sha256").update(decision.payloadJson, "utf8").digest("hex"),
        completedAt: decision.completedAt,
      }))
      .sort((left, right) => left.id.localeCompare(right.id));
  } finally {
    database.close();
  }
}

function buildRefs(options: SpecTestLinkOptions): SpecTestRef[] {
  const refs: SpecTestRef[] = [];
  const file = options.file?.trim();
  const command = options.command?.trim();
  const note = options.note?.trim();
  const testName = options.testName?.trim();
  if (!file && !command && !note) {
    throw new Error("Provide at least one evidence option: --file, --command, or --note.");
  }
  if (testName && !file) throw new Error("--test-name must be paired with --file.");
  if (file) {
    refs.push({ type: "file", path: normalizeSafeRepoPath(file) });
    if (testName) refs.push({ type: "testName", name: testName, path: normalizeSafeRepoPath(file) });
  }
  if (command) refs.push({ type: "command", commandName: command });
  if (note) refs.push({ type: "note", text: note });
  return refs.map(normalizeRef);
}

function assertKnownAc(acId: string, criteria: AcceptanceCriterion[]): void {
  if (!criteria.some((criterion) => criterion.id === acId)) {
    throw new Error(`Unknown Acceptance Criterion: ${acId}.`);
  }
}

async function selectValidationContext(context: SpecTestContext, worktreeId?: string): Promise<{ root: string; worktreeId?: string; validation: ValidationResult | null }> {
  if (worktreeId) {
    const worktree = await getWorktreeStatus(context.runtime, worktreeId);
    if (worktree.changeId !== context.changeId) {
      throw new Error(`Worktree ${worktreeId} belongs to change ${worktree.changeId}, not ${context.changeId}.`);
    }
    const validation = (await listValidationResults(context.runtime, context.changeId))
      .find((item) => item.worktreeId === worktreeId) ?? null;
    return { root: worktree.checkoutPath, worktreeId, validation };
  }
  const validation = (await listValidationResults(context.runtime, context.changeId))[0] ?? null;
  if (validation?.worktreeId) {
    const worktree = await getWorktreeStatus(context.runtime, validation.worktreeId);
    return { root: worktree.checkoutPath, worktreeId: validation.worktreeId, validation };
  }
  return { root: context.projectRoot, validation };
}

async function mutateSpecTestMappings(
  project: ManagedProject,
  expected: SpecTestContext,
  update: (mappings: SpecTestMapping[]) => SpecTestMapping[],
  expectedEvidenceFingerprint?: string,
  publication?: SpecTestMappingPublicationHooks,
  requireExecutionAuthorization = false,
): Promise<void> {
  await withProjectHarnessWriterLock(expected.writerRoot, {
    projectId: expected.projectId,
    ownerId: `spec-test-map:${expected.conversationId}:${expected.changeId}`,
    operation: "spec-test-map",
  }, async (lock) => {
    await lock.assertCurrent();
    const currentContext = await getSpecTestContextForChange(project, expected.changeId);
    if (currentContext.projectId !== expected.projectId
      || currentContext.conversationId !== expected.conversationId
      || currentContext.graphScopeId !== expected.graphScopeId
      || currentContext.planningEvidenceDigest !== expected.planningEvidenceDigest
      || currentContext.projectHarness.contentFingerprint !== expected.projectHarness.contentFingerprint) {
      throw new Error("Spec-Test mapping scope changed before publication.");
    }
    if (expectedEvidenceFingerprint
      && await getSpecTestEvidenceFingerprint(project, expected.changeId) !== expectedEvidenceFingerprint) {
      throw new Error("Spec-Test evidence or source scope changed before publication.");
    }
    if (requireExecutionAuthorization) {
      await requireActiveSpecTestExecutionAuthorization(currentContext);
    }
    const current = await readOrCreateSpecTests(currentContext.evidenceRoot, currentContext.changeId);
    const next: SpecTests = {
      ...current,
      updatedAt: new Date().toISOString(),
      mappings: update(current.mappings),
    };
    await publication?.prepare(current, next);
    try {
      await writeSpecTests(currentContext.evidenceRoot, next);
      await publication?.committed(next);
    } catch (error) {
      let mappingRestored = false;
      try {
        await writeSpecTests(currentContext.evidenceRoot, current);
        mappingRestored = true;
      } finally {
        if (mappingRestored) await publication?.rollback().catch(() => undefined);
      }
      throw error;
    }
  });
}

function commandStatusMap(validation: ValidationResult): Map<string, ValidationStatus> {
  const map = new Map<string, ValidationStatus>();
  for (const command of validation.commands) map.set(command.name, command.status);
  return map;
}

function evaluateAcEvidence(input: {
  criterion: AcceptanceCriterion;
  refs: SpecTestRef[];
  selectedRoot: string;
  latestValidationStatus: ValidationStatus | null;
  commandStatuses: Map<string, ValidationStatus>;
}): SpecTestAcStatus {
  const warnings: string[] = [];
  const blockingIssues: string[] = [];
  const linkedEvidence = input.refs.length > 0;
  if (!linkedEvidence) warnings.push(`${input.criterion.id} has no linked test evidence.`);
  let evidenceFilesExist = true;
  for (const ref of input.refs) {
    if ((ref.type === "file" || ref.type === "testName") && !existsSync(join(input.selectedRoot, ref.path))) {
      evidenceFilesExist = false;
      blockingIssues.push(`${input.criterion.id} references missing evidence file: ${ref.path}.`);
    }
  }
  const commandEvidence: SpecTestCommandEvidence[] = input.refs
    .filter((ref): ref is Extract<SpecTestRef, { type: "command" }> => ref.type === "command")
    .map((ref) => {
      const validationStatus = input.commandStatuses.get(ref.commandName) ?? "missing";
      if (validationStatus === "missing") warnings.push(`${input.criterion.id} references validation command not found in selected validation: ${ref.commandName}.`);
      return { commandName: ref.commandName, validationStatus };
    });
  return {
    acId: input.criterion.id,
    text: input.criterion.text,
    linkedEvidence,
    evidenceFilesExist,
    latestValidationStatus: input.latestValidationStatus,
    commandEvidence,
    confidence: confidence({ linkedEvidence, evidenceFilesExist, latestValidationStatus: input.latestValidationStatus, commandEvidence }),
    refs: input.refs,
    warnings: uniqueSorted(warnings),
    blockingIssues: uniqueSorted(blockingIssues),
  };
}

function confidence(input: {
  linkedEvidence: boolean;
  evidenceFilesExist: boolean;
  latestValidationStatus: ValidationStatus | null;
  commandEvidence: SpecTestCommandEvidence[];
}): SpecTestConfidence {
  if (!input.evidenceFilesExist) return "invalid";
  if (!input.linkedEvidence) return "none";
  if (input.latestValidationStatus === "failed") return "stale";
  if (input.commandEvidence.some((item) => item.validationStatus === "passed")) return "validation-passed";
  if (input.commandEvidence.some((item) => item.validationStatus === "failed" || item.validationStatus === "missing")) return "stale";
  return "linked-only";
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
