import { describe, expect, it } from "vitest";
import { extractProposedPlanBlock, sanitizeProposedPlanForConversation, wrapPlanModePrompt } from "../../src/workbench/planning/proposed-plan.js";

describe("Codex proposed plan extraction", () => {
  it("extracts the first proposed_plan block and leaves surrounding prose as non-authoritative context", () => {
    const result = extractProposedPlanBlock([
      "Draft context before the proposal.",
      "<proposed_plan>",
      "# Plan",
      "## Tasks",
      "- Update the Workbench planning gate.",
      "</proposed_plan>",
      "Ignore later prose.",
    ].join("\n"));

    expect(result.proposedPlanMd).toContain("# Plan");
    expect(result.proseWithoutPlan).toContain("Draft context before the proposal.");
    expect(result.proseWithoutPlan).not.toContain("<proposed_plan>");
    expect(result.headings).toEqual(["Plan", "Tasks"]);
    expect(result.warnings).toEqual([]);
  });

  it("reports a missing proposed_plan block without corrupting native Plan Mode text", () => {
    const result = extractProposedPlanBlock([
      "# Plan",
      "## Scope",
      "Use the accepted Workbench Change only.",
    ].join("\n"));

    expect(result.proposedPlanMd).toBeNull();
    expect(result.proseWithoutPlan).toContain("Use the accepted Workbench Change only.");
    expect(result.headings).toEqual(["Plan", "Scope"]);
    expect(result.warnings[0]).toContain("did not include a <proposed_plan> block");
  });

  it("recognizes common Codex plan labels that are not Markdown headings", () => {
    const result = extractProposedPlanBlock([
      "<proposed_plan>",
      "目标:",
      "- Add src/polite.ts.",
      "范围约束",
      "Only one source file.",
      "验收标准",
      "AC-001: politeGreeting returns Hello, Ada!",
      "任务清单:",
      "- T-001: Implement politeGreeting.",
      "</proposed_plan>",
    ].join("\n"));

    expect(result.proposedPlanMd).toContain("目标:");
    expect(result.headings).toEqual(["目标", "范围约束", "验收标准", "任务清单"]);
    expect(result.warnings).toEqual([]);
  });

  it("wraps fallback prompts with a proposal-only Plan Mode contract", () => {
    const prompt = wrapPlanModePrompt("User demand");

    expect(prompt).toContain("<proposed_plan>");
    expect(prompt).toContain("Do not modify files");
    expect(prompt).toContain("User demand");
    expect(prompt).not.toContain("AHO Workbench");
    expect(prompt).not.toContain("proposal-only planning evidence");
  });

  it("sanitizes visible conversation text without changing stored plan extraction", () => {
    const visible = sanitizeProposedPlanForConversation([
      "I checked AHO Harness context.",
      "<proposed_plan>",
      "目标:",
      "给用户一份可读方案。",
      "- 当前 active change 为 demo，AC-001 仍为 TBD。",
      "- 仓库扫描显示工作区 dirty，可用脚本为 node test.mjs。",
      "实现方案:",
      "只展示方案正文。",
      "</proposed_plan>",
    ].join("\n"));

    expect(visible).toContain("目标:");
    expect(visible).toContain("只展示方案正文。");
    expect(visible).not.toContain("<proposed_plan>");
    expect(visible).not.toContain("Harness");
    expect(visible).not.toContain("active change");
    expect(visible).not.toContain("AC-001");
    expect(visible).not.toContain("TBD");
    expect(visible).not.toContain("dirty");
    expect(visible).not.toContain("node test.mjs");
  });
});
