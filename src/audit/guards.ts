import type { AuditResult } from "../types/index.js";

export interface AuditScopeGuardOptions {
  expectedId: string;
  changeId?: string;
}

export function assertAuditScope(result: AuditResult, options: AuditScopeGuardOptions): void {
  if (result.id !== options.expectedId) {
    throw new Error(`Invalid audit evidence ${options.expectedId}: id ${result.id} does not match run directory.`);
  }
  if (result.runId !== options.expectedId) {
    throw new Error(`Invalid audit evidence ${options.expectedId}: runId ${result.runId} does not match run directory.`);
  }
  if (options.changeId && result.changeId !== options.changeId) {
    throw new Error(`Invalid audit evidence ${options.expectedId}: changeId ${result.changeId} does not match requested change ${options.changeId}.`);
  }
}
