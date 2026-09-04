export type UiCopyLayer = "primary" | "detail" | "diagnostic";

export interface UserFacingFailure {
  summary: string;
  recoveryAction?: string;
  technicalDetail?: string;
}

export type UserFacingFailureContext =
  | "load"
  | "save"
  | "send"
  | "queue"
  | "review"
  | "settings"
  | "conversation"
  | "files"
  | "git"
  | "terminal"
  | "generic";

const CONTEXT_SUMMARIES: Record<UserFacingFailureContext, string> = {
  load: "暂时无法加载内容。",
  save: "暂时无法保存更改。",
  send: "消息暂时无法发送。",
  queue: "待发送内容暂时无法更新。",
  review: "代码审查暂时无法开始。",
  settings: "设置暂时无法更新。",
  conversation: "会话操作暂时无法完成。",
  files: "项目文件暂时无法打开。",
  git: "Git 信息暂时无法读取。",
  terminal: "Terminal 暂时无法连接。",
  generic: "暂时无法完成此操作。",
};

type RequestFailureShape = Error & {
  status?: unknown;
  technicalDetail?: unknown;
};

export function toUserFacingFailure(
  cause: unknown,
  context: UserFacingFailureContext = "generic",
): UserFacingFailure {
  const requestFailure = cause instanceof Error ? cause as RequestFailureShape : null;
  const status = typeof requestFailure?.status === "number" ? requestFailure.status : null;
  const technicalDetail = sanitizeTechnicalDetail(
    typeof requestFailure?.technicalDetail === "string"
      ? requestFailure.technicalDetail
      : cause instanceof Error
        ? cause.message
        : String(cause ?? ""),
  );

  if (status === 401 || status === 403) {
    return { summary: "当前操作没有可用权限。", recoveryAction: "检查授权后重试。", technicalDetail };
  }
  if (status === 404) {
    return { summary: "要操作的内容已不存在或已移动。", recoveryAction: "刷新后重试。", technicalDetail };
  }
  if (status === 409) {
    return { summary: "当前状态已经变化。", recoveryAction: "刷新后再试一次。", technicalDetail };
  }
  if (status === 413) {
    return { summary: "提交的内容超出大小限制。", recoveryAction: "减少内容或附件后重试。", technicalDetail };
  }
  if (status === 429) {
    return { summary: "操作过于频繁。", recoveryAction: "稍后再试。", technicalDetail };
  }
  if (status !== null && status >= 500) {
    return { summary: CONTEXT_SUMMARIES[context], recoveryAction: "检查服务状态后重试。", technicalDetail };
  }
  if (cause instanceof TypeError) {
    return { summary: "暂时无法连接到本地服务。", recoveryAction: "确认 Workbench 正在运行后重试。", technicalDetail };
  }
  return { summary: CONTEXT_SUMMARIES[context], recoveryAction: "请重试。", technicalDetail };
}

export function userFacingErrorMessage(
  cause: unknown,
  context: UserFacingFailureContext = "generic",
): string {
  const failure = toUserFacingFailure(cause, context);
  return failure.recoveryAction ? `${failure.summary}${failure.recoveryAction}` : failure.summary;
}

export function sanitizeTechnicalDetail(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  const redacted = compact
    .replace(/file:\/\/\/?[^\s"']+/gi, "[本机路径已隐藏]")
    .replace(/(^|[^A-Za-z0-9])(?:[A-Za-z]:[\\/]|\\\\)[^\s"']+/g, "$1[本机路径已隐藏]")
    .replace(/(^|[\s(=:])\/(?!\/)[^\s"']+/g, "$1[本机路径已隐藏]")
    .replace(/\b((?:request|session|thread|turn|attempt|graph|runtime)[-_ ]?id)\b\s*[:=]\s*[^\s,;]+/gi, "$1=[身份已隐藏]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, "[身份已隐藏]")
    .replace(/\b[a-f0-9]{32,}\b/gi, "[身份已隐藏]");
  return redacted.length > 500 ? `${redacted.slice(0, 499)}...` : redacted;
}

export function ahoProgressLabel(status: string): string {
  if (["created", "preparing", "planned"].includes(status)) return "计划中";
  if (["queued", "paused", "readonly"].includes(status)) return "等待执行";
  if (["running", "streaming", "started", "claimed"].includes(status)) return "执行中";
  if (["context-prepared", "evidence-ready", "validation", "audit"].includes(status)) return "正在检查";
  if (["waiting-decision", "needs-user-input", "waiting-user"].includes(status)) return "等你确认";
  if (["completed", "passed", "approved", "approved-with-notes", "archived", "released"].includes(status)) return "已完成";
  if (["blocked", "failed", "interrupted", "stopped", "needs-change", "needs-rework"].includes(status)) return "需要处理";
  return "状态更新";
}
