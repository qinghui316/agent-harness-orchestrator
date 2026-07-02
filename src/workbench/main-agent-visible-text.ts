const PLANNING_SECTION_HEADING_PATTERN =
  /(?:^|\n)\s{0,3}(?:#{1,4}\s*)?(目标|Goal|Constraints|约束|Acceptance Criteria|验收标准|Implementation Plan|实现方案|任务清单|Tasks|风险|Risks|待确认点|Open Questions)\s*[:：]?\s*(?:\n|$)/gi;

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
