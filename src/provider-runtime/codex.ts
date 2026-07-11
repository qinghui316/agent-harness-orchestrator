import { createHash } from "node:crypto";
import { detectCodexCapabilities } from "../codex/capabilities.js";
import { getCodexModelSettingsSnapshot } from "../codex/model-settings.js";
import { listSkills } from "../skill/catalog.js";
import type { ManagedProject } from "../types/index.js";
import type {
  HarnessExecutionMode,
  ProviderCapabilityItem,
  ProviderCapabilityKey,
  ProviderCapabilitySnapshot,
  ProviderRuntimeReadiness,
  ProviderRuntimeSummary,
  ProviderSnapshotStatus,
  ProviderSpecCapabilityState,
  ProductMode,
  RunnableProductMode,
} from "./types.js";

export const PROVIDER_CAPABILITY_SNAPSHOT_VERSION = 2;
export const HARNESS_EXECUTION_MODES: HarnessExecutionMode[] = ["stepwise", "scoped-auto"];
export const RUNNABLE_PRODUCT_MODES: RunnableProductMode[] = ["harness"];

export function isRunnableProductMode(mode: ProductMode): mode is RunnableProductMode {
  return mode === "harness";
}

type CapabilityInput = {
  key: ProviderCapabilityKey;
  label: string;
  spec: ProviderSpecCapabilityState;
  runtime: ProviderRuntimeReadiness;
  summary: string;
  reason?: string;
};

export async function getCodexProviderRuntimeSummary(project: ManagedProject | null, projectPath?: string): Promise<ProviderRuntimeSummary> {
  const snapshot = await getCodexProviderCapabilitySnapshot(project, projectPath);
  return {
    providerId: "codex",
    productMode: "harness",
    harnessExecutionModes: HARNESS_EXECUTION_MODES,
    snapshot,
  };
}

