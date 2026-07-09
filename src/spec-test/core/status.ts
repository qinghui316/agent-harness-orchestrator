import { existsSync } from "node:fs";
import { join } from "node:path";
import { getWorktreeStatus } from "../../worktree/manager.js";
import { getLatestValidationSummary, listValidationResults } from "../../validation/artifacts.js";
import type {
  AcceptanceCriterion,
  ManagedProject,
  ResolvedMemory,
  SpecTestAcStatus,
  SpecTestCommandEvidence,
  SpecTestConfidence,
  SpecTestRef,
  SpecTestStatus,
  ValidationResult,
  ValidationStatus,
} from "../../types/index.js";
import { getActiveSpecTestContext, getSpecTestContextForChange, type SpecTestContext } from "./context.js";
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

export { createEmptySpecTests, getActiveSpecTestContext, getSpecTestContextForChange, readOrCreateSpecTests, readSpecTestsOrDefault };

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
  const current = await readOrCreateSpecTests(context.changeDir, context.changeId);
  const mappings = upsertSpecTestRefs(current.mappings, acId, refs.map(normalizeRef));
  await writeSpecTests(context.changeDir, { ...current, updatedAt: new Date().toISOString(), mappings });
  return getSpecTestStatus(project, { changeId: context.changeId });
}

export async function unlinkSpecTest(project: ManagedProject, options: SpecTestLinkOptions): Promise<SpecTestStatus> {
  const context = await getActiveSpecTestContext(project);
  const refs = buildRefs(options);
  const acId = normalizeAcId(options.ac);
  assertKnownAc(acId, context.criteria);
  const current = await readOrCreateSpecTests(context.changeDir, context.changeId);
  const mappings = removeSpecTestRefs(current.mappings, acId, refs);
  await writeSpecTests(context.changeDir, { ...current, updatedAt: new Date().toISOString(), mappings });
  return getSpecTestStatus(project);
}

export async function getSpecTestStatus(project: ManagedProject | ResolvedMemory, options: SpecTestStatusOptions = {}): Promise<SpecTestStatus> {
  const context = options.changeId
    ? await getSpecTestContextForChange(project, options.changeId)
    : await getActiveSpecTestContext(project);
  return buildSpecTestStatus(context, options);
}

async function buildSpecTestStatus(context: SpecTestContext, options: SpecTestStatusOptions = {}): Promise<SpecTestStatus> {
  const specTests = await readSpecTestsOrDefault(context.changeDir, context.changeId);
  const selected = await selectValidationContext(context.memory, context.changeId, options.worktreeId);
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
    } : await getLatestValidationSummary(context.memory, context.changeId, options.worktreeId ? { worktreeId: options.worktreeId } : {}),
    mappings: specTests.mappings,
    acceptanceCriteria,
    warnings: uniqueSorted(warnings),
    blockingIssues: uniqueSorted(blockingIssues),
  };
}

export async function checkSpecTests(project: ManagedProject | ResolvedMemory, options: SpecTestStatusOptions = {}): Promise<SpecTestStatus> {
  return getSpecTestStatus(project, options);
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
  if (testName && !file) {
    throw new Error("--test-name must be paired with --file.");
  }
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

async function selectValidationContext(memory: ResolvedMemory, changeId: string, worktreeId?: string): Promise<{ root: string; worktreeId?: string; validation: ValidationResult | null }> {
  if (worktreeId) {
    const worktree = await getWorktreeStatus(memory, worktreeId);
    if (worktree.changeId !== changeId) throw new Error(`Worktree ${worktreeId} belongs to change ${worktree.changeId}, not ${changeId}.`);
    const validation = (await listValidationResults(memory, changeId)).find((item) => item.worktreeId === worktreeId) ?? null;
    return { root: worktree.checkoutPath, worktreeId, validation };
  }
  const validation = (await listValidationResults(memory, changeId))[0] ?? null;
  if (validation?.worktreeId) {
    const worktree = await getWorktreeStatus(memory, validation.worktreeId);
    return { root: worktree.checkoutPath, worktreeId: validation.worktreeId, validation };
  }
  return { root: memory.projectRoot, validation };
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

