import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveProjectActiveExecutionScope } from "../project-runtime/active-execution-scope.js";
import type { AuditResult, ManagedProject } from "../types/index.js";
import { readValidationResult } from "../validation/repository.js";
import { readAuditResult } from "./repository.js";
import {
  requireProjectExecutionRuntimePort,
  type ProjectExecutionRuntimePort,
} from "../project-runtime/execution-ports.js";
import { projectHarnessSharedWriterRoot, withProjectHarnessWriterLock } from "../project-harness/writer-lock.js";

export async function acceptAudit(project: ManagedProject, auditId: string): Promise<{ audit: AuditResult; reviewPath: string }> {
  const initialRuntime = await requireProjectExecutionRuntimePort(project);
  const audit = await readAuditResult(initialRuntime, auditId);
  const scope = await resolveProjectActiveExecutionScope(project, audit.changeId);
  return acceptSkillNativeAudit({
    project,
    runtime: scope.runtime,
    evidenceRoot: scope.harness.evidenceRoot,
    writerRoot: projectHarnessSharedWriterRoot(scope.runtime.runArtifactRoot),
    auditId,
  });
}
export async function acceptSkillNativeAudit(input: {
  project: ManagedProject;
  runtime: ProjectExecutionRuntimePort;
  evidenceRoot: string;
  writerRoot: string;
  auditId: string;
}): Promise<{ audit: AuditResult; reviewPath: string }> {
  const audit = await readAuditResult(input.runtime, input.auditId);
  if (audit.changeId !== input.evidenceRoot.split(/[\\/]/).at(-1)) {
    throw new Error("Skill-native audit acceptance Change scope is stale.");
  }
  if (audit.validationId) {
    await readValidationResult(input.runtime, audit.validationId, { changeId: audit.changeId });
  }
  if (audit.status !== "approved" && audit.status !== "approved-with-notes") {
    throw new Error(`Cannot accept audit with status ${audit.status}. Only approved and approved-with-notes can be accepted.`);
  }
  return withProjectHarnessWriterLock(input.writerRoot, {
    projectId: input.runtime.projectId,
    ownerId: `audit-accept-${audit.id}`,
    operation: "audit-accept",
  }, async (lock) => {
    const reviewPath = join(input.evidenceRoot, "reviews", "review.md");
    const auditMarkdownPath = join(input.runtime.runsRoot, audit.runId, "audit.md");
    const auditMarkdown = existsSync(auditMarkdownPath) ? await readFile(auditMarkdownPath, "utf8") : "";
    await mkdir(join(input.evidenceRoot, "reviews"), { recursive: true });
    await lock.assertCurrent();
    const temporary = `${reviewPath}.tmp.${process.pid}.${Date.now()}`;
    try {
      await writeFile(temporary, renderAcceptedReview(audit, auditMarkdown), "utf8");
      await rename(temporary, reviewPath);
    } finally {
      await rm(temporary, { force: true }).catch(() => undefined);
    }
    return { audit, reviewPath: "project-skill:reviews/review.md" };
  });
}

function renderAcceptedReview(audit: AuditResult, auditMarkdown: string): string {
  return [
    `Status: ${audit.status}`,
    "",
    "## Accepted Audit",
    "",
    `- Audit ID: ${audit.id}`,
    `- Run ID: ${audit.runId}`,
    `- Change ID: ${audit.changeId}`,
    audit.validationId ? `- Validation ID: ${audit.validationId}` : "- Validation ID: none",
    audit.worktreeId ? `- Worktree ID: ${audit.worktreeId}` : "- Worktree ID: none",
    audit.worktreeDiffHash ? `- Worktree Diff Hash: ${audit.worktreeDiffHash}` : "- Worktree Diff Hash: none",
    `- Findings: ${audit.findings.length}`,
    "",
    "## Auditor Proposal",
    "",
    auditMarkdown.trim() || "No audit markdown captured.",
    "",
  ].join("\n");
}
