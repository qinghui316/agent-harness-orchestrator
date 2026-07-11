export type HarnessExecutionMode = "stepwise" | "scoped-auto";

export interface ExecutionAuthorizationBudget {
  maxCompletedOperations: number;
  maxReworks: number;
  maxChangedFiles: number;
  maxChangedBytes: number;
}

export interface ExecutionAuthorizationTarget {
  transition: string;
  targetId: string;
  manifestHash: string;
}

export interface ExecutionAuthorizationUserDecision {
  decisionId: string;
  actorId: string;
  decidedAt: string;
}

export interface LocalExecutionAuthorization {
  version: "1.0";
  id: string;
  projectId: string | null;
  changeId: string;
  conversationId: string;
  providerThreadId: string;
  goalIdentityHash: string;
  mode: HarnessExecutionMode;
  status: "active" | "revoked";
  epoch: number;
  acceptedPlanId: string;
  acceptedPlanHash: string;
  graphId: string;
  graphHash: string;
  artifactManifestHash: string;
  sourceHead: string;
  sourceStateHash: string;
  permissionProfileHash: string;
  providerScopeHash: string;
  policyHash: string;
  targets: ExecutionAuthorizationTarget[];
  budget: ExecutionAuthorizationBudget;
  userDecision: ExecutionAuthorizationUserDecision;
  issuedAt: string;
  expiresAt: string;
  revokedAt: string | null;
  revocationReason: string | null;
}

export type TransitionExecutionStatus = "available" | "claimed" | "executing" | "completed" | "retryable-failed" | "terminal-failed";

export interface TransitionExecution {
  version: "1.0";
  operationId: string;
  authorizationId: string;
  authorizationEpoch: number;
  transition: string;
  targetId: string;
  manifestHash: string;
  status: Exclude<TransitionExecutionStatus, "available">;
  claimToken: string;
  fencingToken: number;
  claimedBy: string;
  claimedAt: string;
  claimExpiresAt: string;
  executionStartedAt: string | null;
  terminalAt: string | null;
  receipt: TransitionExecutionReceipt | null;
}

export interface TransitionExecutionReceipt {
  version: "1.0";
  operationId: string;
  outcome: "completed" | "retryable-failed" | "terminal-failed";
  consumesAuthorization: boolean;
  recordedAt: string;
  evidenceRefs: string[];
  error: string | null;
}

export interface ExecutionAuthorizationSnapshot {
  acceptedPlanHash: string;
  graphHash: string;
  artifactManifestHash: string;
  sourceHead: string;
  sourceStateHash: string;
  permissionProfileHash: string;
  providerScopeHash: string;
  policyHash: string;
}
