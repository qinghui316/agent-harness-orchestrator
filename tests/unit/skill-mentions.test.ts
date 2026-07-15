import { describe, expect, it } from "vitest";
import { extractInlineSkillMentions } from "../../src/web/src/shell/skill-mentions.js";
import type { SkillListItem } from "../../src/web/src/types.js";

const skills: SkillListItem[] = [{
  skillId: "pricing-helper",
  name: "Pricing Helper",
  description: "Pricing helper.",
  sourcePath: "E:/skills/pricing-helper",
  sourceKind: "custom",
  contentHash: "hash-a",
  compatibility: { requiredCapabilities: [] },
  enabledProject: false,
  enabledTopics: [],
  disabledTopics: [],
  providerBindings: [{ providerId: "codex", bindingKind: "materialized", status: "ready", contentHash: "hash-a" }],
}, {
  skillId: "review-code",
  name: "review-code",
  description: "Review code.",
  sourcePath: "E:/skills/review-code",
  sourceKind: "custom",
  contentHash: "hash-b",
  compatibility: { requiredCapabilities: [] },
  enabledProject: false,
  enabledTopics: [],
  disabledTopics: [],
  providerBindings: [{ providerId: "codex", bindingKind: "materialized", status: "ready", contentHash: "hash-b" }],
}];

describe("composer Skill mentions", () => {
  it("extracts slash and dollar Skill tokens and cleans matched text", () => {
    const result = extractInlineSkillMentions("/pricing-helper $review-code 请检查价格逻辑", skills);

    expect(result.skillIds).toEqual(["pricing-helper", "review-code"]);
    expect(result.cleanedText).toBe("请检查价格逻辑");
  });

  it("keeps unmatched tokens as ordinary user text", () => {
    const result = extractInlineSkillMentions("/unknown 请检查价格逻辑", skills);

    expect(result.skillIds).toEqual([]);
    expect(result.cleanedText).toBe("/unknown 请检查价格逻辑");
  });

  it("matches display-name aliases and de-duplicates ids", () => {
    const result = extractInlineSkillMentions("/Pricing Helper /pricing-helper 请检查", skills);

    expect(result.skillIds).toEqual(["pricing-helper"]);
    expect(result.cleanedText).toBe("请检查");
  });
});
