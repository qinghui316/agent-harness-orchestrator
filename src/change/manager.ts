import { existsSync } from "node:fs";
import { mkdir, readFile, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { buildAcMap, parseReviewStatus } from "../ecl/anchors.js";
import { getActiveChanges, writeChangeIndex } from "../ecl/index.js";
import { atomicWriteFile, writeJsonFile } from "../fs/json.js";
import { slugify } from "../fs/path.js";
import { getTemplateRoot } from "../template-source/paths.js";
import type {
  AcMap,
  ChangeIndex,
  ChangeIndexItem,
  ChangeMetadata,
  ChangeStatus,
  CloseGateResult,
  ManagedProject,
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
  const activeChanges = await getActiveChanges(project.path);
  if (activeChanges.length > 0) {
    throw new Error(`Cannot create a new change while an active change exists: ${activeChanges[0]?.name}.`);
  }

  const id = slugify(options.title);
  const relativePath = `harness/changes/active/${id}`;
  const changePath = join(project.path, relativePath);
  if (existsSync(changePath)) {
    throw new Error(`Change already exists: ${relativePath}.`);
  }

  await mkdir(join(changePath, "reviews"), { recursive: true });
  const templateRoot = getChangeTemplateRoot(project.path);
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

  const status = await getChangeStatus(project.path);
  if (!status.acMap) {
    throw new Error("Failed to build ac-map.json for the new change.");
  }
  const index = await writeChangeIndex(project.path);
  return { change, path: relativePath, acMap: status.acMap, index };
}

export async function getChangeStatus(projectPath: string): Promise<ChangeStatus> {
  const activeChanges = await getActiveChanges(projectPath);
  const baseGate = evaluateActiveCount(activeChanges);
  if (activeChanges.length !== 1) {
    return {
      projectPath,
      activeChanges,
      change: null,
      reviewStatus: "missing",
      acMap: null,
      closeGate: baseGate,
    };
  }

  const active = activeChanges[0];
  const changePath = join(projectPath, active.path);
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

  blockingIssues.push(...reviewBlockingIssues(reviewStatus));

  return {
    projectPath,
    activeChanges,
    change,
    reviewStatus,
    acMap,
    closeGate: {
      ready: blockingIssues.length === 0,
      warnings: uniqueSorted(warnings),
      blockingIssues: uniqueSorted(blockingIssues),
    },
  };
}

export async function closeChange(projectPath: string): Promise<ChangeCloseResult> {
  const status = await getChangeStatus(projectPath);
  if (!status.closeGate.ready) {
    throw new Error(`Cannot close change:\n${status.closeGate.blockingIssues.map((issue) => `- ${issue}`).join("\n")}`);
  }
  if (!status.change || status.activeChanges.length !== 1) {
    throw new Error("Cannot close change: expected exactly one active change with valid metadata.");
  }

  const active = status.activeChanges[0];
  const activePath = join(projectPath, active.path);
  const archiveRelativePath = await getArchiveRelativePath(projectPath, status.change.id);
  const archivePath = join(projectPath, archiveRelativePath);
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
  const index = await writeChangeIndex(projectPath);
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

function getChangeTemplateRoot(projectPath: string): string {
  const projectTemplateRoot = join(projectPath, "harness", "templates", "change");
  if (existsSync(projectTemplateRoot)) return projectTemplateRoot;
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
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    return changeMetadataSchema.parse(parsed);
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

async function getArchiveRelativePath(projectPath: string, changeId: string): Promise<string> {
  const base = `harness/changes/archive/${localDate()}-${changeId}`;
  if (!existsSync(join(projectPath, base))) return base;
  return `${base}-${localTime()}`;
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
