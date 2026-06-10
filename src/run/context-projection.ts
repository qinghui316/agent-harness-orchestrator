import type { ChangeStatus } from "../types/index.js";

export function buildContextProjection(status: ChangeStatus): string {
  const change = status.change;
  const acMap = status.acMap;
  return [
    "# Run Context Projection",
    "",
    "This file is generated for one run. It is not the source of truth.",
    "Read the active change files and project Harness for durable memory.",
    "",
    "## Change",
    "",
    `- ID: ${change?.id ?? "unknown"}`,
    `- Title: ${change?.title ?? "unknown"}`,
    `- Review Status: ${status.reviewStatus}`,
    `- Latest Validation: ${status.latestValidation ? `${status.latestValidation.status} (${status.latestValidation.id})` : "none"}`,
    `- Latest Audit: ${status.latestAudit ? `${status.latestAudit.status} (${status.latestAudit.id})` : "none"}`,
    `- Close Gate Ready: ${status.closeGate.ready}`,
    "",
    "## Acceptance Criteria",
    "",
    ...(acMap?.acceptanceCriteria.length
      ? acMap.acceptanceCriteria.map((criterion) => `- ${criterion.id}: ${criterion.text || "(empty)"}`)
      : ["- None parsed."]),
    "",
    "## Tasks",
    "",
    ...(acMap?.tasks.length
      ? acMap.tasks.map((task) => `- ${task.done ? "[x]" : "[ ]"} ${task.id}: ${task.text || "(empty)"}; Covers: ${task.acIds.join(", ") || "none"}`)
      : ["- None parsed."]),
    "",
    "## Close Gate",
    "",
    ...(status.closeGate.blockingIssues.length ? status.closeGate.blockingIssues.map((issue) => `- BLOCKING: ${issue}`) : ["- No blocking issues."]),
    ...(status.closeGate.warnings.length ? status.closeGate.warnings.map((warning) => `- WARNING: ${warning}`) : []),
    "",
  ].join("\n");
}
