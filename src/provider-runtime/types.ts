export type ProviderId = "codex";
export type ProductMode = "harness" | "agent";
export type RunnableProductMode = "harness";
export type HarnessExecutionMode = "stepwise" | "scoped-auto";

export type ProviderCapabilityKey =
  | "streaming.text"
  | "streaming.reasoning"
  | "streaming.tool-output"
  | "tool.use"
  | "tool.mcp"
  | "reasoning.effort"
  | "collaboration.mode"
  | "session.continuation"
  | "image.input"
  | "model.list"
  | "skills";

export type ProviderSpecCapabilityState = "supported" | "compat-input" | "unsupported" | "unknown";
export type ProviderRuntimeReadiness = "ready" | "degraded" | "unavailable";
export type ProviderSnapshotStatus = "ready" | "degraded" | "unavailable";

export interface ProviderCapabilityItem {
  key: ProviderCapabilityKey;
  label: string;
  spec: ProviderSpecCapabilityState;
  runtime: ProviderRuntimeReadiness;
  summary: string;
  reason?: string;
}

export interface ProviderCapabilitySnapshot {
  providerId: ProviderId;
  displayName: string;
  productMode: RunnableProductMode;
  status: ProviderSnapshotStatus;
  runnable: boolean;
  checkedAt: string;
  snapshotHash: string;
  snapshotVersion: number;
  effectiveModel: string | null;
  effectiveModelSource: "selected" | "config" | "codex-default";
  degradedReasons: string[];
  capabilities: ProviderCapabilityItem[];
}

export interface ProviderRuntimeSummary {
  providerId: ProviderId;
  productMode: RunnableProductMode;
  harnessExecutionModes: HarnessExecutionMode[];
  snapshot: ProviderCapabilitySnapshot;
}
