import type { LandingQueueResult, LandingQueueSnapshot } from "../types/index.js";

export function summaryForQueue(readyCount: number, needsAttentionCount: number, mergedCount: number): string {
  if (readyCount > 0) return `${readyCount} 个 PR 可以逐个确认合并，${needsAttentionCount} 个需要先处理。`;
  if (needsAttentionCount > 0) return `${needsAttentionCount} 个 PR 需要先处理反馈、checks 或 provider 状态。`;
  if (mergedCount > 0) return "当前 PR 都已有合并结果，可继续合并后收尾。";
  return "当前没有可进入远端合并队列的 PR。";
}

export function renderSnapshotSummary(snapshot: LandingQueueSnapshot): string {
  return [
    "# Landing Queue Snapshot",
    "",
    `Status: ${snapshot.status}`,
    `Ready: ${snapshot.readyCount}`,
    `Needs attention: ${snapshot.needsAttentionCount}`,
    `Merged: ${snapshot.mergedCount}`,
    "",
    snapshot.summary,
    "",
    "## Candidates",
    "",
    ...snapshot.candidates.map((candidate) => [
      `- ${candidate.landingPackageId}`,
      `  - status: ${candidate.status}`,
      `  - PR: ${candidate.prUrl ?? "unavailable"}`,
      `  - reason: ${candidate.reason}`,
    ].join("\n")),
    "",
  ].join("\n");
}

export function renderResultSummary(result: LandingQueueResult): string {
  return [
    "# Landing Queue Result",
    "",
    `Status: ${result.status}`,
    result.landingPackageId ? `Landing package: ${result.landingPackageId}` : "",
    result.remoteLandingResultId ? `Remote landing result: ${result.remoteLandingResultId}` : "",
    "",
    result.summary,
    "",
  ].filter(Boolean).join("\n");
}
