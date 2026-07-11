import {
  WORKFLOW_ACTION_SCOPE_KEYS,
  validateWorkflowActionRequiredTargets,
  type WorkflowActionRequiredTargetIssue,
  type WorkflowActionScopeCarrier,
  type WorkflowActionType,
} from "./registry.js";

export const CURRENT_GATE_SCOPE_KEYS = WORKFLOW_ACTION_SCOPE_KEYS;

export type CurrentGateClassification =
  | "concrete"
  | "manual-barrier"
  | "terminal-human-gate";

export interface CurrentGateSnapshot {
  actionType: WorkflowActionType | string;
  scope: Record<string, string | string[]>;
}

export interface CurrentGateContract {
  actionType: WorkflowActionType | string;
  changeId?: string;
  enabled?: boolean;
  requiresConfirmation?: boolean;
  scope: Record<string, string | string[]>;
  evidenceRefs?: string[];
  sourceProjection?: string;
  nonExecuting: true;
}

export interface CurrentGateValidationIssue {
  label: string;
  message: string;
}

const MANUAL_BARRIER_ACTION_TYPES = new Set<string>([
  "planning.scheduler.integration-check.run",
]);

const TERMINAL_HUMAN_GATE_ACTION_TYPES = new Set<string>([
  "planning.scheduler.run.complete",
  "planning.scheduler.run.close-blocked",
  "landing.prepare",
  "landing.review",
  "landing-queue.merge-next",
  "pr-draft.create",
  "pr-feedback.update-draft",
  "pr-review.submit",
  "pr-review.reply-submit",
  "pr-review.thread-resolve",
  "remote-landing.merge",
  "result.apply",
]);

const FORBIDDEN_NON_EXECUTING_TRUE_FLAGS = [
  "executionStarted",
  "concreteGateInvoked",
  "toolPolicyAuthorized",
  "toolPolicyAuthorizedConcreteGate",
  "sourceMutationAuthorized",
  "applyAuthorized",
  "closeAuthorized",
  "mergeAuthorized",
  "remoteLandingAuthorized",
  "harnessEvolutionAuthorized",
] as const;

export function buildCurrentGateCarrier(
  source: object,
  actionType: string,
  changeId?: string,
  fallback?: object,
): WorkflowActionScopeCarrier {
  const result: WorkflowActionScopeCarrier = { actionType };
  const resolvedChangeId = scopeStringValue(source, "changeId") ?? scopeStringValue(fallback, "changeId") ?? changeId;
  if (resolvedChangeId) result.changeId = resolvedChangeId;
  for (const key of CURRENT_GATE_SCOPE_KEYS) {
    const value = scopeValue(source, key) ?? scopeValue(fallback, key);
    if (typeof value === "string") {
      (result as Record<string, string>)[key] = value;
    } else if (isStringArray(value) && value.length > 0) {
      (result as Record<string, string[]>)[key] = [...value];
    }
  }
  return result;
}

export function buildCurrentGateSnapshot(
  source: WorkflowActionScopeCarrier,
  actionType = source.actionType as WorkflowActionType | string | undefined,
): CurrentGateSnapshot {
  if (!actionType) throw new Error("Current gate snapshot requires an action type.");
  const carrier = buildCurrentGateCarrier(source, actionType, source.changeId);
  const scope: Record<string, string | string[]> = {};
  if (carrier.changeId) scope.changeId = carrier.changeId;
  for (const key of CURRENT_GATE_SCOPE_KEYS) {
    const value = carrier[key];
    if (typeof value === "string") scope[key] = value;
    if (isStringArray(value) && value.length > 0) scope[key] = [...value];
  }
  return { actionType, scope };
}

export function buildCurrentGateContract(input: {
  source: WorkflowActionScopeCarrier & { enabled?: boolean; requiresConfirmation?: boolean; evidenceRefs?: string[] };
  actionType?: string;
  sourceProjection?: string;
}): CurrentGateContract {
  const actionType = input.actionType ?? input.source.actionType;
  if (!actionType) throw new Error("Current gate contract requires an action type.");
  const snapshot = buildCurrentGateSnapshot(input.source, actionType);
  return {
    actionType,
    changeId: input.source.changeId,
    enabled: input.source.enabled,
    requiresConfirmation: input.source.requiresConfirmation,
    scope: snapshot.scope,
    evidenceRefs: input.source.evidenceRefs ? [...input.source.evidenceRefs] : undefined,
    sourceProjection: input.sourceProjection,
    nonExecuting: true,
  };
}

