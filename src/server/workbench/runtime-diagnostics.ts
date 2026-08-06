import { defaultProviderRegistry } from "../../provider-runtime/index.js";
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
  let selectedProject: ProjectStatus["project"] | null = null;

  if (projectId) {
    try {
      const input = await resolveProjectInputWithDirect(context.store, context.input, projectId);
      projectPath = input.path;
      const statuses = await listProjectStatuses(context.store, context.input) as ProjectStatus[];
      const status = statuses.find((item) => item.project?.id === projectId);
      selectedProject = status?.project ?? null;
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
      } else if (status.harness.readiness !== "ready") {
        items.push({
          id: "project:harness-warning",
          title: "项目准备状态需要检查",
          status: "warning",
          summary: "项目 Harness 尚未完成准备。",
          detail: `readiness: ${status.harness.readiness}`,
        });
      } else {
        items.push({
          id: "project:ready",
          title: "项目工作区",
          status: "ok",
          summary: "项目已准备好。",
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

  for (const provider of defaultProviderRegistry.list()) {
    try {
      const diagnostics = await provider.diagnostics(selectedProject ?? null, projectPath);
      items.push({
        id: `provider:${provider.id}`,
        title: provider.displayName,
        status: diagnostics.sessionHealth === "ready" ? "ok" : "warning",
        summary: diagnostics.installation.available ? `${provider.displayName} 可用。` : `${provider.displayName} 暂不可用。`,
        detail: [diagnostics.lastError, diagnostics.installation.version ? `version: ${diagnostics.installation.version}` : ""].filter(Boolean).join("\n"),
      });
      items.push({
        id: `provider:${provider.id}:models`,
        title: "模型列表",
        status: diagnostics.models.available ? "ok" : "warning",
        summary: diagnostics.models.available ? "模型候选已读取。" : "模型列表暂不可用，仍可使用配置或默认模型。",
        detail: diagnostics.models.degradedReason ?? `effective model: ${diagnostics.models.effectiveModel?.modelId ?? "default"}`,
      });
    } catch (cause) {
      items.push({ id: `provider:${provider.id}:error`, title: provider.displayName, status: "warning", summary: "Provider 诊断读取失败。", detail: messageFrom(cause) });
    }
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
