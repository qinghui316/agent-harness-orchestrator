import { getCodexModelSettingsSnapshot } from "../../codex/model-settings.js";
import { getWorkbenchCodexDiagnostics } from "./codex-diagnostics.js";
import { resolveProjectInputWithDirect } from "./direct-project.js";
import { listProjectStatuses } from "./project-admin.js";
import type { WorkbenchServerContext } from "./types.js";
import type { ProjectStatus } from "../../types/index.js";

export type RuntimeDiagnosticStatus = "ok" | "warning" | "error" | "info";

export interface RuntimeDiagnosticItem {
  id: string;
  title: string;
  status: RuntimeDiagnosticStatus;
  summary: string;
  detail?: string;
}

export interface RuntimeDiagnosticsSnapshot {
  generatedAt: string;
  summary: {
    status: "ok" | "degraded" | "error";
    issueCount: number;
    degradedCount: number;
  };
  items: RuntimeDiagnosticItem[];
}

export async function getRuntimeDiagnostics(context: WorkbenchServerContext, projectId?: string | null): Promise<RuntimeDiagnosticsSnapshot> {
  const items: RuntimeDiagnosticItem[] = [];
  let projectPath: string | undefined;

  if (projectId) {
    try {
      const input = await resolveProjectInputWithDirect(context.store, context.input, projectId);
      projectPath = input.path;
      const statuses = await listProjectStatuses(context.store, context.input) as ProjectStatus[];
      const status = statuses.find((item) => item.project?.id === projectId);
      if (!status) {
        items.push({
          id: "project:missing",
          title: "项目不可用",
          status: "error",
          summary: "当前项目不在项目列表中。",
        });
      } else if (!status.pathExists) {
        items.push({
          id: "project:path-missing",
          title: "项目路径不可用",
          status: "error",
          summary: "项目路径不存在或当前无法访问。",
          detail: status.path,
        });
      } else if (status.memory?.unsupportedReason) {
        items.push({
          id: "project:memory-warning",
          title: "项目准备状态需要检查",
          status: "warning",
          summary: "项目工作区准备信息不完整。",
          detail: status.memory.unsupportedReason,
        });
      } else {
        items.push({
          id: "project:ready",
          title: "项目工作区",
          status: "ok",
          summary: status.memory?.harnessReady ? "项目已准备好。" : "项目可打开，首次需求会先准备项目。",
        });
      }
    } catch (cause) {
      items.push({
        id: "project:error",
        title: "项目状态读取失败",
        status: "error",
        summary: "无法读取当前项目状态。",
        detail: messageFrom(cause),
      });
    }
  } else {
    items.push({
      id: "project:none",
      title: "项目",
      status: "info",
      summary: "尚未选择项目。",
    });
  }

  try {
    const input = projectId ? await resolveProjectInputWithDirect(context.store, context.input, projectId) : null;
    const diagnostics = await getWorkbenchCodexDiagnostics(input?.project ?? null, input?.path);
    items.push({
      id: "codex:cli",
      title: "Codex",
      status: diagnostics.available && diagnostics.errors.length === 0 ? "ok" : "warning",
      summary: diagnostics.available ? "Codex CLI 可用。" : "Codex CLI 暂不可用。",
      detail: [...diagnostics.errors, diagnostics.version ? `version: ${diagnostics.version}` : "", `config: ${diagnostics.configPath}`].filter(Boolean).join("\n"),
    });
  } catch (cause) {
    items.push({
      id: "codex:error",
      title: "Codex",
      status: "warning",
      summary: "Codex 诊断读取失败。",
      detail: messageFrom(cause),
    });
  }

  try {
    const models = await getCodexModelSettingsSnapshot(projectPath);
    items.push({
      id: "codex:model-list",
      title: "模型列表",
      status: models.modelList.available ? "ok" : "warning",
      summary: models.modelList.available ? "模型候选已读取。" : "模型列表暂不可用，仍可使用配置或默认模型。",
      detail: models.modelList.degradedReason ?? `effective model: ${models.effectiveModel ?? "default"}`,
    });
  } catch (cause) {
    items.push({
      id: "codex:model-list-error",
      title: "模型列表",
      status: "warning",
      summary: "模型设置读取失败。",
      detail: messageFrom(cause),
    });
  }

  const terminal = await context.terminalRuntime.checkAvailability();
  items.push({
    id: "terminal:runtime",
    title: "终端",
    status: terminal.available ? "ok" : "warning",
    summary: terminal.available ? "终端运行环境可用。" : "终端运行环境暂不可用。",
    detail: terminal.message,
  });

  const issueCount = items.filter((item) => item.status === "error").length;
  const degradedCount = items.filter((item) => item.status === "warning").length;
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      status: issueCount > 0 ? "error" : degradedCount > 0 ? "degraded" : "ok",
      issueCount,
      degradedCount,
    },
    items,
  };
}

function messageFrom(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
