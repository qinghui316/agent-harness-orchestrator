export type IntegrationCheckStatus = "passed" | "conflict" | "validation-failed" | "audit-failed" | "stale-result" | "failed" | "applied" | "discarded";
export type IntegrationFixAttemptStatus = "completed" | "failed";
export type AggregateValidationStatus = "passed" | "failed";
export type AggregateAuditStatus = "approved" | "blocked" | "failed";

export interface IntegrationCheckTarget {
  changeId: string;
  worktreeId: string;
  diffHash: string;
  diffStat: string;
  sourceHead: string | null;
}

export interface IntegrationArtifact {
  kind: "combined" | "repaired";
  path: string;
  hash: string;
  createdAt: string;
  source: "integration-check" | "integration-fix-agent";
}

export interface AggregateValidationResult {
  id: string;
  status: AggregateValidationStatus;
  command: string[];
  exitCode: number | null;
  stdout: string;
  stderr: string;
  artifactRef: string;
  createdAt: string;
}

export interface AggregateAuditResult {
  id: string;
  status: AggregateAuditStatus;
  summary: string;
  findings: string[];
  artifactRef: string;
  createdAt: string;
}

export interface IntegrationFixAttempt {
  id: string;
  roleId: "integration-fix-agent";
  status: IntegrationFixAttemptStatus;
  reason: string;
  inputArtifactRef: string;
  outputArtifactRef?: string;
  outputArtifactHash?: string;
  summary: string;
  startedAt: string;
  finishedAt: string;
}

export interface IntegrationCheckRecord {
  version: "1.0";
  id: string;
  projectId: string | null;
  status: IntegrationCheckStatus;
  resultTargets: IntegrationCheckTarget[];
  sourceHead: string | null;
  createdAt: string;
  finishedAt?: string;
  appliedAt?: string;
  summary: string;
  riskSummary: string;
  artifactRefs: string[];
  artifacts: IntegrationArtifact[];
  latestArtifactHash?: string;
  latestArtifactRef?: string;
  aggregateValidation?: AggregateValidationResult;
  aggregateAudit?: AggregateAuditResult;
  fixAttempts: IntegrationFixAttempt[];
  integrationWorktreePath?: string;
  blockingIssues: string[];
  warnings: string[];
}

export interface IntegrationCheckCandidate {
  id: string;
  targets: IntegrationCheckTarget[];
  summary: string;
  riskSummary: string;
}

export interface IntegrationCheckResult {
  check: IntegrationCheckRecord;
  artifactDirectory: string;
}