export function currentGateScopeMatches(input: {
  actionType: string;
  changeId?: string;
  expectedScope: Record<string, unknown>;
  actual: unknown;
}): boolean {
  const actualRecord = input.actual as Record<string, unknown>;
  const nestedScope = isRecord(actualRecord?.scope) ? actualRecord.scope : undefined;
  if (actualRecord?.actionType !== input.actionType) return false;
  if (input.changeId) {
    const actualChangeId = actualRecord.changeId ?? nestedScope?.changeId;
    if (actualChangeId !== input.changeId) return false;
  }
  for (const [key, expected] of Object.entries(input.expectedScope)) {
    const expectedValue = key === "changeId" ? input.changeId ?? expected : expected;
    const actualValue = key === "changeId"
      ? actualRecord.changeId ?? nestedScope?.changeId
      : nestedScope?.[key] ?? actualRecord[key];
    if (!scopeValuesEqual(normalizeScopeValue(expectedValue), normalizeScopeValue(actualValue))) return false;
  }
  return true;
}

export function buildRequestedCurrentGateFromScope(input: {
  changeId: string;
  actionType: string;
  expectedScope: Record<string, unknown>;
  request: WorkflowActionScopeCarrier;
}): WorkflowActionScopeCarrier {
  return {
    actionType: input.actionType,
    changeId: input.changeId,
    ...readCurrentGateRequestScope(input.request, input.expectedScope),
  };
}

export function readCurrentGateRequestScope(
  request: WorkflowActionScopeCarrier,
  expectedScope: Record<string, unknown>,
): WorkflowActionScopeCarrier {
  const result: WorkflowActionScopeCarrier = {};
  const values = request as Record<string, unknown>;
  for (const key of Object.keys(expectedScope)) {
    if (key === "changeId") continue;
    const value = values[key];
    if (typeof value === "string") (result as Record<string, string | string[]>)[key] = value;
    if (isStringArray(value)) (result as Record<string, string | string[]>)[key] = [...value];
  }
  return result;
}

export function classifyCurrentGateActionType(actionType: string | undefined): CurrentGateClassification {
  if (!actionType) return "terminal-human-gate";
  if (MANUAL_BARRIER_ACTION_TYPES.has(actionType)) return "manual-barrier";
  if (TERMINAL_HUMAN_GATE_ACTION_TYPES.has(actionType)) return "terminal-human-gate";
  return "concrete";
}

export function validateCurrentGateContract(source: WorkflowActionScopeCarrier & Record<string, unknown>): CurrentGateValidationIssue[] {
  const issues: CurrentGateValidationIssue[] = [];
  const actionType = source.actionType;
  if (!actionType) {
    issues.push({ label: "actionType", message: "Current gate requires actionType." });
  }
  issues.push(...validateWorkflowActionRequiredTargets(source).map(requiredTargetIssue));
  for (const flag of FORBIDDEN_NON_EXECUTING_TRUE_FLAGS) {
    if (source[flag] === true) {
      issues.push({ label: flag, message: `Current gate contract must remain non-executing; ${flag} cannot be true.` });
    }
  }
  return issues;
}

export function assertCurrentGateContract(source: WorkflowActionScopeCarrier & Record<string, unknown>, label = "Current gate"): void {
  const issues = validateCurrentGateContract(source);
  if (issues.length > 0) {
    throw new Error(`${label} is invalid: ${issues.map((issue) => issue.label).join(", ")}.`);
  }
}

function requiredTargetIssue(issue: WorkflowActionRequiredTargetIssue): CurrentGateValidationIssue {
  return { label: issue.label, message: issue.message };
}

function scopeValue(source: object | undefined, key: string): string | string[] | undefined {
  if (!source) return undefined;
  const value = (source as Record<string, unknown>)[key];
  if (typeof value === "string" || isStringArray(value)) return value;
  return undefined;
}

function scopeStringValue(source: object | undefined, key: string): string | undefined {
  const value = scopeValue(source, key);
  return typeof value === "string" ? value : undefined;
}

function normalizeScopeValue(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (isStringArray(value)) return [...value].sort();
  return [];
}

function scopeValuesEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
