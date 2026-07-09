export { createWorktree } from "./creation.js";
export { prepareWorktreeDependencyBridge, WorktreeDependencyBridgeError } from "./dependencies.js";
export { getGlobalWorktreeCheckoutRoot, getWorktreeMetadataPath } from "./paths.js";
export { listWorktreeMetadata } from "./repository.js";
export { getWorktreeStatus, listWorktreeStatuses, listWorktreesForChange } from "./status.js";
export { markWorktreeApplied, removeWorktree } from "./lifecycle.js";
export { writeWorktreeIndex } from "./index.js";
export type { WorktreeAppliedUpdate, WorktreeCreateOptions, WorktreeCreateResult, WorktreeRemoveResult } from "./types.js";
