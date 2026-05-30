import type { AssistantTurnBlock } from "./chat.js";
import { detectDelegateTaskMcpCapability } from "../agent-task/delegate-task.js";
import type {
  ThreadStreamEvidence,
  ThreadStreamItem,
  WorkbenchPlanningArtifactBundle,
  WorkbenchResultReview,
  WorkbenchRolePipelineSummary,
  WorkbenchWorkpad,
} from "./manager.js";

export type ParentAgentTranscriptActor = "user" | "parent-agent";
export type ParentAgentTranscriptBlockKind = "prose" | "process" | "tool-result" | "evidence";
export type ParentAgentTranscriptBlockSource = "user" | "codex-runtime" | "aho-orchestration" | "workflow-evidence" | "maintenance";

export interface ParentAgentEvidenceRef {
  label: string;
  ref: string;
  kind: "artifact" | "run" | "decision" | "remote" | "maintenance";
}

export interface ParentAgentTranscriptBlock {
  id: string;
  kind: ParentAgentTranscriptBlockKind;
  source: ParentAgentTranscriptBlockSource;
  title?: string;
  text: string;
  status?: string;
  evidenceRefs?: ParentAgentEvidenceRef[];
  isError?: boolean;
}

export interface ParentAgentTranscriptItem {
  id: string;
  actor: ParentAgentTranscriptActor;
  timestamp?: string;
  blocks: ParentAgentTranscriptBlock[];
  derived?: boolean;
}

export interface ParentAgentTranscript {
  conversationId?: string;
  changeId?: string;
  title: string;
  items: ParentAgentTranscriptItem[];
  emptyMessage?: string;
}

export function buildParentAgentTranscript(input: {
  workpad: WorkbenchWorkpad;
  threadItems: ThreadStreamItem[];
}): ParentAgentTranscript {
  const items = input.threadItems
    .filter((item) => item.kind !== "change-state")
    .flatMap((item) => transcriptItemFromThreadItem(item));
  const derivedItems = derivedTranscriptItems(input.workpad, items.length === 0);
  const transcriptItems = dedupeTranscriptEvidenceRefs([...items, ...derivedItems]);
  return {
    conversationId: input.workpad.conversationId,
    changeId: input.workpad.boundChangeId,
    title: cleanPrimaryText(input.workpad.title) || "需求对话",
    items: transcriptItems,
    emptyMessage: "暂无对话内容。输入需求后，主 agent 会在这里持续回复。",
  };
}

function transcriptItemFromThreadItem(item: ThreadStreamItem): ParentAgentTranscriptItem[] {
  if (item.kind === "user-message") {
    const text = cleanPrimaryText(item.body ?? item.label);
    if (!text) return [];
    return [{
      id: `parent-transcript:user:${item.id}`,
      actor: "user",
      timestamp: item.timestamp,
      blocks: [{
        id: `block:user:${item.id}`,
        kind: "prose",
        source: "user",
        text,
      }],
    }];
  }

  const blocks = transcriptBlocksFromThreadItem(item);
  if (blocks.length === 0) return [];
  return [{
    id: `parent-transcript:agent:${item.id}`,
    actor: "parent-agent",
    timestamp: item.timestamp,
    blocks,
    derived: item.source === "workflow" || item.kind !== "assistant-message",
  }];
}

function transcriptBlocksFromThreadItem(item: ThreadStreamItem): ParentAgentTranscriptBlock[] {
  const blocks: ParentAgentTranscriptBlock[] = [];
  blocks.push(...activityBlocksFromThreadItem(item));
  for (const block of item.blocks ?? []) {
    const converted = transcriptBlockFromAssistantBlock(block, item.id);
    if (converted) blocks.push(converted);
  }
  if (item.planCard) {
    blocks.push({
      id: `block:plan:${item.id}`,
      kind: "tool-result",
      source: "aho-orchestration",
      title: "方案草案",
      text: cleanPrimaryText([item.planCard.title, item.planCard.summary].filter(Boolean).join("\n")) || "主 agent 已整理方案草案。",
      evidenceRefs: evidenceRefsFromThreadItem(item),
    });
  }
  if (blocks.length === 0 && item.body?.trim()) {
    blocks.push({
      id: `block:body:${item.id}`,
      kind: item.source === "workflow" ? "tool-result" : "prose",
      source: item.source === "workflow" ? "workflow-evidence" : "codex-runtime",
      title: item.source === "workflow" ? "处理完成" : undefined,
      text: cleanPrimaryText(item.body),
      status: item.status,
    });
  }
  const evidenceRefs = evidenceRefsFromThreadItem(item);
  if (evidenceRefs.length > 0 && !blocks.some((block) => block.evidenceRefs?.length)) {
    blocks.push({
      id: `block:evidence:${item.id}`,
      kind: "evidence",
      source: "workflow-evidence",
      title: "证据",
      text: "相关证据已保存，可从详情中查看。",
      evidenceRefs,
    });
  }
  return dedupeTranscriptBlocks(blocks).filter((block) => Boolean(block.text.trim()));
}

