import { existsSync } from "node:fs";
import { mkdir, readFile, rename } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { z } from "zod";
import { buildAcMap, parseReviewStatus } from "../ecl/anchors.js";
import { getActiveChanges, writeChangeIndex } from "../ecl/index.js";
import { atomicWriteFile, readRequiredJsonFile, writeJsonFile } from "../fs/json.js";
import { slugify } from "../fs/path.js";
import { assertWritableMemory, resolveMemory, resolveProjectMemory } from "../memory/resolver.js";
import { getTemplateRoot } from "../template-source/paths.js";
import { getLatestAuditSummary } from "../audit/artifacts.js";
import { getLatestValidationSummary } from "../validation/artifacts.js";
import { listWorktreesForChange } from "../worktree/manager.js";
import { isGitDirty } from "../project/git.js";
import { createEmptySpecTests, getSpecTestStatus } from "../spec-test/manager.js";
import type {
  AcMap,
  ChangeIndex,
  ChangeIndexItem,
  ChangeMetadata,
  ChangeStatus,
  CloseGateResult,
  ManagedProject,
  ResolvedMemory,
  ReviewStatus,
} from "../types/index.js";

const requiredChangeFiles = [
  "summary.md",
  "spec.md",
  "plan.md",
  "tasks.md",
  "reviews/review.md",
] as const;

const changeMetadataSchema = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  title: z.string(),
  state: z.enum(["active", "archived"]),
  createdAt: z.string(),
  updatedAt: z.string(),
  closedAt: z.string().nullable(),
  archivePath: z.string().nullable(),
});

export interface ChangeCreateResult {
  change: ChangeMetadata;
  path: string;
  acMap: AcMap;
  index: ChangeIndex;
}

export interface ChangeCloseResult {
  archivePath: string;
  change: ChangeMetadata;
  index: ChangeIndex;
}

export async function createChange(project: ManagedProject, options: { title: string; body?: string }): Promise<ChangeCreateResult> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Change creation");
  const activeChanges = await getActiveChanges(memory);
  if (activeChanges.length > 0) {
    throw new Error(`Cannot create a new change while an active change exists: ${activeChanges[0]?.name}.`);
  }

  const id = slugify(options.title);
  const changePath = join(memory.changesRoot, "active", id);
  const relativePath = displayPath(memory, changePath);
  if (existsSync(changePath)) {
    throw new Error(`Change already exists: ${relativePath}.`);
  }

  await mkdir(join(changePath, "reviews"), { recursive: true });
  const templateRoot = getChangeTemplateRoot(memory);
  for (const file of requiredChangeFiles) {
    const content = await renderTemplate(templateRoot, file, options.title);
    await atomicWriteFile(join(changePath, file), normalizeInitialContent(file, content, options.body));
  }

  const now = new Date().toISOString();
  const change: ChangeMetadata = {
    version: "1.0",
    id,
    title: options.title,
    state: "active",
    createdAt: now,
    updatedAt: now,
    closedAt: null,
    archivePath: null,
  };
  await writeJsonFile(join(changePath, "change.json"), change);
  await createEmptySpecTests(changePath, id);

  const status = await getChangeStatus(project);
  if (!status.acMap) {
    throw new Error("Failed to build ac-map.json for the new change.");
  }
  const index = await writeChangeIndex(memory);
  return { change, path: relativePath, acMap: status.acMap, index };
}

