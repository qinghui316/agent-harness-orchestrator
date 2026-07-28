import { describe, expect, it } from "vitest";
import { deriveConversationTitle, normalizeConversationTitle } from "../../src/workbench/conversation-service.js";

describe("Conversation title owner", () => {
  it("derives a deterministic title from the first effective demand line", () => {
    expect(deriveConversationTitle("\n  > ## -   Build   the checkout flow  \nIgnored detail")).toBe("Build the checkout flow");
    expect(deriveConversationTitle(`${"你".repeat(52)} trailing`)).toBe("你".repeat(48));
  });

  it("uses the attachment-only title and rejects an empty demand", () => {
    expect(deriveConversationTitle("  \n", true)).toBe("附件需求");
    expect(() => deriveConversationTitle("  \n")).toThrow("text or attachment");
  });

  it("normalizes manual titles and enforces the 80-code-point limit", () => {
    expect(normalizeConversationTitle("  Checkout\n  polish ")).toBe("Checkout polish");
    expect(normalizeConversationTitle("你".repeat(80))).toBe("你".repeat(80));
    expect(() => normalizeConversationTitle(" ")).toThrow("1 to 80");
    expect(() => normalizeConversationTitle("你".repeat(81))).toThrow("1 to 80");
  });
});