function activityBlocksFromThreadItem(item: ThreadStreamItem): ParentAgentTranscriptBlock[] {
  const activities = item.activity ?? [];
  if (activities.length === 0) return [];
  const status = activities.filter((activity) => activity.kind === "status").at(-1);
  const toolCount = activities.filter((activity) => activity.kind === "tool").length;
  const errorCount = activities.filter((activity) => activity.kind === "error").length;
  const parts = [
    status && "label" in status ? cleanPrimaryText([status.label, status.detail].filter(Boolean).join("：")) : undefined,
    toolCount > 0 ? `已调用 ${toolCount} 个工具或命令。` : undefined,
    errorCount > 0 ? `${errorCount} 个步骤需要关注。` : undefined,
  ].filter(Boolean);
  if (parts.length === 0) return [];
  return [{
    id: `block:activity:${item.id}`,
    kind: "prose",
    source: "aho-orchestration",
    text: parts.join("\n"),
    status: item.status,
    isError: errorCount > 0,
  }];
}

function transcriptBlockFromAssistantBlock(block: AssistantTurnBlock, itemId: string): ParentAgentTranscriptBlock | null {
  if (block.kind === "usage") return null;
  if (block.kind === "status") {
    const text = cleanPrimaryText([block.title, block.text ?? block.preview].filter(Boolean).join("\n"));
    if (!text) return null;
    return {
      id: `block:status:${block.id}`,
      kind: "prose",
      source: "codex-runtime",
      text,
      status: block.status,
      isError: block.isError,
    };
  }
  if (block.kind === "command-group") {
    const commandCount = block.children?.filter((child) => child.kind === "command").length ?? 0;
    const failedCount = block.children?.filter((child) => child.kind === "command" && child.isError).length ?? 0;
    const text = cleanPrimaryText(block.text ?? block.preview ?? `已运行 ${commandCount || "多"} 条命令${failedCount ? `，${failedCount} 条需要关注` : ""}。`);
    return {
      id: `block:command-group:${block.id}`,
      kind: "tool-result",
      source: "aho-orchestration",
      title: "执行过程",
      text,
      status: block.status,
      isError: block.isError || failedCount > 0,
    };
  }
  if (block.kind === "command") {
    return {
      id: `block:command:${block.id}`,
      kind: "tool-result",
      source: "aho-orchestration",
      title: block.isError ? "命令需要关注" : "已运行命令",
      text: cleanPrimaryText(block.preview ?? (block.isError ? "工具执行失败，需要查看证据。" : "工具执行完成。")),
      status: block.status,
      isError: block.isError,
    };
  }
  if (block.kind === "tool-result" || block.kind === "file-change" || block.kind === "reasoning-summary") {
    const title = block.kind === "file-change" ? "文件变更" : cleanToolTitle(block.title);
    const rawText = block.text ?? block.preview ?? "";
    const text = isGeneratedRunContext(rawText)
      ? "planning-agent 已读取当前需求上下文并生成方案草案；完整运行上下文保留在证据中。"
      : cleanPrimaryText(rawText);
    if (!text) return null;
    return {
      id: `block:${block.kind}:${block.id}`,
      kind: block.kind === "reasoning-summary" ? "prose" : "tool-result",
      source: block.source === "codex" ? "codex-runtime" : "aho-orchestration",
      title,
      text,
      status: block.status,
      isError: block.isError,
      evidenceRefs: block.artifactRef ? [{ label: title || "证据", ref: block.artifactRef, kind: "artifact" }] : undefined,
    };
  }
  if (block.kind === "workflow-evidence") {
    return {
      id: `block:workflow-evidence:${block.id}`,
      kind: "tool-result",
      source: "workflow-evidence",
      title: cleanToolTitle(block.title) || "证据摘要",
      text: cleanPrimaryText(block.text ?? "证据已记录。"),
      status: block.status,
      isError: block.isError,
      evidenceRefs: block.artifactRef ? [{ label: cleanToolTitle(block.title) || "证据", ref: block.artifactRef, kind: "artifact" }] : undefined,
    };
  }
  if (block.kind === "plan-card") {
    const rawText = [block.title, block.text].filter(Boolean).join("\n");
    return {
      id: `block:plan-card:${block.id}`,
      kind: "tool-result",
      source: "aho-orchestration",
      title: "方案草案",
      text: isGeneratedRunContext(rawText)
        ? "主 agent 已整理方案草案；详情见方案证据。"
        : cleanPrimaryText(rawText) || "主 agent 已整理方案草案。",
      evidenceRefs: block.artifactRef ? [{ label: "方案", ref: block.artifactRef, kind: "artifact" }] : undefined,
    };
  }
  if (block.kind === "error") {
    return {
      id: `block:error:${block.id}`,
      kind: "tool-result",
      source: "aho-orchestration",
      title: "处理失败",
      text: cleanPrimaryText(block.text ?? "处理失败，需要查看证据。"),
      status: block.status,
      isError: true,
    };
  }
  const rawText = block.text ?? block.preview ?? "";
  if (isGeneratedRunContext(rawText)) return null;
  const text = cleanPrimaryText(rawText);
  if (!text) return null;
  return {
    id: `block:prose:${block.id ?? itemId}`,
    kind: "prose",
    source: block.source === "codex" ? "codex-runtime" : "aho-orchestration",
    title: cleanToolTitle(block.title),
    text,
    status: block.status,
    isError: block.isError,
    evidenceRefs: block.artifactRef ? [{ label: cleanToolTitle(block.title) || "证据", ref: block.artifactRef, kind: "artifact" }] : undefined,
  };
}

