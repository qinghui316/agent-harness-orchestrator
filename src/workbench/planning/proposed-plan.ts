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
    "You are preparing an implementation plan for AHO Workbench planning.",
    "Use Plan Mode behavior: explore the demand context from the prompt, identify scope, constraints, acceptance criteria, implementation steps, risks, and verification.",
    "Do not modify files. This is proposal-only planning evidence.",
    "Return exactly one final <proposed_plan>...</proposed_plan> block. The block must be decision-complete for implementation review.",
    "",
    input,
  ].join("\n");
}
