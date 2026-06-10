import type { ValidationResult } from "../types/index.js";

export interface ValidationScopeGuardOptions {
  expectedId: string;
  changeId?: string;
}

export function assertValidationScope(result: ValidationResult, options: ValidationScopeGuardOptions): void {
  if (result.id !== options.expectedId) {
    throw new Error(`Invalid validation evidence ${options.expectedId}: id ${result.id} does not match run directory.`);
  }
  if (result.runId !== options.expectedId) {
    throw new Error(`Invalid validation evidence ${options.expectedId}: runId ${result.runId} does not match run directory.`);
  }
  if (options.changeId && result.changeId !== options.changeId) {
    throw new Error(`Invalid validation evidence ${options.expectedId}: changeId ${result.changeId} does not match requested change ${options.changeId}.`);
  }
}
