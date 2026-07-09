export interface ProposedPlanExtraction {
  proposedPlanMd: string | null;
  proseWithoutPlan: string;
  headings: string[];
  warnings: string[];
}

const PROPOSED_PLAN_PATTERN = /<proposed_plan>\s*([\s\S]*?)\s*<\/proposed_plan>/i;

export function extractProposedPlanBlock(text: string): ProposedPlanExtraction {
  const match = PROPOSED_PLAN_PATTERN.exec(text);
  const warnings: string[] = [];
  if (!match?.[1]?.trim()) {
    return {
      proposedPlanMd: null,
      proseWithoutPlan: text.trim(),
      headings: extractMarkdownHeadings(text),
      warnings: ["Codex planning output did not include a <proposed_plan> block; AHO used deterministic planning fallback."],
    };
  }
  const proposedPlanMd = match[1].trim();
  const proseWithoutPlan = text.replace(match[0], "").trim();
  const headings = extractMarkdownHeadings(proposedPlanMd);
  if (headings.length === 0) warnings.push("Codex proposed plan did not include recognizable Markdown headings.");
  return {
    proposedPlanMd,
    proseWithoutPlan,
    headings,
    warnings,
  };
}

const CONVERSATION_INTERNAL_LINE_PATTERN = /\b(AHO|Harness|Workpad|TaskRun|WorkflowRun|AgentTask|Run Context Projection|active change|review status|validation|audit|worktree|gate|canonical|artifact|proposal-only|planning evidence|close gate|ECL)\b|AC-\d+|T-\d+|\bTBD\b|ui-final-\d+|node\s+test\.mjs|仓库|工作区|脚本|占位|关闭条件|当前阶段/i;

export function sanitizeProposedPlanForConversation(markdown: string): string {
  const extracted = markdown.includes("<proposed_plan")
    ? extractProposedPlanBlock(markdown).proposedPlanMd ?? markdown
    : markdown;
  const withoutTags = extracted
    .replace(/<\/?proposed_plan>/gi, "")
    .trim();
  const filtered = withoutTags
    .split(/\r?\n/)
    .filter((line) => !CONVERSATION_INTERNAL_LINE_PATTERN.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return filtered || withoutTags;
}

function extractMarkdownHeadings(markdown: string): string[] {
  return markdown
    .split(/\r?\n/)
    .map((line) => extractHeading(line))
    .filter((item): item is string => Boolean(item));
}

function extractHeading(line: string): string | null {
  const trimmed = line.trim();
  const markdownHeading = /^#{1,6}\s+(.+?)\s*$/.exec(trimmed)?.[1]?.trim();
  if (markdownHeading) return markdownHeading;
  const bulletHeading = /^[-*]\s+(目标|范围约束|约束|验收标准|实现方案|任务清单|验证计划|风险|待确认点|Goal|Scope|Constraints|Acceptance Criteria|Implementation Plan|Tasks|Verification|Risks|Open Questions)\s*[:：]?\s*$/i.exec(trimmed)?.[1]?.trim();
  if (bulletHeading) return bulletHeading;
  const labelHeading = /^(目标|范围约束|约束|验收标准|实现方案|任务清单|验证计划|风险|待确认点|Goal|Scope|Constraints|Acceptance Criteria|Implementation Plan|Tasks|Verification|Risks|Open Questions)\s*[:：]?\s*$/i.exec(trimmed)?.[1]?.trim();
  return labelHeading ?? null;
}

export function wrapPlanModePrompt(input: string): string {
  return [
    "You are preparing a user-reviewable implementation plan.",
    "Use Plan Mode behavior: explore the demand context from the prompt, identify scope, constraints, acceptance criteria, implementation steps, risks, and verification.",
    "Do not modify files.",
    "Write for the user. Do not mention internal product mechanics, change ids, repository scans, dirty status, script names, evidence ledgers, gates, artifacts, queues, runs, validation/audit records, or close conditions unless the user explicitly asked for those details.",
    "Return exactly one final <proposed_plan>...</proposed_plan> block. The block must be decision-complete for implementation review.",
    "",
    input,
  ].join("\n");
}
