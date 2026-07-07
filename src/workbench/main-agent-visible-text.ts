const PLANNING_SECTION_HEADING_PATTERN =
  /(?:^|\n)\s{0,3}(?:#{1,4}\s*)?(目标|Goal|Constraints|约束|Acceptance Criteria|验收标准|Implementation Plan|实现方案|任务清单|Tasks|风险|Risks|待确认点|Open Questions)\s*[:：]?\s*(?:\n|$)/gi;

const PROJECT_SCOPED_CHILD_AGENT_LEAK_PATTERNS = [
  /(?:^|\n)\s*planning-agent\s*已启动/i,
  /(?:^|\n)\s*我会按\s*planning-agent/i,
  /(?:^|\n)\s*作为\s*planning-agent/i,
  /(?:^|\n).*(?:交给|委派|调用|转给)\s*(?:planning-agent|计划代理|子\s*Agent|子代理)/i,
  /(?:^|\n).*(?:planning-agent|计划代理|子\s*Agent|子代理).*(?:交给|委派|调用|转给)/i,
  /(?:^|\n).*计划代理.*(?:已启动|已经启动|启动了|返回|给出)/i,
  /(?:^|\n).*子\s*Agent.*(?:已启动|已经启动|启动了|返回|给出)/i,
  /(?:^|\n).*子代理.*(?:已启动|已经启动|启动了|返回|给出)/i,
  /(?:^|\n).*Agent\s*(?:workspace|工作区|对话).*计划/i,
  /(?:^|\n).*原生计划能力/i,
  /(?:^|\n).*原生计划事件/i,
  /(?:^|\n).*已通过原生/i,
  /(?:^|\n).*规划会话已启动/i,
  /(?:^|\n).*运行时.*规划能力/i,
  /(?:^|\n).*已用.*(?:只读计划|计划能力|Plan Mode)/i,
  /(?:^|\n).*已启动.*(?:只读规划|计划记录|计划会话|规划协作)/i,
  /(?:^|\n).*记录了一个只读计划/i,
  /(?:^|\n)\s*(?:实施计划|执行计划|计划内容|计划如下|修改计划)\s*[:：]/i,
  /(?:^|\n)\s*验证方式\s*[:：]/i,
  /(?:^|\n)\s*当前约束\s*[:：]/i,
  /子代理启动参数/i,
  /专门的规划子代理/i,
];

const MAIN_AGENT_VISIBLE_TEXT_FALLBACK = "我已经理解目标。下一步需要先把需求和验收方式说清楚；在你确认前我不会修改文件或执行代码。";

export function stripAccidentalPlanningDraftFromMainAgentText(value: string | undefined): string {
  const withoutPlanTags = (value ?? "").replace(/<proposed_plan\b[^>]*>[\s\S]*?<\/proposed_plan>/gi, "").trim();
  if (!withoutPlanTags) return "";

  const matches = [...withoutPlanTags.matchAll(PLANNING_SECTION_HEADING_PATTERN)];
  if (matches.length < 2) return withoutPlanTags;

  const start = matches[0]?.index ?? -1;
  if (start <= 0) {
    return "我已经收到需求。下一步需要先确认目标和验收方式，再进入规划。";
  }
  const prefix = withoutPlanTags.slice(0, start).trim();
  return prefix || "我已经收到需求。下一步需要先确认目标和验收方式，再进入规划。";
}

export function stripProjectScopedChildAgentLeakFromMainAgentText(value: string | undefined): string {
  const normalized = (value ?? "").trim();
  if (!normalized) return "";
  const indexes = PROJECT_SCOPED_CHILD_AGENT_LEAK_PATTERNS
    .map((pattern) => normalized.search(pattern))
    .filter((index) => index >= 0);
  if (indexes.length === 0) return normalized;
  const cut = Math.min(...indexes);
  const parentText = normalized.slice(0, cut).trim();
  return parentText || MAIN_AGENT_VISIBLE_TEXT_FALLBACK;
}

export function sanitizeMainAgentVisibleText(value: string | undefined): string {
  return stripAccidentalPlanningDraftFromMainAgentText(stripProjectScopedChildAgentLeakFromMainAgentText(value));
}