export async function getChangeStatus(project: ManagedProject | string | ResolvedMemory): Promise<ChangeStatus> {
  const memory = await resolveChangeMemory(project);
  const activeChanges = await getActiveChanges(memory);
  const baseGate = evaluateActiveCount(activeChanges);
  if (activeChanges.length !== 1) {
    return {
      projectPath: memory.projectRoot,
      activeChanges,
      change: null,
      reviewStatus: "missing",
      acMap: null,
      specTest: null,
      latestValidation: null,
      latestAudit: null,
      closeGate: baseGate,
    };
  }

  const active = activeChanges[0];
  const changePath = join(memory.memoryRoot, active.path);
  const missingFiles = getMissingRequiredFiles(changePath);
  const warnings: string[] = [];
  const blockingIssues = [...baseGate.blockingIssues];

  for (const file of missingFiles) {
    blockingIssues.push(`Missing required change file: ${file}.`);
  }

  const change = await readChangeMetadata(changePath);
  if (!change) {
    blockingIssues.push("Missing or invalid change.json.");
  }

  const contents = await readChangeContents(changePath);
  const reviewStatus = parseReviewStatus(contents["reviews/review.md"]);
  const acMap = contents["spec.md"] !== null && contents["tasks.md"] !== null
    ? buildAcMap({
      changeId: active.name,
      specContent: contents["spec.md"],
      tasksContent: contents["tasks.md"],
      placeholderFiles: buildPlaceholderFiles(contents),
    })
    : null;

  if (acMap) {
    await writeJsonFile(join(changePath, "ac-map.json"), acMap);
    warnings.push(...acMap.warnings);
    blockingIssues.push(...acMap.blockingIssues);
  }

  const specTest = change ? await getSpecTestStatusForMemory(memory) : null;
  if (specTest) {
    warnings.push(...specTest.warnings);
    blockingIssues.push(...specTest.blockingIssues);
  }

  blockingIssues.push(...reviewBlockingIssues(reviewStatus));
  if (change) {
    const latestValidation = await getLatestValidationSummary(memory, change.id);
    if (!latestValidation) {
      warnings.push("No validation run recorded for this change.");
    } else if (latestValidation.status === "failed") {
      blockingIssues.push(`Latest validation failed: ${latestValidation.id}.`);
    }
    const latestAudit = await getLatestAuditSummary(memory, change.id);
    if (!latestAudit) {
      warnings.push("No audit run recorded for this change.");
    } else if (latestAudit.status === "blocked") {
      blockingIssues.push(`Latest audit blocked close: ${latestAudit.id}.`);
    } else if (latestAudit.status === "failed") {
      warnings.push(`Latest audit failed or could not be parsed: ${latestAudit.id}.`);
    }
    const worktrees = await listWorktreesForChange(memory, change.id);
    const hasAppliedWorktree = worktrees.some((worktree) => worktree.status === "applied");
    if (hasAppliedWorktree && (await isGitDirty(memory.projectRoot)) === true) {
      blockingIssues.push("Source repo has uncommitted changes after apply; commit or clean the source repo before closing the change.");
    }
    for (const worktree of worktrees) {
      if (worktree.status === "applied") {
        warnings.push(`Applied worktree remains available for cleanup: ${worktree.worktreeId}.`);
      } else if (worktree.dirty) {
        blockingIssues.push(`Dirty worktree blocks close: ${worktree.worktreeId} (${worktree.checkoutPath}).`);
      } else {
        warnings.push(`Active change has AHO-managed worktree: ${worktree.worktreeId}.`);
      }
    }
    return {
      projectPath: memory.projectRoot,
      activeChanges,
      change,
      reviewStatus,
      acMap,
      specTest,
      latestValidation,
      latestAudit,
      closeGate: {
        ready: blockingIssues.length === 0,
        warnings: uniqueSorted(warnings),
        blockingIssues: uniqueSorted(blockingIssues),
      },
    };
  }

  return {
    projectPath: memory.projectRoot,
    activeChanges,
    change,
    reviewStatus,
    acMap,
    specTest,
    latestValidation: null,
    latestAudit: null,
    closeGate: {
      ready: blockingIssues.length === 0,
      warnings: uniqueSorted(warnings),
      blockingIssues: uniqueSorted(blockingIssues),
    },
  };
}

export async function closeChange(project: ManagedProject | string): Promise<ChangeCloseResult> {
  const memory = await resolveChangeMemory(project);
  assertWritableMemory(memory, "Change close");
  const status = await getChangeStatus(memory);
  if (!status.closeGate.ready) {
    throw new Error(`Cannot close change:\n${status.closeGate.blockingIssues.map((issue) => `- ${issue}`).join("\n")}`);
  }
  if (!status.change || status.activeChanges.length !== 1) {
    throw new Error("Cannot close change: expected exactly one active change with valid metadata.");
  }

  const active = status.activeChanges[0];
  const activePath = join(memory.memoryRoot, active.path);
  const archiveRelativePath = await getArchiveRelativePath(memory, status.change.id);
  const archivePath = join(memory.memoryRoot, archiveRelativePath);
  const now = new Date().toISOString();
  const updated: ChangeMetadata = {
    ...status.change,
    state: "archived",
    updatedAt: now,
    closedAt: now,
    archivePath: archiveRelativePath,
  };

  await writeJsonFile(join(activePath, "change.json"), updated);
  await mkdir(dirname(archivePath), { recursive: true });
  await rename(activePath, archivePath);
  const index = await writeChangeIndex(memory);
  return { archivePath: archiveRelativePath, change: updated, index };
}

function evaluateActiveCount(activeChanges: ChangeIndexItem[]): CloseGateResult {
  if (activeChanges.length === 0) {
    return { ready: false, warnings: [], blockingIssues: ["No active change found."] };
  }
  if (activeChanges.length > 1) {
    return { ready: false, warnings: [], blockingIssues: [`Expected exactly one active change; found ${activeChanges.length}.`] };
  }
  return { ready: true, warnings: [], blockingIssues: [] };
}

function getChangeTemplateRoot(memory: ResolvedMemory): string {
  if (existsSync(memory.templatesRoot)) return memory.templatesRoot;
  return join(getTemplateRoot(), "harness", "templates", "change");
}

async function renderTemplate(templateRoot: string, file: string, title: string): Promise<string> {
  const path = join(templateRoot, file);
  if (!existsSync(path)) {
    throw new Error(`Missing change template file: ${path}.`);
  }
  const raw = await readFile(path, "utf8");
  return raw.replaceAll("{title}", title);
}

