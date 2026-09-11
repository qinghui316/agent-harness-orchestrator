import { describe, expect, it } from "vitest";
import {
  EXECUTION_CONTRACT_FAMILIES,
  ExecutionContractRegistry,
  resolveExecutionContract,
  storedExecutionContract,
} from "../../src/provider-runtime/index.js";

describe("Provider execution contract registry", () => {
  it.each([
    ["agent", "agent", "conversation-turn", "main-agent", "agent.turn"],
    ["agent", "agent", "review", "main-agent", "agent.review"],
    ["agent", "agent", "conversation-turn", "native-child-agent", "agent.native-child"],
    ["harness", "main", "conversation-turn", "main-agent", "aho.main"],
    ["harness", "planning", "conversation-turn", "planning-agent", "aho.planning"],
    ["harness", "coder", "conversation-turn", "coder-agent", "aho.coder"],
    ["harness", "auditor", "conversation-turn", "auditor-agent", "aho.auditor"],
    ["harness", "evolution", "conversation-turn", "evolution-agent", "aho.evolution"],
    ["harness", "evolution-scorer", "conversation-turn", "scorer-agent", "aho.evolution-scorer"],
  ] as const)("resolves %s/%s/%s/%s to %s", (productMode, operationProfile, operationKind, roleId, family) => {
    expect(resolveExecutionContract({
      productMode,
      operationProfile,
      operationKind,
      roleId,
      providerAdapterVersion: "adapter-v1",
    })).toMatchObject({ family, epoch: 1, providerAdapterVersion: "adapter-v1" });
  });

  it("keeps policy identity stable across Adapter releases", () => {
    const first = resolveExecutionContract({ ...agentTurnInput(), providerAdapterVersion: "adapter-v1" });
    const second = resolveExecutionContract({ ...agentTurnInput(), providerAdapterVersion: "adapter-v2" });
    expect(second).toMatchObject({ family: first.family, epoch: first.epoch, policyHash: first.policyHash });
    expect(second.providerAdapterVersion).toBe("adapter-v2");
  });

  it("requires every registered family exactly once", () => {
    expect(() => new ExecutionContractRegistry(EXECUTION_CONTRACT_FAMILIES.slice(1).map(definition))).toThrow(/not registered/);
    expect(() => new ExecutionContractRegistry([
      ...EXECUTION_CONTRACT_FAMILIES.map(definition),
      definition("agent.turn"),
    ])).toThrow(/registered twice/);
  });

  it("keeps unrelated execution families stable when one family advances", () => {
    const upgraded = new ExecutionContractRegistry(EXECUTION_CONTRACT_FAMILIES.map((family) => ({
      ...definition(family),
      epoch: family === "agent.turn" ? 2 : 1,
    })));

    expect(upgraded.resolve({ ...agentTurnInput(), providerAdapterVersion: "adapter-v1" }).epoch).toBe(2);
    expect(upgraded.resolve({
      productMode: "harness",
      operationProfile: "coder",
      operationKind: "conversation-turn",
      roleId: "coder-agent",
      providerAdapterVersion: "adapter-v1",
    })).toMatchObject({ family: "aho.coder", epoch: 1 });
  });

  it.each([
    ["short policy hash", { policyHash: "x" }],
    ["non-hex policy hash", { policyHash: "g".repeat(64) }],
    ["blank Adapter version", { providerAdapterVersion: "   " }],
    ["padded Adapter version", { providerAdapterVersion: " adapter-v1 " }],
    ["oversized Adapter version", { providerAdapterVersion: "x".repeat(129) }],
  ])("rejects %s in a versioned stored identity", (_label, patch) => {
    const valid = resolveExecutionContract({ ...agentTurnInput(), providerAdapterVersion: "adapter-v1" });
    expect(() => storedExecutionContract({ ...valid, ...patch })).toThrow(/execution contract/i);
  });
});

function agentTurnInput() {
  return {
    productMode: "agent" as const,
    operationProfile: "agent" as const,
    operationKind: "conversation-turn" as const,
    roleId: "main-agent",
  };
}

function definition(family: typeof EXECUTION_CONTRACT_FAMILIES[number]) {
  return { family, epoch: 1, policyVersion: `${family}-test-v1`, summary: `${family} test` };
}
