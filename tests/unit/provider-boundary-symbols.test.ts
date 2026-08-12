import { describe, expect, it } from "vitest";
import { containsRetiredProviderSymbol } from "../../scripts/provider-boundary-symbols.mjs";

describe("provider boundary retired symbols", () => {
  it("still rejects the standalone retired child-agent symbol", () => {
    expect(containsRetiredProviderSymbol('roleId: "child-agent"', "child-agent")).toBe(true);
  });

  it("accepts the provider-neutral native-child-agent role", () => {
    expect(containsRetiredProviderSymbol('roleId: "native-child-agent"', "child-agent")).toBe(false);
  });

  it("leaves unrelated text and other retired symbol checks unchanged", () => {
    expect(containsRetiredProviderSymbol("ordinary agent surface", "child-agent")).toBe(false);
    expect(containsRetiredProviderSymbol("spawn_agent", "spawn_agent")).toBe(true);
    expect(containsRetiredProviderSymbol("spawn agent", "spawn_agent")).toBe(false);
  });
});
