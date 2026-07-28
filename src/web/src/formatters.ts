import type { AgentSurfaceStatus, ConversationLifecycle, ThreadStreamItem, WorkbenchCodingPackage, WorkbenchTaskNode, Workpad, WorkpadRuntimeStatus, WorkpadUserStatus } from "./types.js";

type ProjectDisplayInput = {
  id?: string | null;
  name?: string | null;
  path?: string | null;
};

export function projectPathBasename(path?: string | null): string {
  const parts = (path ?? "").split(/[\\/]/).filter(Boolean);
  return parts.at(-1)?.trim() ?? "";
}

export function projectDisplayName(project?: ProjectDisplayInput | null, fallback = "项目"): string {
  const name = project?.name?.trim() ?? "";
  const id = project?.id?.trim() ?? "";
  const pathName = projectPathBasename(project?.path);
  if (name && !(id && name === id && pathName && pathName !== name)) return name;
  return pathName || name || id || fallback;
}

export function formatTime(value?: string): string {
  if (!value) return "";
  return new Date(value).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

export function workpadStateLabel(state: Workpad["state"]): string {
  if (state === "active") return "进行中";
  if (state === "readonly") return "只读";
  if (state === "empty") return "待创建";
  return "诊断";
}

export function workpadStatusLabel(status: WorkpadRuntimeStatus): string {
  if (status === "running") return "处理中";
  if (status === "queued") return "稍后处理";
  if (status === "blocked") return "需要修改或补证据";
  if (status === "waiting-decision") return "等你确认";
  if (status === "archived") return "已完成";
  if (status === "readonly") return "稍后处理";
  return "等你确认";
}

export function userStatusLabel(status?: WorkpadUserStatus): string {
  if (status === "processing") return "处理中";
  if (status === "waiting-confirmation") return "等你确认";
  if (status === "needs-rework") return "需要修改或补证据";
  if (status === "later") return "稍后处理";
  if (status === "abandoned") return "已放弃";
  return "已完成";
}

export function conversationLifecycleLabel(status?: ConversationLifecycle): string {
  if (status === "running") return "执行中";
  if (status === "waiting-user") return "等待补充";
  if (status === "archived-readonly") return "历史只读";
  if (status === "abandoned") return "已放弃";
  return "当前需求";
}

export function agentRunStatusLabel(status: AgentSurfaceStatus): string {
  if (status === "running") return "进行中";
  if (status === "queued") return "等待中";
  if (status === "completed") return "已完成";
  if (status === "needs-change") return "需要修改";
  if (status === "failed") return "失败";
  if (status === "waiting-user") return "等你确认";
  if (status === "interrupted") return "已中断";
  return "待开始";
}

export function readinessLabel(value: "missing" | "ready" | "unknown"): string {
  if (value === "ready") return "已就绪";
  if (value === "missing") return "缺失";
  return "未知";
}

export function taskStatusLabel(status: WorkbenchTaskNode["status"]): string {
  if (status === "planned") return "计划中";
  if (status === "running") return "处理中";
  if (status === "evidence-ready") return "有证据";
  if (status === "blocked") return "需要修改";
  return "已勾选";
}

export function codingPackageStatusLabel(status: WorkbenchCodingPackage["status"]): string {
  if (status === "suggested") return "建议执行";
  if (status === "blocked") return "需要修改";
  if (status === "evidence-ready") return "证据就绪";
  if (status === "readonly") return "只读";
  return "缺失";
}

export function statusOrDash(value?: string): string {
  return value ? humanStatus(value) : "-";
}

export function sourceLabel(source: string): string {
  if (source === "run" || source === "workflow") return "执行";
  if (source === "validation") return "验证";
  if (source === "audit") return "审查";
  if (source === "decision") return "决策";
  if (source === "thread") return "对话";
  if (source === "task") return "任务";
  if (source === "queue") return "本地顺序执行";
  return "其他";
}

export function stateLabel(state: string): string {
  if (state === "active") return "进行中";
  if (state === "archive") return "已归档";
  return "未知状态";
}

export function runtimeLabel(runtime: string): string {
  if (runtime === "provider-readonly") return "AI 只读回复";
  if (runtime === "provider-code") return "代码实现";
  if (runtime === "validator") return "验证";
  if (runtime === "auditor") return "审查";
  if (runtime === "orchestrator" || runtime === "orchestrator.plan") return "AI 计划";
  if (runtime === "code.run") return "代码工作流";
  if (runtime === "chat.ask") return "AI 回复";
  return "AI 任务";
}

export function humanStatus(status: string): string {
  if (status === "created") return "已创建";
  if (status === "preparing") return "正在准备";
  if (status === "context-prepared") return "上下文已准备";
  if (status === "running") return "处理中";
  if (status === "queued") return "稍后处理";
  if (status === "paused") return "稍后处理";
  if (status === "blocked") return "需要修改或补证据";
  if (status === "waiting-decision") return "等你确认";
  if (status === "claimed") return "已领取";
  if (status === "released") return "已释放";
  if (status === "evidence-ready") return "证据就绪";
  if (status === "readonly") return "只读";
  if (status === "streaming") return "流式输出中";
  if (status === "completed") return "已完成";
  if (status === "passed") return "已通过";
  if (status === "approved") return "已批准";
  if (status === "approved-with-notes") return "带备注批准";
  if (status === "failed") return "失败";
  if (status === "started") return "已开始";
  if (status === "stderr") return "错误输出";
  if (status === "draft") return "草案";
  if (status === "confirmed") return "已确认";
  if (status === "needs-user-input") return "需要用户补充";
  if (status === "stopped") return "已停止";
  return "状态更新";
}

export function resultReviewStatusLabel(status: NonNullable<Workpad["resultReview"]>["status"]): string {
  if (status === "ready-to-apply") return "可应用";
  if (status === "needs-rework") return "需要修改";
  if (status === "applied-clean") return "已应用";
  if (status === "applied-source-dirty") return "已应用，待处理本地改动";
  return "证据未完整";
}

export function roleLabel(roleId: string): string {
  if (roleId === "planning-agent") return "规划";
  if (roleId === "coder-agent" || roleId === "coder") return "实现";
  if (roleId === "validator") return "验证";
  if (roleId === "auditor-agent" || roleId === "auditor") return "审查";
  if (roleId === "rework-coder") return "自动修改";
  return roleId;
}

export function eventLabel(type: string): string {
  if (type === "run.created") return "创建运行";
  if (type === "context.prepared") return "准备上下文";
  if (type === "provider.started" || type === "coder.started") return "启动 Agent Provider";
  if (type === "provider.exited" || type === "coder.exited") return "Agent Provider 结束";
  if (type === "validation.started") return "开始验证";
  if (type === "validation.command.started") return "运行验证命令";
  if (type === "validation.command.exited") return "验证命令结束";
  if (type === "audit.started") return "开始审查";
  if (type === "audit.completed") return "审查完成";
  if (type === "diff.collected") return "收集 diff";
  if (type === "run.completed") return "运行完成";
  if (type === "run.failed") return "运行失败";
  return "运行事件";
}

export function formatUsage(usage: Record<string, unknown>): string {
  const input = typeof usage.input_tokens === "number" ? usage.input_tokens : undefined;
  const output = typeof usage.output_tokens === "number" ? usage.output_tokens : undefined;
  const pieces = [
    input === undefined ? null : `${input} input tokens`,
    output === undefined ? null : `${output} output tokens`,
  ].filter((item): item is string => Boolean(item));
  return pieces.length > 0 ? `用量：${pieces.join(" · ")}` : "用量已记录";
}

export function threadLabel(item: ThreadStreamItem): string {
  if (item.kind === "user-message") return "用户消息";
  if (item.kind === "assistant-turn") return item.source === "workflow" ? "执行结果" : "AI";
  if (item.kind === "assistant-message") return "AI 回复";
  if (item.kind === "workflow-summary") return "工作流摘要";
  if (item.source === "validation") return "验证证据";
  if (item.source === "audit") return "审查证据";
  if (item.kind === "decision") return "决策记录";
  if (item.kind === "change-state") return "需求意图";
  return item.label;
}

export function threadTone(item: ThreadStreamItem): string {
  if (item.status === "failed" || item.status === "blocked" || item.label.toLowerCase().includes("failed")) return "danger";
  if (item.kind === "decision") return "action";
  if (item.label.toLowerCase().includes("spec") || item.label.toLowerCase().includes("plan")) return "coral";
  return "success";
}

export function decisionKindLabel(kind: string): string {
  if (kind === "queue-blocker") return "任务暂停";
  if (kind === "task-blocker") return "需要修改";
  if (kind === "validation-failed") return "验证未通过";
  if (kind === "audit-blocked") return "审查未通过";
  if (kind === "spec-proposal") return "Spec";
  if (kind === "plan-proposal") return "计划";
  if (kind === "audit-approved") return "审查";
  if (kind === "apply-gate") return "应用";
  if (kind === "evolution-pending") return "Harness";
  return "历史";
}

export function confirmationKindLabel(kind: string): string {
  if (kind === "planning-confirm") return "计划确认";
  if (kind === "single-result-apply") return "结果应用";
  if (kind === "integration-check") return "兼容性检查";
  if (kind === "integration-apply") return "组合应用";
  if (kind === "landing-readiness") return "落地检查";
  if (kind === "landing-queue") return "合并队列";
  if (kind === "pr-draft") return "PR 草稿";
  if (kind === "pr-review") return "人工评审";
  if (kind === "remote-landing") return "远端合并";
  if (kind === "post-merge") return "合并后收尾";
  if (kind === "request-changes") return "要求修改";
  if (kind === "discard-result") return "放弃结果";
  if (kind === "maintenance") return "维护建议";
  return "其他确认";
}
