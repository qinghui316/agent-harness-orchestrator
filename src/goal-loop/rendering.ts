import type { GoalLoopDecision } from "./types.js";

export function renderGoalLoopDecisionMarkdown(decision: GoalLoopDecision): string {
  const lines = [
    `# GoalLoopDecision ${decision.id}`,
    "",
    `- Change: ${decision.changeId}`,
    `- Authority: ${decision.authority}`,
    `- Decision: ${decision.decisionKind}`,
    `- Human gate required: ${decision.humanGateRequired ? "yes" : "no"}`,
    `- Execution started: ${decision.executionStarted ? "yes" : "no"}`,
    "",
    "## Summary",
    "",
    decision.summary,
    "",
    "## Recommended Action",
    "",
    decision.recommendedAction
      ? `- ${decision.recommendedAction.actionType}: ${decision.recommendedAction.reason}`
      : "- None.",
    ...(decision.recommendedAction
      ? ["", "### Scope", "", ...Object.entries(decision.recommendedAction.scope).map(([key, value]) => `- ${key}: ${Array.isArray(value) ? value.join(", ") : value}`)]
      : []),
    "",
    "## Conflict Assessment",
    "",
    `- Level: ${decision.conflictAssessment.level}`,
    `- Parallel eligible: ${decision.conflictAssessment.parallelEligible ? "yes" : "no"}`,
    ...decision.conflictAssessment.reasons.map((reason) => `- ${reason}`),
    "",
    "## Completion Audit",
    "",
    `- Status: ${decision.completionAudit.status}`,
    "",
    "### Evidence",
    "",
    ...(decision.completionAudit.evidence.length ? decision.completionAudit.evidence.map((item) => `- ${item}`) : ["- None."]),
    "",
    "### Missing",
    "",
    ...(decision.completionAudit.missing.length ? decision.completionAudit.missing.map((item) => `- ${item}`) : ["- None."]),
    "",
    "## Source Evidence",
    "",
    ...(decision.sourceEvidenceRefs.length
      ? decision.sourceEvidenceRefs.map((ref) => `- ${ref.kind}${ref.id ? ` ${ref.id}` : ""}${ref.status ? ` (${ref.status})` : ""}: ${ref.summary}`)
      : ["- None."]),
    "",
    "## Forbidden Actions",
    "",
    ...(decision.forbiddenActions.length
      ? decision.forbiddenActions.map((action) => `- ${action.actionType}: ${action.reason}`)
      : ["- None."]),
    "",
  ];
  return `${lines.join("\n")}\n`;
}
