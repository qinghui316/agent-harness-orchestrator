import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseAuditMessage } from "../../src/audit/parser.js";
import { composeAuditPrompt } from "../../src/audit/prompt.js";
import { createChange, getChangeStatus } from "../../src/change/manager.js";
import { writeJsonFile } from "../../src/fs/json.js";
import { initHarness } from "../../src/harness/init.js";
import type { AuditResult, ManagedProject } from "../../src/types/index.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "aho-audit-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

function project(path: string): ManagedProject {
  return {
    id: "repo",
    name: "Repo",
    path,
    addedAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
  };
}

describe("audit parser and prompt", () => {
  it("parses approved, approved-with-notes, blocked, and missing statuses", () => {
    expect(parseAuditMessage("Status: approved\n").status).toBe("approved");
    expect(parseAuditMessage("Status: approved-with-notes\n").status).toBe("approved-with-notes");
    expect(parseAuditMessage("Status: blocked\n").status).toBe("blocked");
    expect(parseAuditMessage("Status: not-real\n").status).toBe("failed");
    expect(parseAuditMessage("No status here").status).toBe("failed");
  });

  it("parses structured findings", () => {
    const parsed = parseAuditMessage([
      "Status: blocked",
      "",
      "Finding: Missing validation",
      "- Severity: blocking",
      "- Area: validation",
      "- Evidence: validation.json missing",
      "- Recommendation: run aho validate run",
    ].join("\n"));

    expect(parsed.findings[0]).toMatchObject({
      severity: "blocking",
      area: "validation",
      evidence: "validation.json missing",
      recommendation: "run aho validate run",
    });
  });

  it("composes an auditor prompt with context, validation, profile, and diff", async () => {
    const prompt = await composeAuditPrompt({
      context: "- AC-001: Audit evidence",
      latestValidation: "{\"status\":\"passed\"}",
      diffStat: "README.md | 1 +",
      diff: "diff --git a/README.md b/README.md",
      extraPrompt: "Focus on spec drift.",
    });

    expect(prompt).toContain("Auditor Agent Profile");
    expect(prompt).toContain("Status: approved | approved-with-notes | blocked");
    expect(prompt).toContain("Authoritative Audit Packet");
    expect(prompt).toContain("Do not block only because external-local durable memory is outside the Codex working directory.");
    expect(prompt).toContain("AC-001");
    expect(prompt).toContain("README.md | 1 +");
    expect(prompt).toContain("Focus on spec drift.");
  });
});

describe("audit close gate", () => {
  it("warns on no or failed audit and blocks explicit blocked audit", async () => {
    await initHarness(project(tempDir));
    await createChange(project(tempDir), { title: "Audit Gate" });
    const changeDir = join(tempDir, "harness", "changes", "active", "audit-gate");
    await writeFile(join(changeDir, "reviews", "review.md"), "Status: approved\n", "utf8");

    const noAudit = await getChangeStatus(project(tempDir));
    expect(noAudit.closeGate.warnings).toContain("No audit run recorded for this change.");

    await mkdir(join(tempDir, ".agent-harness", "runs", "audit-failed"), { recursive: true });
    await writeAudit("audit-failed", "audit-gate", "failed");
    const failed = await getChangeStatus(project(tempDir));
    expect(failed.closeGate.warnings).toContain("Latest audit failed or could not be parsed: audit-failed.");

    await mkdir(join(tempDir, ".agent-harness", "runs", "audit-blocked"), { recursive: true });
    await writeAudit("audit-blocked", "audit-gate", "blocked", "2099-01-01T00:00:00.000Z");
    const blocked = await getChangeStatus(project(tempDir));
    expect(blocked.closeGate.blockingIssues).toContain("Latest audit blocked close: audit-blocked.");
  });
});

async function writeAudit(id: string, changeId: string, status: AuditResult["status"], startedAt = "2026-01-01T00:00:00.000Z"): Promise<void> {
  const audit: AuditResult = {
    version: "1.0",
    id,
    runId: id,
    changeId,
    status,
    startedAt,
    finishedAt: startedAt,
    findings: [],
    artifacts: {
      audit: `.agent-harness/runs/${id}/audit.json`,
      auditMarkdown: `.agent-harness/runs/${id}/audit.md`,
      lastMessage: `.agent-harness/runs/${id}/last-message.md`,
    },
  };
  await writeJsonFile(join(tempDir, ".agent-harness", "runs", id, "audit.json"), audit);
}
