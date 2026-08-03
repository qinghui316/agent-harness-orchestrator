import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { writeJsonFile } from "../fs/json.js";
import type { ResolvedMemory } from "../types/index.js";
import type { ProjectExecutionRuntimePort } from "../project-runtime/execution-ports.js";
import { displayArtifactPath, displaySkillNativeArtifactPath } from "./paths.js";
import type { AggregateAuditResult, AggregateAuditStatus } from "./types.js";

export async function runAggregateAudit(
  memory: ResolvedMemory,
  directory: string,
  checkId: string,
  checkoutPath: string,
  validationPassed: boolean,
  blockingIssues: string[],
): Promise<AggregateAuditResult> {
  return runAggregateAuditCore(directory, checkId, checkoutPath, validationPassed, blockingIssues, (path) => displayArtifactPath(memory, path));
}

export async function runSkillNativeAggregateAudit(
  runtime: ProjectExecutionRuntimePort,
  directory: string,
  checkId: string,
  checkoutPath: string,
  validationPassed: boolean,
  blockingIssues: string[],
): Promise<AggregateAuditResult> {
  return runAggregateAuditCore(directory, checkId, checkoutPath, validationPassed, blockingIssues, (path) => displaySkillNativeArtifactPath(runtime, path));
}

async function runAggregateAuditCore(
  directory: string,
  checkId: string,
  checkoutPath: string,
  validationPassed: boolean,
  blockingIssues: string[],
  artifactRef: (path: string) => string,
): Promise<AggregateAuditResult> {
  let status: AggregateAuditStatus = "approved";
  const findings: string[] = [];
  if (!validationPassed) {
    status = "blocked";
    findings.push("Aggregate validation did not pass.");
  }
  if (blockingIssues.length > 0) {
    status = "blocked";
    findings.push(...blockingIssues);
  }
  const auditMarker = join(checkoutPath, "integration-audit-fail.txt");
  if (existsSync(auditMarker)) {
    status = "blocked";
    findings.push("Aggregate audit failed: integration-audit-fail.txt marker exists.");
  }
  const result: AggregateAuditResult = {
    id: `aggregate-audit-${checkId}`,
    status,
    summary: status === "approved" ? "Aggregate audit approved the combined result." : "Aggregate audit blocked the combined result.",
    findings,
    artifactRef: artifactRef(join(directory, "aggregate-audit.json")),
    createdAt: new Date().toISOString(),
  };
  await writeJsonFile(join(directory, "aggregate-audit.json"), result);
  await writeFile(join(directory, "aggregate-audit.md"), renderAggregateAudit(result), "utf8");
  return result;
}

function renderAggregateAudit(result: AggregateAuditResult): string {
  return [
    `# ${result.id}`,
    "",
    `- Status: ${result.status}`,
    `- Summary: ${result.summary}`,
    "",
    "## Findings",
    ...(result.findings.length ? result.findings.map((finding) => `- ${finding}`) : ["- None"]),
    "",
  ].join("\n");
}
