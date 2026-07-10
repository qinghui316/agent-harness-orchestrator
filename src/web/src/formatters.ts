import type { ConversationLifecycle, DemandAgentRunGraphNodeStatus, ThreadStreamItem, WorkbenchCodingPackage, WorkbenchTaskNode, Workpad, WorkpadRuntimeStatus, WorkpadUserStatus } from "./types.js";

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

export function agentRunStatusLabel(status: DemandAgentRunGraphNodeStatus): string {
  if (status === "running") return "进行中";
  if (status === "queued") return "等待中";
  if (status === "completed") return "已完成";
  if (status === "needs-change") return "需要修改";
  if (status === "failed") return "失败";
  if (status === "waiting-user") return "等你确认";
  if (status === "skipped") return "已跳过";
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
  return userFacingText(source);
}

export function userFacingText(value: string): string {
  return value
    .replace(/确认当前方案并启动 coder-agent、validator、auditor 角色流水线。/gi, "确认当前方案，并启动实现、验证和审查流程。")
    .replace(/\bTask queue started\b/gi, "本地顺序执行已开始")
    .replace(/\bTask runs reconciled\b/gi, "任务状态已同步")
    .replace(/\bTask workflow started\b/gi, "任务执行已开始")
    .replace(/\bCoder run confirmed\b/gi, "代码执行已确认")
    .replace(/\bRefresh execution status\b/gi, "继续处理")
    .replace(/\bWorkpad\b/g, "需求")
    .replace(/\bChange\b/g, "需求")
    .replace(/刷新执行状态/g, "继续处理")
    .replace(/重试此任务/g, "重试")
    .replace(/\bDirty worktree blocks close:/gi, "未清理的工作区会阻止完成：")
    .replace(/\bLatest Audit blocked close:/gi, "最新审查未通过，会阻止完成：")
    .replace(/\bReview status is pending\./gi, "Review 还未完成。")
    .replace(/\bAC-([0-9]+) has no linked test evidence\./gi, "AC-$1 还没有关联测试证据。")
    .replace(/\bActive change has AHO-managed worktree:/gi, "当前需求有 AHO 管理的工作区：")
    .replace(/Running Workpad proposals, diffs, stdout\/stderr, JSONL, and process metadata are not project stable facts\./g, "进行中的需求草案、diff、原始输出、JSONL 和进程信息不会进入项目稳定记忆。")
    .replace(/Memory consolidation candidates and conflict review are future human-gated workflows\./g, "记忆合并候选和冲突复核是后续人工确认流程。")
    .replace(/\bAudit blocked\.?/gi, "审查未通过，需要修改或补证据。")
    .replace(/\bAudit failed\.?/gi, "审查未通过。")
    .replace(/\bAudit approved-with-notes\b/gi, "审查带备注通过")
    .replace(/\bAudit approved\b/gi, "审查通过")
    .replace(/\bValidation failed\.?/gi, "验证未通过。")
    .replace(/\bValidation passed\b/gi, "验证已通过")
    .replace(/\bCoder completed\b/gi, "代码执行已完成")
    .replace(/\bcoder-agent\b/gi, "实现 agent")
    .replace(/\bvalidator\b/gi, "验证")
    .replace(/\bauditor-agent\b/gi, "审查")
    .replace(/\bauditor\b/gi, "审查")
    .replace(/角色流水线/g, "实现、验证和审查流程")
    .replace(/AHO-owned worktree/gi, "隔离工作区")
    .replace(/\bTask queue\b/gi, "本地顺序执行")
    .replace(/\bGenerate Spec\b/gi, "生成需求说明")
    .replace(/\bGenerate Plan\b/gi, "生成执行方案")
    .replace(/\bGenerate Tasks\b/gi, "生成任务")
    .replace(/生成 Spec/g, "生成需求说明")
    .replace(/生成 Plan/g, "生成执行方案")
    .replace(/生成 Tasks/g, "生成任务")
    .replace(/\bAccept spec proposal\b/gi, "接受需求说明")
    .replace(/\bAccept plan proposal\b/gi, "接受执行方案")
    .replace(/\bAccept audit proposal\b/gi, "接受审查证据")
    .replace(/接受 Spec/g, "接受需求说明")
    .replace(/接受 Plan/g, "接受执行方案")
    .replace(/\bPlan\/Tasks proposal\b/gi, "执行计划")
    .replace(/\bPlan\/Tasks acceptance\b/gi, "执行方案确认")
    .replace(/\bSpec proposal\b/gi, "需求说明草案")
    .replace(/\bSpec\b/g, "需求说明")
    .replace(/\bPlan\b/g, "执行方案")
    .replace(/\bTasks\b/g, "任务")
    .replace(/\bqueue\b/gi, "本地顺序执行")
    .replace(/\bblocked\b/gi, "需要修改或补证据")
    .replace(/\bfailed\b/gi, "未通过")
    .replace(/\brunning\b/gi, "处理中")
    .replace(/\bqueued\b/gi, "稍后处理")
    .replace(/\bwaiting-decision\b/gi, "等你确认")
    .replace(/\bblocking\b/gi, "需处理")
    .replace(/\bstdout\/stderr, JSONL\b/gi, "原始输出和 JSONL")
    .replace(/\band process metadata are not project stable facts\./gi, "和进程信息不会进入项目稳定记忆。");
}

export function stateLabel(state: string): string {
  if (state === "active") return "进行中";
  if (state === "archive") return "已归档";
  return state;
}

export function runtimeLabel(runtime: string): string {
  if (runtime === "codex-readonly") return "AI 只读回复";
  if (runtime === "coder-codex") return "代码实现";
  if (runtime === "validator") return "验证";
  if (runtime === "auditor") return "审查";
  if (runtime === "orchestrator" || runtime === "orchestrator.plan") return "AI 计划";
  if (runtime === "code.run") return "代码工作流";
  if (runtime === "chat.ask") return "AI 回复";
  return runtime;
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
  return status;
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
  if (type === "codex.started" || type === "coder.started") return "启动 Codex";
  if (type === "codex.exited" || type === "coder.exited") return "Codex 结束";
  if (type === "validation.started") return "开始验证";
  if (type === "validation.command.started") return "运行验证命令";
  if (type === "validation.command.exited") return "验证命令结束";
  if (type === "audit.started") return "开始审查";
  if (type === "audit.completed") return "审查完成";
  if (type === "diff.collected") return "收集 diff";
  if (type === "run.completed") return "运行完成";
  if (type === "run.failed") return "运行失败";
  return type;
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
  if (kind === "close-gate") return "完成";
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
  return userFacingText(kind);
}
