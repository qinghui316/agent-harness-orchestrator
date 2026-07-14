import { describe, expect, it } from "vitest";
import { commandGroupSummary, groupConsecutiveCommandBlocks } from "../../src/command-transcript.js";
import { baseAgentDisplayLabel, composeAgentDisplayLabel } from "../../src/agent-display-label.js";
import type { AssistantTurnBlock } from "../../src/workbench/types.js";

function command(id: string, status: string = "completed"): AssistantTurnBlock {
  return {
    id,
    kind: "command",
    source: "codex",
    status,
    command: `echo ${id}`,
  };
}

describe("shared command transcript projection", () => {
  it("keeps one group identity while an adjacent command group grows", () => {
    const one = groupConsecutiveCommandBlocks([command("a")]);
    const two = groupConsecutiveCommandBlocks([command("a"), command("b")]);
    const three = groupConsecutiveCommandBlocks([command("a"), command("b"), command("c")]);

    expect(two).toHaveLength(1);
    expect(three).toHaveLength(1);
    expect(one[0].id).toBe("a");
    expect(two[0].id).toBe("a");
    expect(two[0].id).toBe(one[0].id);
    expect(three[0].id).toBe(two[0].id);
    expect(commandGroupSummary(three[0])).toBe("运行了 3 条命令 · 全部完成");
  });

  it("ends a command group at prose and reports failed results deterministically", () => {
    const prose: AssistantTurnBlock = { id: "p", kind: "prose", source: "codex", text: "next" };
    const grouped = groupConsecutiveCommandBlocks([command("a"), command("b", "failed"), prose, command("c")]);

    expect(grouped.map((block) => block.kind)).toEqual(["command-group", "prose", "command"]);
    expect(commandGroupSummary(grouped[0])).toBe("运行了 2 条命令 · 1 条失败");
  });
});

describe("Agent display labels", () => {
  it("preserves digits that belong to a provider native name", () => {
    const label = composeAgentDisplayLabel("planning-agent", "Sagan 2");
    expect(label).toBe("Plan Agent · Sagan 2");
    expect(baseAgentDisplayLabel(label, "planning-agent")).toBe(label);
  });

  it("only removes numbering appended to a role-only label", () => {
    expect(baseAgentDisplayLabel("Coder Agent 2", "coder-agent")).toBe("Coder Agent");
  });
});
