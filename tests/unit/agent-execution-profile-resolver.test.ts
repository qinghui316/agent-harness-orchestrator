import { describe, expect, it } from "vitest";
import type { AgentCatalog } from "../../src/agent/catalog.js";
import {
  registeredAgentOperationProfile,
  resolveRegisteredAgentExecutionProfile,
} from "../../src/workbench/agent-execution-profile-resolver.js";

const catalog: AgentCatalog = {
  version: "1.0",
  agents: [
    entry("planning-agent"),
    entry("coder-agent"),
    entry("auditor-agent"),
    entry("rework-coder"),
    entry("spec-test-proposer"),
    entry("spec-test-generator"),
    entry("harness-evolution-agent"),
    entry("custom-agent"),
  ],
};

describe("AgentExecutionProfileResolver", () => {
  it.each([
    ["planning-agent", "planning"],
    ["coder-agent", "coder"],
    ["auditor-agent", "auditor"],
    ["rework-coder", "coder"],
    ["spec-test-proposer", "auditor"],
    ["spec-test-generator", "coder"],
    ["harness-evolution-agent", "evolution"],
  ] as const)("maps registered role %s to %s", (roleId, profile) => {
    expect(registeredAgentOperationProfile(catalog, roleId)).toBe(profile);
  });

  it("fails closed for unknown, generic, and catalog-only roles", () => {
    expect(resolveRegisteredAgentExecutionProfile(catalog, ["child", "agent"].join("-"))).toBeNull();
    expect(resolveRegisteredAgentExecutionProfile(catalog, "custom-agent")).toBeNull();
    expect(resolveRegisteredAgentExecutionProfile(catalog, "missing-agent")).toBeNull();
    expect(resolveRegisteredAgentExecutionProfile(catalog, undefined)).toBeNull();
  });
});

function entry(roleId: string): AgentCatalog["agents"][number] {
  return {
    roleId,
    displayName: roleId,
    description: "",
    profilePath: `agents/${roleId}.md`,
    writeCapability: "read-only",
    allowedInputs: [],
    allowedOutputs: [],
    allowedSkills: [],
    blockedSkills: [],
    requiredGates: [],
    delegatable: false,
  };
}
