import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, isAbsolute, relative, sep } from "node:path";
import { listAuditResults, summarizeAudit } from "../../audit/repository.js";
import { defaultProviderRegistry } from "../../provider-runtime/index.js";
import type { ProviderDescriptor } from "../../provider-runtime/contracts.js";
import { assertRunArtifactDirectory } from "../../run/artifact-paths.js";
import { listRuns } from "../../run/repository.js";
import { listValidationResults, summarizeValidation } from "../../validation/repository.js";
import { collectAllConversationThreadEntries } from "../../workbench/conversation-thread-log.js";
import { resolveProjectInputWithDirect } from "./direct-project.js";
import { getRuntimeDiagnostics } from "./runtime-diagnostics.js";
import type { WorkbenchServerContext } from "./types.js";
import type { ManagedProject, RunMetadata } from "../../types/index.js";
import type { ProjectRuntimeResolution } from "../../project-runtime/context.js";
import { resolveWithinPhysicalRoot } from "../../project-harness/path-safety.js";

export type RuntimeActivitySeverity = "info" | "ok" | "warning" | "error";
export type RuntimeActivityType =
  | "provider"
  | "run"
  | "run-event"
  | "validation"
  | "audit"
  | "message-context"
  | "terminal"
  | "action-error";

export interface RuntimeActivityRef {
  kind: "run" | "artifact" | "topic" | "validation" | "audit" | "provider" | "diagnostic";
  label: string;
  id?: string;
  path?: string;
}

export interface RuntimeActivityItem {
  id: string;
  timestamp: string;
  type: RuntimeActivityType;
  severity: RuntimeActivitySeverity;
  status?: string;
  title: string;
  summary: string;
  refs: RuntimeActivityRef[];
  details?: string[];
}

export interface RuntimeActivityLogSnapshot {
  generatedAt: string;
  projectId: string;
  topicId: string | null;
  limit: number;
  truncated: boolean;
  items: RuntimeActivityItem[];
}

export interface RuntimeActivityLogOptions {
  topicId?: string | null;
  limit?: number;
}

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;

export async function getRuntimeActivityLog(
  context: WorkbenchServerContext,
  projectId: string,
  options: RuntimeActivityLogOptions = {},
): Promise<RuntimeActivityLogSnapshot> {
  const input = await resolveProjectInputWithDirect(context.store, context.input, projectId);
  if (!input.project) {
    throw new Error("Runtime activity log requires a registered project.");
  }
  const limit = normalizeLimit(options.limit);
  const topicId = options.topicId?.trim() || null;
  const runtime = await context.projectRuntimeCoordinator.requireReady(input.project);
  const items: RuntimeActivityItem[] = [];

  await Promise.all([
    appendProviderItems(items, input.project, input.path),
    appendDiagnosticsItems(items, context, projectId),
    appendRunItems(items, runtime, topicId),
    appendValidationItems(items, runtime, topicId),
    appendAuditItems(items, runtime, topicId),
    appendMessageContextItems(items, runtime, topicId),
  ]);

  const sorted = items
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp) || a.id.localeCompare(b.id));
  return {
    generatedAt: new Date().toISOString(),
    projectId,
    topicId,
    limit,
    truncated: sorted.length > limit,
    items: sorted.slice(0, limit),
  };
}

async function appendProviderItems(items: RuntimeActivityItem[], project: ManagedProject, projectPath: string): Promise<void> {
  await Promise.all(defaultProviderRegistry.list().map(async (descriptor) => {
    try {
      const summary = await descriptor.runtimeSummary(project, projectPath);
      const degraded = summary.snapshot.degradedReasons.slice(0, 4);
      items.push({
        id: `provider:${summary.providerId}:${summary.snapshot.snapshotHash}`,
        timestamp: summary.snapshot.checkedAt,
        type: "provider",
        severity: summary.snapshot.status === "ready" ? "ok" : summary.snapshot.status === "unavailable" ? "error" : "warning",
        status: summary.snapshot.status,
        title: `${descriptor.displayName} runtime`,
        summary: summary.snapshot.status === "ready"
          ? `${descriptor.displayName} 在 Harness 模式可用，模型 ${summary.snapshot.effectiveModel ?? "默认模型"}。`
          : `${descriptor.displayName} runtime ${providerStatusLabel(summary.snapshot.status)}。`,
        refs: [
          { kind: "provider", label: `provider: ${summary.providerId}`, id: summary.providerId },
          { kind: "provider", label: `product mode: ${summary.productMode}`, id: summary.productMode },
          { kind: "provider", label: `capability snapshot ${summary.snapshot.snapshotHash}`, id: summary.snapshot.snapshotHash },
        ],
        details: [
          `Provider: ${descriptor.displayName}`,
          `Product Mode: ${summary.productMode}`,
          `Harness Execution Mode: 逐步确认 / 自动推进`,
          `Model: ${summary.snapshot.effectiveModel ?? "默认模型"} (${summary.snapshot.effectiveModelSource})`,
          ...degraded.map((reason) => `降级原因: ${reason}`),
        ],
      });
    } catch (error) {
      items.push({
        id: `provider:${descriptor.id}:diagnostics-failed`,
        timestamp: new Date().toISOString(),
        type: "provider",
        severity: "error",
        status: "failed",
        title: `${descriptor.displayName} runtime`,
        summary: `${descriptor.displayName} 运行诊断失败。`,
        refs: [{ kind: "provider", label: `provider: ${descriptor.id}`, id: descriptor.id }],
        details: [sanitizeDetail(error instanceof Error ? error.message : String(error))],
      });
    }
  }));
}

