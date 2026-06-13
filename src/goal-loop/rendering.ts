import type { GoalLoopDecision, GoalLoopIteration } from "./types.js";

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

export function renderGoalLoopIterationMarkdown(iteration: GoalLoopIteration): string {
  const lines = [
    `# GoalLoopIteration ${iteration.id}`,
    "",
    `- Change: ${iteration.changeId}`,
    `- Ordinal: ${iteration.ordinal}`,
    `- Authority: ${iteration.authority}`,
    `- Trigger: ${iteration.trigger}`,
    `- Iteration status: ${iteration.iterationStatus}`,
    `- Continuation verdict: ${iteration.continuationVerdict}`,
    `- Continuation state: ${iteration.continuationState}`,
    `- GoalLoopDecision: ${iteration.goalLoopDecisionId}`,
    `- Previous iteration: ${iteration.previousGoalLoopIterationId ?? "none"}`,
    `- Previous decision: ${iteration.previousGoalLoopDecisionId ?? "none"}`,
    `- Human gate required: ${iteration.humanGateRequired ? "yes" : "no"}`,
    `- Execution started: ${iteration.executionStarted ? "yes" : "no"}`,
    "",
    "## Summary",
    "",
    iteration.summary,
    "",
    "## Recommended Action Snapshot",
    "",
    iteration.recommendedAction
      ? `- ${iteration.recommendedAction.actionType}: ${iteration.recommendedAction.reason}`
      : "- None.",
    ...(iteration.recommendedAction
      ? ["", "### Scope", "", ...Object.entries(iteration.recommendedAction.scope).map(([key, value]) => `- ${key}: ${Array.isArray(value) ? value.join(", ") : value}`)]
      : []),
    "",
    "## Continuation Control Policy",
    "",
    `- Authority: ${iteration.controlPolicy.authority}`,
    `- Can auto-continue: ${iteration.controlPolicy.canAutoContinue ? "yes" : "no"}`,
    `- Can auto-execute recommended action: ${iteration.controlPolicy.canAutoExecuteRecommendedAction ? "yes" : "no"}`,
    `- Requires human gate: ${iteration.controlPolicy.requiresHumanGate ? "yes" : "no"}`,
    `- Recommended action type: ${iteration.controlPolicy.recommendedActionType ?? "none"}`,
    `- Reason: ${iteration.controlPolicy.reason}`,
    "",
    "## Budget / Accounting Signal",
    "",
    `- Status: ${iteration.budgetSignal.status}`,
    `- Summary: ${iteration.budgetSignal.summary}`,
    ...(iteration.budgetSignal.tokenBudget !== undefined ? [`- Token budget: ${iteration.budgetSignal.tokenBudget}`] : []),
    ...(iteration.budgetSignal.tokensUsed !== undefined ? [`- Tokens used: ${iteration.budgetSignal.tokensUsed}`] : []),
    ...(iteration.budgetSignal.remainingTokens !== undefined ? [`- Remaining tokens: ${iteration.budgetSignal.remainingTokens}`] : []),
    "",
    "## Resume Preconditions",
    "",
    ...(iteration.resumePreconditions.length
      ? iteration.resumePreconditions.map((item) => `- ${item.kind}${item.id ? ` ${item.id}` : ""}: ${item.satisfied ? "satisfied" : "pending"} - ${item.summary}`)
      : ["- None."]),
    "",
    "## Suppression Reason",
    "",
    iteration.suppressedBecause
      ? `- ${iteration.suppressedBecause.reason}: ${iteration.suppressedBecause.summary}`
      : "- None.",
    "",
    "## Conflict Assessment",
    "",
    `- Level: ${iteration.conflictAssessment.level}`,
    `- Parallel eligible: ${iteration.conflictAssessment.parallelEligible ? "yes" : "no"}`,
    ...iteration.conflictAssessment.reasons.map((reason) => `- ${reason}`),
    "",
    "## Completion Audit",
    "",
    `- Status: ${iteration.completionAudit.status}`,
    "",
    "### Evidence",
    "",
    ...(iteration.completionAudit.evidence.length ? iteration.completionAudit.evidence.map((item) => `- ${item}`) : ["- None."]),
    "",
    "### Missing",
    "",
    ...(iteration.completionAudit.missing.length ? iteration.completionAudit.missing.map((item) => `- ${item}`) : ["- None."]),
    "",
    "## Source Evidence",
    "",
    ...(iteration.sourceEvidenceRefs.length
      ? iteration.sourceEvidenceRefs.map((ref) => `- ${ref.kind}${ref.id ? ` ${ref.id}` : ""}${ref.status ? ` (${ref.status})` : ""}: ${ref.summary}`)
      : ["- None."]),
    "",
    "## Boundary",
    "",
    "- This iteration is continuation evidence only.",
    "- It does not execute the recommended action.",
    "- Concrete next steps still require their own scoped Harness confirmation.",
    "",
  ];
  return `${lines.join("\n")}\n`;
}