function evidenceRefsFromThreadItem(item: ThreadStreamItem): ParentAgentEvidenceRef[] {
  return (item.evidence ?? [])
    .map((evidence) => evidenceRefFromThreadEvidence(evidence))
    .filter((ref): ref is ParentAgentEvidenceRef => Boolean(ref));
}

function evidenceRefFromThreadEvidence(evidence: ThreadStreamEvidence): ParentAgentEvidenceRef | null {
  const ref = evidence.artifact ?? evidence.runId ?? evidence.actionRunId;
  if (!ref) return null;
  return {
    label: cleanPrimaryText(evidence.label) || "证据",
    ref,
    kind: evidence.artifact ? "artifact" : "run",
  };
}

function derivedTranscriptItems(workpad: WorkbenchWorkpad, includeCurrentUnderstanding: boolean): ParentAgentTranscriptItem[] {
  const blocks: ParentAgentTranscriptBlock[] = [];
  if (includeCurrentUnderstanding) {
    const text = cleanPrimaryText(workpad.intake.currentUnderstanding || workpad.intake.goal || "我会基于当前需求对话继续分析目标、约束和下一步。");
    if (text) blocks.push({ id: "derived:understanding", kind: "prose", source: "aho-orchestration", text });
  }
  const planning = planningBlock(workpad.planningArtifactBundle);
  if (planning) blocks.push(planning);
  blocks.push(...roleDelegationBlocks(workpad.rolePipeline));
  const role = rolePipelineBlock(workpad.rolePipeline);
  if (role) blocks.push(role);
  const review = resultReviewBlock(workpad.resultReview);
  if (review) blocks.push(review);
  if (blocks.length === 0) return [];
  return [{
    id: `parent-transcript:derived:${workpad.boundChangeId ?? workpad.conversationId ?? workpad.title}`,
    actor: "parent-agent",
    derived: true,
    blocks,
  }];
}

function planningBlock(bundle: WorkbenchPlanningArtifactBundle | undefined): ParentAgentTranscriptBlock | null {
  if (!bundle) return null;
  const parts = [
    bundle.goal,
    bundle.design ? `实现思路：${bundle.design}` : undefined,
    bundle.acceptanceCriteria.length ? `验收重点：${bundle.acceptanceCriteria.map(cleanPrimaryText).join("；")}` : undefined,
  ].filter(Boolean);
  return {
    id: `derived:planning:${bundle.id}`,
    kind: "tool-result",
    source: "aho-orchestration",
    title: bundle.status === "confirmed" ? "已确认方案" : "方案草案",
    text: cleanPrimaryText(parts.join("\n")) || "主 agent 已整理方案。",
    evidenceRefs: bundle.artifact ? [{ label: "方案", ref: bundle.artifact, kind: "artifact" }] : undefined,
  };
}