async function appendDiagnosticsItems(items: RuntimeActivityItem[], context: WorkbenchServerContext, projectId: string): Promise<void> {
  const snapshot = await getRuntimeDiagnostics(context, projectId);
  for (const item of snapshot.items) {
    if (item.status === "ok" || item.status === "info") continue;
    items.push({
      id: `diagnostic:${item.id}:${snapshot.generatedAt}`,
      timestamp: snapshot.generatedAt,
      type: item.id.startsWith("terminal:") ? "terminal" : "provider",
      severity: diagnosticSeverity(item.status),
      status: item.status,
      title: item.title,
      summary: item.summary,
      refs: [{ kind: "diagnostic", label: item.id, id: item.id }],
      details: item.detail ? [sanitizeDetail(item.detail)] : undefined,
    });
  }
}

async function appendRunItems(items: RuntimeActivityItem[], runtime: ProjectRuntimeResolution, topicId: string | null): Promise<void> {
  const runs = (await listRuns(runtime.paths)).filter((run) => !topicId || run.changeId === topicId);
  for (const run of runs.slice(0, 80)) {
    items.push({
      id: `run:${run.id}`,
      timestamp: run.finishedAt ?? run.startedAt,
      type: "run",
      severity: run.status === "completed" ? "ok" : run.status === "failed" ? "error" : run.status === "running" ? "info" : "warning",
      status: run.status,
      title: runtimeTitle(run),
      summary: runSummary(run),
      refs: [
        { kind: "run", label: run.id, id: run.id },
        ...artifactRefs(run),
      ],
      details: runDetails(run),
    });
    for (const event of await readRunEventSummaries(runtime, run)) {
      items.push(event);
    }
  }
}

async function appendValidationItems(items: RuntimeActivityItem[], runtime: ProjectRuntimeResolution, topicId: string | null): Promise<void> {
  const validations = await listValidationResults(runtime.paths, topicId ?? undefined);
  for (const validation of validations.slice(0, 40).map(summarizeValidation)) {
    items.push({
      id: `validation:${validation.id}`,
      timestamp: validation.finishedAt ?? validation.startedAt,
      type: "validation",
      severity: validation.status === "passed" ? "ok" : validation.status === "failed" ? "error" : "warning",
      status: validation.status,
      title: validation.status === "passed" ? "验证通过" : "验证需要查看",
      summary: `${validation.profile} · ${validation.commandCount} 条命令。`,
      refs: [
        { kind: "validation", label: validation.id, id: validation.id },
        { kind: "run", label: validation.runId, id: validation.runId },
      ],
      details: [`Execution: ${validation.executionMode}`, validation.worktreeId ? `Worktree: ${validation.worktreeId}` : ""].filter(Boolean),
    });
  }
}

async function appendAuditItems(items: RuntimeActivityItem[], runtime: ProjectRuntimeResolution, topicId: string | null): Promise<void> {
  const audits = await listAuditResults(runtime.paths, topicId ?? undefined);
  for (const audit of audits.slice(0, 40).map(summarizeAudit)) {
    items.push({
      id: `audit:${audit.id}`,
      timestamp: audit.finishedAt ?? audit.startedAt,
      type: "audit",
      severity: audit.status === "approved" || audit.status === "approved-with-notes" ? "ok" : "error",
      status: audit.status,
      title: audit.status === "blocked" || audit.status === "failed" ? "审查阻塞" : "审查完成",
      summary: audit.findingCount > 0 ? `${audit.findingCount} 条发现。` : "没有阻塞发现。",
      refs: [
        { kind: "audit", label: audit.id, id: audit.id },
        { kind: "run", label: audit.runId, id: audit.runId },
      ],
      details: [audit.validationId ? `Validation: ${audit.validationId}` : "", audit.worktreeId ? `Worktree: ${audit.worktreeId}` : ""].filter(Boolean),
    });
  }
}

