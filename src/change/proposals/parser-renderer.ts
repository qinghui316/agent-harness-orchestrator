import type { ChangeProposalStatus, PlanProposal, SpecProposal } from "../../types/index.js";
import { planModelOutputSchema, specModelOutputSchema } from "./schemas.js";

export function parseSpecProposalMessage(message: string): Pick<SpecProposal, "status" | "specMd" | "openQuestions" | "assumptions" | "warnings"> {
  const jsonText = extractProposalJson(message);
  if (!jsonText) {
    return { status: "failed", specMd: "", openQuestions: [], assumptions: [], warnings: ["Spec proposal output did not include parseable JSON."] };
  }
  try {
    const parsed = specModelOutputSchema.parse(JSON.parse(jsonText));
    return parsed;
  } catch (error) {
    return { status: "failed", specMd: "", openQuestions: [], assumptions: [], warnings: [`Spec proposal JSON was invalid: ${(error as Error).message}`] };
  }
}

export function parsePlanProposalMessage(message: string): Pick<PlanProposal, "status" | "planMd" | "tasksMd" | "openQuestions" | "assumptions" | "warnings"> {
  const jsonText = extractProposalJson(message);
  if (!jsonText) {
    return { status: "failed", planMd: "", tasksMd: "", openQuestions: [], assumptions: [], warnings: ["Plan proposal output did not include parseable JSON."] };
  }
  try {
    const parsed = planModelOutputSchema.parse(JSON.parse(jsonText));
    return parsed;
  } catch (error) {
    return { status: "failed", planMd: "", tasksMd: "", openQuestions: [], assumptions: [], warnings: [`Plan proposal JSON was invalid: ${(error as Error).message}`] };
  }
}

export function renderSpecProposalMarkdown(proposal: SpecProposal, message: string): string {
  return renderProposalMarkdown("Spec", proposal.id, proposal.status, proposal.changeId, proposal.openQuestions, proposal.assumptions, proposal.warnings, message);
}

export function renderPlanProposalMarkdown(proposal: PlanProposal, message: string): string {
  return renderProposalMarkdown("Plan", proposal.id, proposal.status, proposal.changeId, proposal.openQuestions, proposal.assumptions, proposal.warnings, message);
}

export function renderUnavailableProposalMessage(kind: "spec" | "plan", errors: string[]): string {
  return [
    "Status: failed",
    "",
    `# ${kind === "spec" ? "Spec" : "Plan"} Proposal Unavailable`,
    "",
    "AHO could not safely start Codex in read-only non-interactive mode.",
    "",
    ...errors.map((error) => `- ${error}`),
    "",
    "```json",
    JSON.stringify({ status: "failed", openQuestions: [], assumptions: [], warnings: errors }, null, 2),
    "```",
    "",
  ].join("\n");
}

function renderProposalMarkdown(kind: string, id: string, status: ChangeProposalStatus, changeId: string, questions: string[], assumptions: string[], warnings: string[], message: string): string {
  return [
    `# ${kind} Proposal: ${id}`,
    "",
    `- Status: ${status}`,
    `- Change: ${changeId}`,
    `- Open questions: ${questions.length}`,
    `- Assumptions: ${assumptions.length}`,
    `- Warnings: ${warnings.length}`,
    "",
    questions.length ? "## Open Questions" : "",
    ...questions.map((item) => `- ${item}`),
    assumptions.length ? "## Assumptions" : "",
    ...assumptions.map((item) => `- ${item}`),
    warnings.length ? "## Warnings" : "",
    ...warnings.map((item) => `- ${item}`),
    "",
    "## Codex Final Message",
    "",
    message.trim() || "(empty)",
    "",
  ].join("\n");
}

function extractProposalJson(message: string): string | null {
  const fenced = /```json\s*([\s\S]*?)```/i.exec(message);
  if (fenced) return fenced[1].trim();
  const begin = message.indexOf("{");
  const end = message.lastIndexOf("}");
  if (begin >= 0 && end > begin) return message.slice(begin, end + 1);
  const status = /^Status:\s*(proposed|blocked|failed)\s*$/im.exec(message);
  if (status) return JSON.stringify({ status: status[1], openQuestions: [], assumptions: [], warnings: ["No JSON payload found; parsed status line only."] });
  return null;
}
