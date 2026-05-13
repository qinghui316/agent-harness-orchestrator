import type { AuditFinding, AuditStatus } from "../types/index.js";

const allowedStatuses = new Set<AuditStatus>(["approved", "approved-with-notes", "blocked", "failed"]);

export interface ParsedAuditMessage {
  status: AuditStatus;
  findings: AuditFinding[];
  parseWarnings: string[];
}

export function parseAuditMessage(message: string): ParsedAuditMessage {
  const status = parseStatus(message);
  const parseWarnings: string[] = [];
  if (!status) parseWarnings.push("Auditor output did not include a parseable Status line.");
  return {
    status: status ?? "failed",
    findings: parseFindings(message),
    parseWarnings,
  };
}

function parseStatus(message: string): AuditStatus | null {
  const match = message.match(/^\s*Status\s*:\s*([a-z-]+)/im);
  if (!match) return null;
  const normalized = match[1].trim().toLowerCase();
  return allowedStatuses.has(normalized as AuditStatus) ? normalized as AuditStatus : null;
}

function parseFindings(message: string): AuditFinding[] {
  const lines = message.split(/\r?\n/);
  const findings: AuditFinding[] = [];
  let current: Partial<AuditFinding> | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^-?\s*Finding\s*:/i.test(trimmed)) {
      if (current) findings.push(normalizeFinding(current));
      current = { text: trimmed.replace(/^-?\s*Finding\s*:\s*/i, "").trim() };
      continue;
    }
    if (!current) continue;

    const field = trimmed.match(/^-?\s*(Severity|Area|Evidence|Recommendation)\s*:\s*(.*)$/i);
    if (!field) {
      if (trimmed) current.text = [current.text, trimmed].filter(Boolean).join(" ");
      continue;
    }

    const key = field[1].toLowerCase();
    const value = field[2].trim();
    if (key === "severity") current.severity = value.toLowerCase() === "blocking" ? "blocking" : "note";
    if (key === "area") current.area = value;
    if (key === "evidence") current.evidence = value;
    if (key === "recommendation") current.recommendation = value;
  }

  if (current) findings.push(normalizeFinding(current));
  return findings;
}

function normalizeFinding(input: Partial<AuditFinding>): AuditFinding {
  return {
    severity: input.severity ?? "note",
    area: input.area?.trim() || "unspecified",
    evidence: input.evidence?.trim() || "No evidence provided.",
    recommendation: input.recommendation?.trim() || "No recommendation provided.",
    text: input.text?.trim() || "No finding text provided.",
  };
}