function normalizeInitialContent(file: string, content: string, body: string | undefined): string {
  if (file === "summary.md") return appendRawRequest(content, body);
  if (file === "spec.md") return ensureSpecHasAc(content);
  if (file === "tasks.md") return ensureTasksHaveDefault(content);
  return content.endsWith("\n") ? content : `${content}\n`;
}

function appendRawRequest(content: string, body: string | undefined): string {
  const base = content.endsWith("\n") ? content : `${content}\n`;
  const request = body?.trim() ? body.trim() : "Not provided.";
  if (/^## Raw Request\s*$/im.test(base)) {
    return base.replace(/(^## Raw Request\s*$)([\s\S]*?)(?=^## |\s*$)/im, `$1\n\n${request}\n\n`);
  }
  return `${base}\n## Raw Request\n\n${request}\n`;
}

function ensureSpecHasAc(content: string): string {
  if (/\bAC-\d{3,}\b/i.test(content)) return content.endsWith("\n") ? content : `${content}\n`;
  const replaced = content.replace(/(\n## Acceptance Criteria\s*\n\s*)[-*]\s*TBD\s*/i, "$1- AC-001: TBD\n");
  if (replaced !== content) return replaced.endsWith("\n") ? replaced : `${replaced}\n`;
  return `${content.trimEnd()}\n\n## Acceptance Criteria\n\n- AC-001: TBD\n`;
}

function ensureTasksHaveDefault(content: string): string {
  if (/\bT-\d{3,}\b/i.test(content)) return content.endsWith("\n") ? content : `${content}\n`;
  const task = "- [ ] T-001: TBD\n  - Covers: AC-001";
  const replaced = content.replace(/^\s*[-*]\s*(?:\[\s\]\s*)?TBD\s*$/im, task);
  if (replaced !== content) return replaced.endsWith("\n") ? replaced : `${replaced}\n`;
  return `${content.trimEnd()}\n\n${task}\n`;
}

function getMissingRequiredFiles(changePath: string): string[] {
  return requiredChangeFiles.filter((file) => !existsSync(join(changePath, file)));
}

async function readChangeMetadata(changePath: string): Promise<ChangeMetadata | null> {
  const path = join(changePath, "change.json");
  if (!existsSync(path)) return null;
  try {
    return await readRequiredJsonFile(path, changeMetadataSchema);
  } catch {
    return null;
  }
}

async function readChangeContents(changePath: string): Promise<Record<(typeof requiredChangeFiles)[number], string | null>> {
  const entries = await Promise.all(requiredChangeFiles.map(async (file) => {
    const path = join(changePath, file);
    if (!existsSync(path)) return [file, null] as const;
    return [file, await readFile(path, "utf8")] as const;
  }));
  return Object.fromEntries(entries) as Record<(typeof requiredChangeFiles)[number], string | null>;
}

function buildPlaceholderFiles(contents: Record<(typeof requiredChangeFiles)[number], string | null>): Array<{ path: string; content: string }> {
  const files: Array<{ path: string; content: string }> = [];
  for (const path of requiredChangeFiles) {
    const content = contents[path];
    if (content !== null) files.push({ path, content });
  }
  return files;
}

function reviewBlockingIssues(status: ReviewStatus): string[] {
  if (status === "approved" || status === "approved-with-notes") return [];
  if (status === "pending") return ["Review status is pending."];
  if (status === "blocked") return ["Review status is blocked."];
  if (status === "missing") return ["Review status is missing."];
  return ["Review status is unknown."];
}

async function getArchiveRelativePath(memory: ResolvedMemory, changeId: string): Promise<string> {
  const basePath = join(memory.changesRoot, "archive", `${localDate()}-${changeId}`);
  if (!existsSync(basePath)) return displayPath(memory, basePath);
  return displayPath(memory, `${basePath}-${localTime()}`);
}

function localDate(date = new Date()): string {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

function localTime(date = new Date()): string {
  return `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

async function getSpecTestStatusForMemory(memory: ResolvedMemory) {
  try {
    return await getSpecTestStatus(memory);
  } catch (error) {
    return {
      version: "1.0" as const,
      changeId: "",
      selectedRoot: memory.projectRoot,
      latestValidation: null,
      mappings: [],
      acceptanceCriteria: [],
      warnings: [],
      blockingIssues: [`Spec-test mapping could not be evaluated: ${(error as Error).message}`],
    };
  }
}

async function resolveChangeMemory(project: ManagedProject | string | ResolvedMemory): Promise<ResolvedMemory> {
  if (typeof project === "string") return resolveMemory({ path: project });
  if ("harnessRoot" in project) return project;
  return resolveProjectMemory(project);
}

function displayPath(memory: ResolvedMemory, absolutePath: string): string {
  return relative(memory.memoryRoot, absolutePath).replace(/\\/g, "/");
}
