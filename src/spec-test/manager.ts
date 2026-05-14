import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { isAbsolute, join, normalize } from "node:path";
import { z } from "zod";
import { parseAcceptanceCriteria } from "../ecl/anchors.js";
import { readRequiredJsonFile, writeJsonFile } from "../fs/json.js";
import { resolveProjectMemory } from "../memory/resolver.js";
import { getWorktreeStatus } from "../worktree/manager.js";
import { getLatestValidationSummary, listValidationResults } from "../validation/artifacts.js";
import type {
  AcceptanceCriterion,
  ManagedProject,
  ResolvedMemory,
  SpecTestAcStatus,
  SpecTestCommandEvidence,
  SpecTestConfidence,
  SpecTestMapping,
  SpecTestRef,
  SpecTests,
  SpecTestStatus,
  ValidationResult,
  ValidationStatus,
} from "../types/index.js";
import { readFile } from "node:fs/promises";

const specTestRefSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("file"), path: z.string() }),
  z.object({ type: z.literal("testName"), name: z.string(), path: z.string() }),
  z.object({ type: z.literal("command"), commandName: z.string() }),
  z.object({ type: z.literal("note"), text: z.string() }),
]);

const specTestMappingSchema = z.object({
  acId: z.string(),
  refs: z.array(specTestRefSchema),
});

const specTestsSchema = z.object({
  version: z.literal("1.0"),
  changeId: z.string(),
  updatedAt: z.string(),
  mappings: z.array(specTestMappingSchema),
});

export interface SpecTestLinkOptions {
  ac: string;
  file?: string;
  testName?: string;
  command?: string;
  note?: string;
}

export interface SpecTestStatusOptions {
  worktreeId?: string;
}

export async function createEmptySpecTests(changeDir: string, changeId: string): Promise<SpecTests> {
  const specTests: SpecTests = {
    version: "1.0",
    changeId,
    updatedAt: new Date().toISOString(),
    mappings: [],
  };
  await writeJsonFile(join(changeDir, "spec-tests.json"), specTests);
  return specTests;
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
  existingContext?: Awaited<ReturnType<typeof getActiveSpecTestContext>>,
): Promise<SpecTestStatus> {
  const context = existingContext ?? await getActiveSpecTestContext(project);
  const acId = normalizeAcId(ac);
  assertKnownAc(acId, context.criteria);
  const current = await readOrCreateSpecTests(context.changeDir, context.changeId);
  const mappings = upsertRefs(current.mappings, acId, refs.map(normalizeRef));
  await writeSpecTests(context.changeDir, { ...current, updatedAt: new Date().toISOString(), mappings });
  return getSpecTestStatus(project);
}

export async function unlinkSpecTest(project: ManagedProject, options: SpecTestLinkOptions): Promise<SpecTestStatus> {
  const context = await getActiveSpecTestContext(project);
  const refs = buildRefs(options);
  const acId = normalizeAcId(options.ac);
  assertKnownAc(acId, context.criteria);
  const current = await readOrCreateSpecTests(context.changeDir, context.changeId);
  const mappings = removeRefs(current.mappings, acId, refs);
  await writeSpecTests(context.changeDir, { ...current, updatedAt: new Date().toISOString(), mappings });
  return getSpecTestStatus(project);
}