async function appendMessageContextItems(items: RuntimeActivityItem[], runtime: ProjectRuntimeResolution, topicId: string | null): Promise<void> {
  const entries = (await collectAllConversationThreadEntries(runtime.paths)).filter((entry) => !topicId || entry.changeId === topicId);
  for (const entry of entries.slice(-200)) {
    if (entry.error) {
      items.push({
        id: `action-error:${entry.id}`,
        timestamp: entry.timestamp,
        type: "action-error",
        severity: "error",
        status: entry.status,
        title: "操作失败",
        summary: sanitizeSummary(entry.error),
        refs: [{ kind: "topic", label: entry.changeId, id: entry.changeId }],
      });
    }
    const attachmentCount = entry.attachments?.length ?? 0;
    const fileRefCount = entry.contextRefs?.length ?? 0;
    if (attachmentCount === 0 && fileRefCount === 0) continue;
    items.push({
      id: `message-context:${entry.id}`,
      timestamp: entry.timestamp,
      type: "message-context",
      severity: "info",
      title: "消息上下文",
      summary: [
        fileRefCount ? `${fileRefCount} 个文件引用` : "",
        attachmentCount ? `${attachmentCount} 个附件` : "",
      ].filter(Boolean).join("，"),
      refs: [{ kind: "topic", label: entry.changeId, id: entry.changeId }],
      details: [
        ...(entry.contextRefs ?? []).slice(0, 10).map((ref) => `文件: ${ref.relativePath}`),
        ...(entry.attachments ?? []).slice(0, 10).map((attachment) => `附件: ${attachment.fileName} · ${attachment.kind} · ${attachment.runtimeMode}`),
      ],
    });
  }
}

async function readRunEventSummaries(runtime: ProjectRuntimeResolution, run: RunMetadata): Promise<RuntimeActivityItem[]> {
  const path = await artifactPath(runtime, run, run.artifacts.events);
  if (!path || !existsSync(path)) return [];
  const content = await readFile(path, "utf8").catch(() => "");
  if (!content.trim()) return [];
  const lines = content.trim().split(/\r?\n/).slice(-20);
  const items: RuntimeActivityItem[] = [];
  for (const [index, line] of lines.entries()) {
    const parsed = parseJsonObject(line);
    if (!parsed) continue;
    const type = typeof parsed.type === "string" ? parsed.type : "event";
    if (!shouldSurfaceRunEvent(type)) continue;
    const timestamp = typeof parsed.timestamp === "string" ? parsed.timestamp : (run.finishedAt ?? run.startedAt);
    const data = isRecord(parsed.data) ? parsed.data : {};
    items.push({
      id: `run-event:${run.id}:${index}:${type}`,
      timestamp,
      type: "run-event",
      severity: eventSeverity(type, data),
      status: typeof data.status === "string" ? data.status : undefined,
      title: eventTitle(type),
      summary: eventSummary(type, data),
      refs: [{ kind: "run", label: run.id, id: run.id }],
      details: boundedDataDetails(data),
    });
  }
  return items;
}

async function artifactPath(runtime: ProjectRuntimeResolution, run: RunMetadata, relativePath: string | undefined): Promise<string | null> {
  if (!relativePath) return null;
  const ownerRoot = run.artifacts.owner === "runtime-sidecar" ? runtime.paths.sidecarRoot : runtime.projectRoot;
  const runArtifactDirectory = assertRunArtifactDirectory(run);
  const directory = await resolveWithinPhysicalRoot(ownerRoot, runArtifactDirectory, "Run artifact directory");
  const target = await resolveWithinPhysicalRoot(ownerRoot, relativePath, "Run event artifact");
  const fromDirectory = relative(directory, target);
  if (fromDirectory === ".." || fromDirectory.startsWith(`..${sep}`) || isAbsolute(fromDirectory)) {
    throw new Error(`Run event artifact path escapes its run directory: ${relativePath}`);
  }
  return target;
}

function artifactRefs(run: RunMetadata): RuntimeActivityRef[] {
  const hidden = new Set(["stdout", "stderr", "prompt", "lastMessage", "providerEvents"]);
  return Object.entries(run.artifacts)
    .filter(([key, value]) => key !== "owner" && key !== "directory" && !hidden.has(key) && typeof value === "string" && value.length > 0)
    .slice(0, 8)
    .map(([key, value]) => ({ kind: "artifact" as const, label: key, path: String(value) }));
}

function runDetails(run: RunMetadata): string[] {
  const provider = providerForRun(run);
  const details = [
    `Runtime: ${run.runtime}`,
    provider ? `Provider: ${provider.displayName}` : "",
    `Product Mode: harness`,
    run.enabledSkills?.length ? `Skills: ${run.enabledSkills.map((skill) => `${skill.id} (${skill.source})`).join(", ")}` : "",
    run.executionGate ? `Harness Execution Mode: ${run.executionGate.mode}` : "",
  ].filter(Boolean);
  return details;
}

