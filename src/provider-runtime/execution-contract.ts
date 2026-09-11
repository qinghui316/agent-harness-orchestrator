import { createHash } from "node:crypto";
import type { ProductMode, ProviderOperationProfile } from "./types.js";

export const EXECUTION_CONTRACT_FAMILIES = [
  "agent.turn",
  "agent.review",
  "agent.native-child",
  "aho.main",
  "aho.planning",
  "aho.coder",
  "aho.tester",
  "aho.auditor",
  "aho.evolution",
  "aho.evolution-scorer",
] as const;

export type ExecutionContractFamily = typeof EXECUTION_CONTRACT_FAMILIES[number];

export interface ExecutionContractIdentity {
  family: ExecutionContractFamily;
  epoch: number;
  policyHash: string;
  providerAdapterVersion: string;
}

export type StoredExecutionContractIdentity =
  | {
      kind: "legacy";
      family: "legacy-v0";
      epoch: 0;
      policyHash: null;
      providerAdapterVersion: null;
    }
  | ({
      kind: "versioned";
    } & ExecutionContractIdentity);

export interface ExecutionContractDefinition {
  family: ExecutionContractFamily;
  epoch: number;
  policyVersion: string;
  summary: string;
}

export interface ExecutionContractResolutionInput {
  productMode: ProductMode;
  operationProfile: ProviderOperationProfile;
  operationKind: "conversation-turn" | "review";
  roleId: string;
  providerAdapterVersion: string;
}

const DEFAULT_DEFINITIONS: readonly ExecutionContractDefinition[] = [
  definition("agent.turn", "agent-turn-v1", "Agent 按当前会话配置执行任务。"),
  definition("agent.review", "agent-review-v1", "代码审查按当前只读审查方式执行。"),
  definition("agent.native-child", "agent-native-child-v1", "子 Agent 按当前父任务边界执行。"),
  definition("aho.main", "aho-main-v1", "AHO Main 按当前协作入口执行。"),
  definition("aho.planning", "aho-planning-v1", "AHO Planning 按当前规划职责执行。"),
  definition("aho.coder", "aho-coder-v1", "AHO Coder 按当前开发和返工职责执行。"),
  definition("aho.tester", "aho-tester-v1", "AHO Tester 按当前本地检查职责执行。"),
  definition("aho.auditor", "aho-auditor-v1", "AHO Auditor 按当前只读审查职责执行。"),
  definition("aho.evolution", "aho-evolution-v1", "Harness Evolution 按当前演进职责执行。"),
  definition("aho.evolution-scorer", "aho-evolution-scorer-v1", "Harness Evolution Scorer 按当前评分职责执行。"),
];

export class ExecutionContractRegistry {
  private readonly definitions: ReadonlyMap<ExecutionContractFamily, ExecutionContractDefinition>;

  constructor(definitions: readonly ExecutionContractDefinition[] = DEFAULT_DEFINITIONS) {
    const indexed = new Map<ExecutionContractFamily, ExecutionContractDefinition>();
    for (const value of definitions) {
      if (!EXECUTION_CONTRACT_FAMILIES.includes(value.family)) throw new Error("Unknown execution contract family: " + value.family);
      if (!Number.isSafeInteger(value.epoch) || value.epoch < 1) throw new Error("Execution contract epoch is invalid: " + value.family);
      if (!value.policyVersion.trim() || !value.summary.trim()) throw new Error("Execution contract policy is incomplete: " + value.family);
      if (indexed.has(value.family)) throw new Error("Execution contract family is registered twice: " + value.family);
      indexed.set(value.family, Object.freeze({ ...value }));
    }
    for (const family of EXECUTION_CONTRACT_FAMILIES) {
      if (!indexed.has(family)) throw new Error("Execution contract family is not registered: " + family);
    }
    this.definitions = indexed;
  }

  read(family: ExecutionContractFamily): ExecutionContractDefinition {
    return this.definitions.get(family)!;
  }