function roleDelegationBlocks(pipeline: WorkbenchRolePipelineSummary | undefined): ParentAgentTranscriptBlock[] {
  if (!pipeline) return [];
  const tasks = pipeline.agentTasks.filter((task) => task.kind === "foreground").slice(-8);
  const capability = detectDelegateTaskMcpCapability();
  const capabilityBlock: ParentAgentTranscriptBlock | null = tasks.length > 0 && !capability.available
    ? {
        id: "derived:delegate-task:capability-unavailable",
        kind: "process",
        source: "aho-orchestration",
        title: "delegateTask 运行时能力",
        text: "本地 delegateTask 合约和策略已启用；当前 Codex runtime 未配置动态加载 AHO MCP tool，因此 AHO 通过受控 orchestrator-policy 路径记录委派，不伪装运行时 MCP 调用成功。",
        status: "capability-unavailable",
      }
    : null;
  const taskBlocks = tasks.flatMap((task) => {
    const policyBlock: ParentAgentTranscriptBlock | null = task.policyAuditRefs.length > 0
      ? {
          id: `derived:delegate-task:policy:${task.id}`,
          kind: "process",
          source: "aho-orchestration",
          title: "ToolPolicyGate 已检查",
          text: "主 agent 的委派请求已经过角色、范围、权限和人类确认边界检查。",
          status: "allowed",
          evidenceRefs: task.policyAuditRefs.map((ref) => ({ label: "策略审计", ref, kind: "artifact" as const })),
        }
      : null;
    const title = task.status === "completed"
      ? `${roleLabel(task.roleId)} 返回结果`
      : task.status === "failed" || task.status === "needs-user-input"
        ? `${roleLabel(task.roleId)} 需要处理`
        : `调用 ${task.roleId}`;
    const text = cleanPrimaryText(task.resultSummary ?? task.summary);
    const evidenceRefs = dedupeEvidenceRefs(task.evidenceRefs.map((ref) => ({ label: roleLabel(task.roleId), ref, kind: "artifact" as const })));
    const block: ParentAgentTranscriptBlock = {
      id: `derived:delegate-task:${task.id}:${task.status}`,
      kind: "process",
      source: "aho-orchestration",
      title,
      text: text || "角色任务状态已更新。",
      status: task.status,
      isError: task.status === "failed" || task.status === "needs-user-input",
      evidenceRefs,
    };
    const boundaryBlock: ParentAgentTranscriptBlock | null = task.boundaryAuditRefs.length > 0
      ? {
          id: `derived:delegate-task:boundary:${task.id}`,
          kind: "process",
          source: "workflow-evidence",
          title: task.boundaryViolations.length > 0 ? "边界审计发现越界" : "边界审计通过",
          text: task.boundaryViolations.length > 0
            ? task.boundaryViolations.join("\n")
            : `${roleLabel(task.roleId)} 的输出没有越过本次需求边界。`,
          status: task.boundaryViolations.length > 0 ? "failed" : "passed",
          isError: task.boundaryViolations.length > 0,
          evidenceRefs: task.boundaryAuditRefs.map((ref) => ({ label: "边界审计", ref, kind: "artifact" as const })),
        }
      : null;
    return [policyBlock, block, boundaryBlock].filter((item): item is ParentAgentTranscriptBlock => Boolean(item));
  });
  return capabilityBlock ? [capabilityBlock, ...taskBlocks] : taskBlocks;
}

function rolePipelineBlock(pipeline: WorkbenchRolePipelineSummary | undefined): ParentAgentTranscriptBlock | null {
  if (!pipeline) return null;
  const runSummaries = pipeline.runs.map((run) => `${roleLabel(run.roleId)}：${cleanPrimaryText(run.summary)}`).filter(Boolean);
  const text = runSummaries.length > 0 ? runSummaries.join("\n") : `当前执行阶段：${stageLabel(pipeline.stage)}。`;
  return {
    id: `derived:role-pipeline:${pipeline.stage}:${pipeline.status}`,
    kind: "tool-result",
    source: "workflow-evidence",
    title: "执行进度",
    text,
    status: pipeline.status,
    evidenceRefs: dedupeEvidenceRefs(pipeline.runs.flatMap((run) => run.artifact ? [{ label: roleLabel(run.roleId), ref: run.artifact, kind: "artifact" as const }] : [])),
  };
}