export async function getSpecTestStatus(project: ManagedProject | ResolvedMemory, options: SpecTestStatusOptions = {}): Promise<SpecTestStatus> {
  const context = await getActiveSpecTestContext(project);
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

export async function getActiveSpecTestContext(project: ManagedProject | ResolvedMemory): Promise<{
  memory: ResolvedMemory;
  changeId: string;
  changeDir: string;
  criteria: AcceptanceCriterion[];
}> {
  const memory = "harnessRoot" in project ? project : await resolveProjectMemory(project);
  const activeRoot = join(memory.changesRoot, "active");
  if (!existsSync(activeRoot)) {
    throw new Error("Cannot resolve spec-test context: no active change found.");
  }
  const { getActiveChanges } = await import("../ecl/index.js");
  const active = await getActiveChanges(memory);
  if (active.length !== 1) {
    throw new Error(`Expected exactly one active change; found ${active.length}.`);
  }
  const changeId = active[0].name;
  const changeDir = join(memory.memoryRoot, active[0].path);
  const specPath = join(changeDir, "spec.md");
  if (!existsSync(specPath)) {
    throw new Error(`Cannot resolve spec-test context: missing spec.md for ${changeId}.`);
  }
  const specContent = await readFile(specPath, "utf8");
  const criteria = parseAcceptanceCriteria(specContent).criteria.map((criterion) => ({
    id: criterion.id,
    text: criterion.text,
    taskIds: [],
    validationRefs: [],
    warnings: [],
  }));
  return { memory, changeId, changeDir, criteria };
}

export async function readOrCreateSpecTests(changeDir: string, changeId: string): Promise<SpecTests> {
  const path = join(changeDir, "spec-tests.json");
  if (!existsSync(path)) return createEmptySpecTests(changeDir, changeId);
  const parsed = await readRequiredJsonFile(path, specTestsSchema) as SpecTests;
  if (parsed.changeId !== changeId) {
    throw new Error(`spec-tests.json changeId mismatch. Expected ${changeId}; found ${parsed.changeId}.`);
  }
  return normalizeSpecTests(parsed);
}

export async function readSpecTestsOrDefault(changeDir: string, changeId: string): Promise<SpecTests> {
  const path = join(changeDir, "spec-tests.json");
  if (!existsSync(path)) {
    return { version: "1.0", changeId, updatedAt: new Date(0).toISOString(), mappings: [] };
  }
  const parsed = await readRequiredJsonFile(path, specTestsSchema) as SpecTests;
  if (parsed.changeId !== changeId) {
    throw new Error(`spec-tests.json changeId mismatch. Expected ${changeId}; found ${parsed.changeId}.`);
  }
  return normalizeSpecTests(parsed);
}

async function writeSpecTests(changeDir: string, value: SpecTests): Promise<void> {
  await mkdir(changeDir, { recursive: true });
  await writeJsonFile(join(changeDir, "spec-tests.json"), normalizeSpecTests(value));
}

function normalizeSpecTests(value: SpecTests): SpecTests {
  return {
    ...value,
    mappings: value.mappings
      .map((mapping) => ({
        acId: normalizeAcId(mapping.acId),
        refs: dedupeRefs(mapping.refs.map(normalizeRef)),
      }))
      .filter((mapping) => mapping.refs.length > 0)
      .sort((a, b) => a.acId.localeCompare(b.acId)),
  };
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
  return dedupeRefs(refs);
}

function normalizeRef(ref: SpecTestRef): SpecTestRef {
  if (ref.type === "file") return { type: "file", path: normalizeSafeRepoPath(ref.path) };
  if (ref.type === "testName") return { type: "testName", name: ref.name.trim(), path: normalizeSafeRepoPath(ref.path) };
  if (ref.type === "command") return { type: "command", commandName: ref.commandName.trim() };
  return { type: "note", text: ref.text.trim() };
}

function normalizeSafeRepoPath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) throw new Error("Evidence file path cannot be empty.");
  if (isAbsolute(trimmed)) throw new Error(`Evidence file path must be repo-relative: ${path}.`);
  if (trimmed.split(/[\\/]+/).includes("..")) throw new Error(`Evidence file path must not escape the project root: ${path}.`);
  const normalized = normalize(trimmed).replace(/\\/g, "/");
  if (normalized === "." || normalized.startsWith("../") || normalized === ".." || normalized.includes("/../")) {
    throw new Error(`Evidence file path must not escape the project root: ${path}.`);
  }
  return normalized;
}

function normalizeAcId(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!/^AC-\d{3,}$/.test(normalized)) throw new Error(`Invalid Acceptance Criterion ID: ${value}.`);
  return normalized;
}

function assertKnownAc(acId: string, criteria: AcceptanceCriterion[]): void {
  if (!criteria.some((criterion) => criterion.id === acId)) {
    throw new Error(`Unknown Acceptance Criterion: ${acId}.`);
  }
}

function upsertRefs(mappings: SpecTestMapping[], acId: string, refs: SpecTestRef[]): SpecTestMapping[] {
  const existing = mappings.find((mapping) => mapping.acId === acId);
  if (!existing) return normalizeSpecTests({ version: "1.0", changeId: "", updatedAt: "", mappings: [...mappings, { acId, refs }] }).mappings;
  return normalizeSpecTests({
    version: "1.0",
    changeId: "",
    updatedAt: "",
    mappings: mappings.map((mapping) => mapping.acId === acId ? { ...mapping, refs: [...mapping.refs, ...refs] } : mapping),
  }).mappings;
}

function removeRefs(mappings: SpecTestMapping[], acId: string, refs: SpecTestRef[]): SpecTestMapping[] {
  const keys = new Set(refs.map(refKey));
  return normalizeSpecTests({
    version: "1.0",
    changeId: "",
    updatedAt: "",
    mappings: mappings.map((mapping) => mapping.acId === acId
      ? { ...mapping, refs: mapping.refs.filter((ref) => !keys.has(refKey(ref))) }
      : mapping),
  }).mappings;
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

function dedupeRefs(refs: SpecTestRef[]): SpecTestRef[] {
  const seen = new Set<string>();
  const result: SpecTestRef[] = [];
  for (const ref of refs) {
    const key = refKey(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(ref);
  }
  return result.sort((a, b) => refKey(a).localeCompare(refKey(b)));
}

function refKey(ref: SpecTestRef): string {
  if (ref.type === "file") return `file:${ref.path}`;
  if (ref.type === "testName") return `testName:${ref.path}:${ref.name}`;
  if (ref.type === "command") return `command:${ref.commandName}`;
  return `note:${ref.text}`;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}
