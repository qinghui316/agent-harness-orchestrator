import type { WorktreeMetadata, WorktreeStatus } from "../types/index.js";

export interface WorktreeCreateOptions {
  baseRef?: string;
  runId?: string;
}

export interface WorktreeCreateResult {
  metadata: WorktreeMetadata;
  status: WorktreeStatus;
  metadataPath: string;
  warnings: string[];
}

export interface WorktreeRemoveResult {
  removed: WorktreeMetadata;
  checkoutRemoved: boolean;
}

export interface WorktreeAppliedUpdate {
  applyRunId: string;
  worktreeDiffHash: string;
  appliedCommit?: string;
}