function resultReviewBlock(review: WorkbenchResultReview | undefined): ParentAgentTranscriptBlock | null {
  if (!review) return null;
  return {
    id: `derived:result-review:${review.worktreeId ?? review.status}`,
    kind: "tool-result",
    source: "workflow-evidence",
    title: "结果摘要",
    text: cleanPrimaryText(`${review.title}\n${review.summary}`),
    status: review.status,
    evidenceRefs: dedupeEvidenceRefs(review.evidence.map((evidence) => ({
      label: cleanPrimaryText(evidence.label) || "证据",
      ref: evidence.artifact ?? evidence.id,
      kind: evidence.artifact ? "artifact" as const : "run" as const,
    }))),
  };
}

function roleLabel(roleId: string): string {
  const labels: Record<string, string> = {
    "planning-agent": "规划",
    "coder-agent": "实现",
    "rework-coder": "修改",
    validator: "验证",
    "auditor-agent": "审查",
  };
  return labels[roleId] ?? "角色结果";
}

function stageLabel(stage: WorkbenchRolePipelineSummary["stage"]): string {
  const labels: Record<WorkbenchRolePipelineSummary["stage"], string> = {
    planning: "规划",
    coding: "实现",
    validation: "验证",
    audit: "审查",
    rework: "修改",
    done: "完成",
    "needs-user-input": "等待补充",
  };
  return labels[stage];
}

function dedupeTranscriptBlocks(blocks: ParentAgentTranscriptBlock[]): ParentAgentTranscriptBlock[] {
  const seen = new Set<string>();
  const result: ParentAgentTranscriptBlock[] = [];
  for (const block of blocks) {
    const refs = block.evidenceRefs ? dedupeEvidenceRefs(block.evidenceRefs) : undefined;
    const key = `${block.kind}:${block.title ?? ""}:${block.text}:${block.status ?? ""}:${refs?.map((ref) => ref.ref).join("|") ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ ...block, ...(refs ? { evidenceRefs: refs } : {}) });
  }
  return result;
}

function dedupeTranscriptEvidenceRefs(items: ParentAgentTranscriptItem[]): ParentAgentTranscriptItem[] {
  const seen = new Set<string>();
  return items.flatMap((item) => {
    const blocks = item.blocks.flatMap((block) => {
      if (!block.evidenceRefs?.length) return [block];
      const refs = block.evidenceRefs.filter((ref) => {
        const key = `${ref.kind}:${ref.ref}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      if (refs.length === 0 && block.kind === "evidence") return [];
      return [{ ...block, ...(refs.length > 0 ? { evidenceRefs: refs } : { evidenceRefs: undefined }) }];
    });
    return blocks.length > 0 ? [{ ...item, blocks }] : [];
  });
}

function dedupeEvidenceRefs(refs: ParentAgentEvidenceRef[] | undefined): ParentAgentEvidenceRef[] | undefined {
  if (!refs || refs.length === 0) return undefined;
  const seen = new Set<string>();
  const result: ParentAgentEvidenceRef[] = [];
  for (const ref of refs) {
    const key = `${ref.kind}:${ref.ref}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(ref);
  }
  return result;
}

function isGeneratedRunContext(value: string | undefined): boolean {
  const text = value ?? "";
  return text.includes("# AHO 需求对话 Chat")
    || text.includes("# Run Context Projection")
    || text.includes("## Current User Message")
    || text.includes("## User Message");
}

function cleanToolTitle(value: string | undefined): string | undefined {
  const text = cleanPrimaryText(value ?? "");
  if (!text || text === "AI" || text === "AI 回复" || text === "执行结果") return undefined;
  return text;
}

function cleanPrimaryText(value: string | undefined): string {
  return (value ?? "")
    .replace(/\bWorkpad\b/g, "需求对话")
    .replace(/\bTopic\b/g, "需求对话")
    .replace(/\bChange\b/g, "需求")
    .replace(/\bTaskRun\b/g, "执行记录")
    .replace(/\bWorkerLease\b/g, "执行占用")
    .replace(/\bDemandWorker\b/g, "后台执行")
    .replace(/\bTaskRepository\b/g, "任务仓库")
    .replace(/\baudit-blocked\b/gi, "需要修改或补证据")
    .replace(/\bblocked\b/gi, "需要处理")
    .replace(/\bT-\d+\b/g, "任务")
    .replace(/\bAC-\d+\b/g, "验收点")
    .trim();
}