function providerForRun(run: RunMetadata): ProviderDescriptor | undefined {
  const providerId = run.command[0];
  if (!providerId) return undefined;
  try {
    return defaultProviderRegistry.get(providerId);
  } catch {
    return undefined;
  }
}

function providerDisplayName(providerId: unknown): string {
  if (typeof providerId !== "string" || !providerId) return "Agent Provider";
  try {
    return defaultProviderRegistry.get(providerId).displayName;
  } catch {
    return "Agent Provider";
  }
}

function runSummary(run: RunMetadata): string {
  const model = run.command.includes("--model") ? "指定模型" : "当前有效模型";
  if (run.status === "completed") return `${runtimeLabel(run.runtime)} 已完成，使用 ${model}。`;
  if (run.status === "failed") return `${runtimeLabel(run.runtime)} 失败，查看运行证据。`;
  if (run.status === "running") return `${runtimeLabel(run.runtime)} 正在运行。`;
  return `${runtimeLabel(run.runtime)} 已创建。`;
}

function runtimeTitle(run: RunMetadata): string {
  if (run.runtime === "validator") return "验证运行";
  if (run.runtime === "auditor") return "审查运行";
  if (run.runtime.includes("provider") || run.runtime === "planner" || run.runtime === "orchestrator") return "Agent 运行";
  return "运行记录";
}

function runtimeLabel(runtime: string): string {
  const labels: Record<string, string> = {
    "provider-readonly": "Agent 只读运行",
    "provider-code": "Agent 代码运行",
    "provider-agent": "Agent 运行",
    planner: "计划生成",
    orchestrator: "编排运行",
    validator: "验证",
    auditor: "审查",
    "intake-scan": "需求扫描",
    "worktree-apply": "本地应用",
    "worktree-discard": "本地丢弃",
  };
  return labels[runtime] ?? runtime;
}

function shouldSurfaceRunEvent(type: string): boolean {
  return [
    "provider.started",
    "provider.exited",
    "run.completed",
    "run.failed",
    "validation.completed",
    "validation.failed",
    "audit.completed",
    "audit.failed",
  ].includes(type);
}

function eventTitle(type: string): string {
  if (type === "provider.started") return "Agent Provider 启动";
  if (type === "provider.exited") return "Agent Provider 结束";
  if (type.includes("validation")) return "验证事件";
  if (type.includes("audit")) return "审查事件";
  return "运行事件";
}

function eventSummary(type: string, data: Record<string, unknown>): string {
  if (type === "provider.started") return `${providerDisplayName(data.providerId)} · model ${String(data.model ?? "默认模型")}`;
  if (type === "provider.exited") return `status ${String(data.status ?? "unknown")}`;
  if (typeof data.summary === "string") return sanitizeSummary(data.summary);
  return type;
}

function eventSeverity(type: string, data: Record<string, unknown>): RuntimeActivitySeverity {
  if (type.includes("failed")) return "error";
  if (type === "provider.exited" && data.status === "failed") return "error";
  if (type === "provider.started") return "info";
  return "ok";
}

function boundedDataDetails(data: Record<string, unknown>): string[] {
  const allowed = ["adapter", "providerId", "productMode", "model", "modelSource", "capabilitySnapshotHash", "capabilitySnapshotVersion", "status"];
  return allowed
    .filter((key) => data[key] !== undefined)
    .map((key) => `${key}: ${String(data[key])}`);
}

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit ?? NaN)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.trunc(limit ?? DEFAULT_LIMIT)));
}

function diagnosticSeverity(status: string): RuntimeActivitySeverity {
  if (status === "error") return "error";
  if (status === "warning") return "warning";
  if (status === "ok") return "ok";
  return "info";
}

function providerStatusLabel(status: string): string {
  if (status === "unavailable") return "不可用";
  if (status === "degraded") return "降级";
  return status;
}

function sanitizeSummary(value: string): string {
  return sanitizePrivatePaths(value).replace(/\s+/g, " ").slice(0, 240);
}

function sanitizeDetail(value: string): string {
  return sanitizePrivatePaths(value)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8)
    .join("\n");
}

function sanitizePrivatePaths(value: string): string {
  return value
    .replace(/[A-Za-z]:[\\/][^\s'"<>|)]+/g, foldedPathLabel)
    .replace(/(?<![\w.])\/(?:Users|home|tmp|var|private|mnt|Volumes)\/[^\s'"<>|)]+/g, foldedPathLabel)
    .replace(/[^\s'"<>|)]*[/\\]\.agent-harness[/\\][^\s'"<>|)]*/g, foldedPathLabel);
}

function foldedPathLabel(pathText: string): string {
  const normalized = pathText.replace(/[\\/]$/, "");
  const name = basename(normalized);
  return name ? `${name} (路径已折叠)` : "路径已折叠";
}

function parseJsonObject(line: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(line) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
