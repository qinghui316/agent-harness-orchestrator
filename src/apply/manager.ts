export * from "./types.js";
export { previewWorktreeApply } from "./preview.js";
export { resolveWorktreeApprovalScope } from "./execution-scope.js";
export { canAutoAcceptAuditForApply, canApplyResultFromGate, classifyApplyReadiness, worktreeApplyManifestHash } from "./gate.js";
export {
  applyResultToProject,
  applyWorktree,
  discardWorktree,
  listCompletedWorktreeDispositions,
  recoverApplyApprovalReceipts,
  recoverDiscardApprovalReceipts,
  recoverPendingApplyTransactions,
  recoverPendingDiscardTransactions,
} from "./apply-discard.js";