  resolve(input: ExecutionContractResolutionInput): ExecutionContractIdentity {
    const providerAdapterVersion = input.providerAdapterVersion.trim();
    if (!providerAdapterVersion || providerAdapterVersion.length > 128) {
      throw new Error("Provider Adapter version is unavailable for execution contract resolution.");
    }
    const family = resolveExecutionContractFamily(input);
    const value = this.read(family);
    return {
      family,
      epoch: value.epoch,
      policyHash: executionPolicyHash(value),
      providerAdapterVersion,
    };
  }
}

export const defaultExecutionContractRegistry = new ExecutionContractRegistry();

export function resolveExecutionContract(
  input: ExecutionContractResolutionInput,
): ExecutionContractIdentity {
  return defaultExecutionContractRegistry.resolve(input);
}

export function legacyExecutionContract(): StoredExecutionContractIdentity {
  return {
    kind: "legacy",
    family: "legacy-v0",
    epoch: 0,
    policyHash: null,
    providerAdapterVersion: null,
  };
}

export function storedExecutionContract(
  identity: ExecutionContractIdentity,
): StoredExecutionContractIdentity {
  return { kind: "versioned", ...validateExecutionContractIdentity(identity) };
}

export function validateExecutionContractIdentity(input: {
  family: unknown;
  epoch: unknown;
  policyHash: unknown;
  providerAdapterVersion: unknown;
}): ExecutionContractIdentity {
  if (typeof input.family !== "string"
    || !EXECUTION_CONTRACT_FAMILIES.includes(input.family as ExecutionContractFamily)) {
    throw new Error("Execution contract family is invalid.");
  }
  if (!Number.isSafeInteger(input.epoch) || Number(input.epoch) < 1) {
    throw new Error("Execution contract epoch is invalid.");
  }
  if (typeof input.policyHash !== "string" || !/^[a-f0-9]{64}$/.test(input.policyHash)) {
    throw new Error("Execution contract policy hash is invalid.");
  }
  if (typeof input.providerAdapterVersion !== "string"
    || input.providerAdapterVersion !== input.providerAdapterVersion.trim()
    || input.providerAdapterVersion.length < 1
    || input.providerAdapterVersion.length > 128) {
    throw new Error("Execution contract Provider Adapter version is invalid.");
  }
  return {
    family: input.family as ExecutionContractFamily,
    epoch: Number(input.epoch),
    policyHash: input.policyHash,
    providerAdapterVersion: input.providerAdapterVersion,
  };
}

export function resolveStoredExecutionContract(
  input: ExecutionContractResolutionInput,
): StoredExecutionContractIdentity {
  return storedExecutionContract(resolveExecutionContract(input));
}

export function executionPolicyHash(definitionValue: ExecutionContractDefinition): string {
  return createHash("sha256").update(JSON.stringify({
    family: definitionValue.family,
    epoch: definitionValue.epoch,
    policyVersion: definitionValue.policyVersion,
  })).digest("hex");
}

function resolveExecutionContractFamily(
  input: Omit<ExecutionContractResolutionInput, "providerAdapterVersion">,
): ExecutionContractFamily {
  if (input.productMode === "agent") {
    if (input.operationProfile !== "agent") throw new Error("Agent execution requires the Agent Provider profile.");
    if (input.operationKind === "review") return "agent.review";
    return input.roleId === "main-agent" ? "agent.turn" : "agent.native-child";
  }
  if (input.operationKind === "review") throw new Error("AHO execution cannot use the Review operation.");
  switch (input.operationProfile) {
    case "main": return "aho.main";
    case "planning": return "aho.planning";
    case "coder": return "aho.coder";
    case "auditor": return "aho.auditor";
    case "evolution": return "aho.evolution";
    case "evolution-scorer": return "aho.evolution-scorer";
    case "agent": throw new Error("AHO execution cannot use the Agent Provider profile.");
  }
}

function definition(
  family: ExecutionContractFamily,
  policyVersion: string,
  summary: string,
): ExecutionContractDefinition {
  return { family, epoch: 1, policyVersion, summary };
}
