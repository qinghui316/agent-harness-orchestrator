import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { getChangeStatusForChange } from "../change/status.js";
import { assertWritableMemory, resolveProjectMemory } from "../memory/resolver.js";
import type { AuditResult, ManagedProject, ResolvedMemory } from "../types/index.js";
import { readValidationResult } from "../validation/repository.js";
import { readAuditResult } from "./repository.js";
import type { ProjectExecutionRuntimePort } from "../project-runtime/execution-ports.js";
import { withProjectHarnessWriterLock } from "../project-harness/writer-lock.js";

export async function acceptAudit(project: ManagedProject, auditId: string): Promise<{ audit: AuditResult; reviewPath: string }> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Audit accept");
  const audit = await readAuditResult(memory, auditId);
  if (audit.validationId) {
    await readValidationResult(memory, audit.validationId, { changeId: audit.changeId });
  }
  const status = await getChangeStatusForChange(project, audit.changeId);
  if (!status.change || status.activeChanges.length !== 1) throw new Error(`Cannot accept audit for change ${audit.changeId}: active demand conversation not found.`);
  if (audit.status !== "approved" && audit.status !== "approved-with-notes") {
    throw new Error(`Cannot accept audit with status ${audit.status}. Only approved and approved-with-notes can be accepted.`);
  }
  const reviewPath = join(memory.memoryRoot, status.activeChanges[0].path, "reviews", "review.md");
  const auditMarkdownPath = join(memory.runsRoot, audit.runId, "audit.md");
  const auditMarkdown = existsSync(auditMarkdownPath) ? await readFile(auditMarkdownPath, "utf8") : "";
  await writeFile(reviewPath, renderAcceptedReview(audit, auditMarkdown), "utf8");
  return { audit, reviewPath: displayArtifactPath(memory, reviewPath) };
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

function displayArtifactPath(memory: ResolvedMemory, absolutePath: string): string {
  const base = memory.artifactBase === "memory-root" ? memory.memoryRoot : memory.projectRoot;
  return relative(base, absolutePath).replace(/\\/g, "/");
}