export async function getCodexProviderCapabilitySnapshot(project: ManagedProject | null, projectPath?: string): Promise<ProviderCapabilitySnapshot> {
  const [cli, models, skills] = await Promise.all([
    detectCodexCapabilities(),
    getCodexModelSettingsSnapshot(projectPath),
    project ? listSkills(project).catch((error: unknown) => ({ error })) : Promise.resolve(null),
  ]);

  const cliReady = cli.available && cli.errors.length === 0;
  const safeExecReady = cliReady && cli.supportsJson && cli.supportsSandbox && cli.supportsCd;
  const modelListReady = models.modelList.available && !models.modelList.degraded;
  const skillCount = Array.isArray(skills) ? skills.length : 0;
  const skillError = skills && !Array.isArray(skills) && "error" in skills ? messageFrom(skills.error) : null;

  const items: CapabilityInput[] = [
    {
      key: "streaming.text",
      label: "文本输出",
      spec: "supported",
      runtime: safeExecReady ? "ready" : cli.available ? "degraded" : "unavailable",
      summary: safeExecReady ? "Codex exec 可用于文本运行。" : "Codex 文本运行能力需要检查。",
      reason: firstReason(cli.errors),
    },
    {
      key: "streaming.reasoning",
      label: "推理输出",
      spec: "supported",
      runtime: safeExecReady ? "ready" : cli.available ? "degraded" : "unavailable",
      summary: "AHO 只显示 Codex 可见输出或摘要，不读取私有推理。",
      reason: safeExecReady ? undefined : firstReason(cli.errors),
    },
    {
      key: "streaming.tool-output",
      label: "工具输出",
      spec: "supported",
      runtime: safeExecReady ? "ready" : cli.available ? "degraded" : "unavailable",
      summary: safeExecReady ? "Codex JSON 事件可归档为运行证据。" : "Codex JSON 事件能力需要检查。",
      reason: cli.supportsJson ? undefined : "Codex exec does not expose required JSON output.",
    },
    {
      key: "tool.use",
      label: "工具调用",
      spec: "supported",
      runtime: safeExecReady ? "ready" : cli.available ? "degraded" : "unavailable",
      summary: "工具权限仍由 AHO ToolPolicy 和 Harness gates 约束。",
      reason: safeExecReady ? undefined : firstReason(cli.errors),
    },
    {
      key: "tool.mcp",
      label: "MCP / 插件",
      spec: "supported",
      runtime: skillError ? "degraded" : "ready",
      summary: skillError ? "Skill/MCP 状态读取降级。" : "Codex Skill / plugin bridge 可作为 runtime capability 使用。",
      reason: skillError ?? undefined,
    },
    {
      key: "reasoning.effort",
      label: "推理强度",
      spec: "supported",
      runtime: "degraded",
      summary: "V1 不提供独立推理强度 UI；使用当前 Codex 配置。",
      reason: "Reasoning effort is not exposed as an AHO Workbench control yet.",
    },
    {
      key: "collaboration.mode",
      label: "执行策略",
      spec: "compat-input",
      runtime: "ready",
      summary: "Harness 执行策略由 AHO 的逐步确认 / 自动推进控制，不是底层 provider 权限。",
    },
    {
      key: "session.continuation",
      label: "会话续接",
      spec: "supported",
      runtime: cli.supportsSafeResume ? "ready" : cli.available ? "degraded" : "unavailable",
      summary: cli.supportsSafeResume ? "Codex resume 满足只读续接约束。" : "Codex resume 缺少等价只读约束时会 fail closed。",
      reason: cli.supportsSafeResume ? undefined : "Safe resume requires sandbox, cwd, and external read-dir support when needed.",
    },
    {
      key: "image.input",
      label: "图片输入",
      spec: "supported",
      runtime: modelListReady ? "ready" : "degraded",
      summary: modelListReady ? "图片附件可通过 Codex app-server localImage 路径传入。" : "图片附件会保留 metadata/text fallback，app-server 能力需检查。",
      reason: models.modelList.degradedReason,
    },
    {
      key: "model.list",
      label: "模型列表",
      spec: "supported",
      runtime: modelListReady ? "ready" : "degraded",
      summary: modelListReady ? "已读取 Codex runtime 模型候选。" : "模型列表不可用时继续使用 config/default model。",
      reason: models.modelList.degradedReason,
    },
    {
      key: "skills",
      label: "Skills",
      spec: "supported",
      runtime: skillError ? "degraded" : project ? "ready" : "degraded",
      summary: project ? `${skillCount} 个 Skill 对当前项目可见。` : "选择项目后读取 native/custom/system Skills。",
      reason: skillError ?? (project ? undefined : "No selected project for project-scoped Skill status."),
    },
  ];

  const capabilities = items.map(toCapabilityItem);
  const status = snapshotStatus(capabilities, cli.available);
  const degradedReasons = capabilities
    .filter((item) => item.runtime !== "ready")
    .map((item) => item.reason ?? item.summary);
  const base = {
    providerId: "codex" as const,
    displayName: "Codex",
    productMode: "harness" as const,
    status,
    runnable: status !== "unavailable" && safeExecReady,
    checkedAt: new Date().toISOString(),
    snapshotVersion: PROVIDER_CAPABILITY_SNAPSHOT_VERSION,
    effectiveModel: models.effectiveModel,
    effectiveModelSource: models.effectiveModelSource,
    degradedReasons,
    capabilities,
  };
  return {
    ...base,
    snapshotHash: stableCapabilitySnapshotHash(base),
  };
}

function toCapabilityItem(input: CapabilityInput): ProviderCapabilityItem {
  return {
    key: input.key,
    label: input.label,
    spec: input.spec,
    runtime: input.runtime,
    summary: input.summary,
    reason: input.reason,
  };
}

function snapshotStatus(capabilities: ProviderCapabilityItem[], cliAvailable: boolean): ProviderSnapshotStatus {
  if (!cliAvailable) return "unavailable";
  if (capabilities.some((item) => item.runtime === "unavailable" || item.runtime === "degraded")) return "degraded";
  return "ready";
}

export function stableCapabilitySnapshotHash(input: Omit<ProviderCapabilitySnapshot, "snapshotHash">): string {
  const stable = {
    providerId: input.providerId,
    productMode: input.productMode,
    snapshotVersion: input.snapshotVersion,
    status: input.status,
    runnable: input.runnable,
    effectiveModel: input.effectiveModel,
    effectiveModelSource: input.effectiveModelSource,
    capabilities: input.capabilities.map((item) => ({
      key: item.key,
      spec: item.spec,
      runtime: item.runtime,
      reason: item.reason ?? null,
    })),
  };
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex").slice(0, 16);
}

function firstReason(errors: string[]): string | undefined {
  return errors[0];
}

function messageFrom(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
