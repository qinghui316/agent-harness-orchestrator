import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { DocBudgetReport, ResolvedMemory } from "../types/index.js";
import { writeJsonFile } from "../fs/json.js";
import { DOC_BUDGETS } from "./constants.js";
import { createAgentTask } from "./repository.js";
import { displayMaintenancePath, maintenanceRoot } from "./paths.js";
import { docBudgetReportSchema } from "./schemas.js";
import { estimateWordCount } from "./utils.js";

export async function checkDocBudgets(memory: ResolvedMemory): Promise<DocBudgetReport> {
  const now = new Date().toISOString();
  const docs = [];
  for (const [docPath, limits] of Object.entries(DOC_BUDGETS)) {
    const absolute = docPath === "AGENTS.md" ? memory.agentGuidePath : join(memory.docsRoot, docPath.replace(/^docs[\\/]/, ""));
    if (!existsSync(absolute)) continue;
    const text = await readFile(absolute, "utf8").catch(() => "");
    const wordCount = estimateWordCount(text);
    docs.push({
      path: docPath,
      wordCount,
      softLimit: limits.soft,
      hardLimit: limits.hard,
      status: wordCount > limits.hard ? "hard-exceeded" as const : wordCount > limits.soft ? "soft-exceeded" as const : "ok" as const,
    });
  }
  const report: DocBudgetReport = {
    version: "1.0",
    id: `doc-budget-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    documents: docs,
    createdAt: now,
  };
  docBudgetReportSchema.parse(report);
  await writeJsonFile(join(maintenanceRoot(memory), "doc-budgets", `${report.id}.json`), report);
  const hardExceeded = docs.filter((doc) => doc.status === "hard-exceeded");
  if (hardExceeded.length > 0) {
    await createAgentTask(memory, {
      conversationId: "maintenance",
      changeId: `maintenance-${report.id}`,
      roleId: "documentation-agent",
      kind: "background",
      summary: `Prepare doc-refinement proposal for ${hardExceeded.map((doc) => doc.path).join(", ")}. Do not edit canonical docs.`,
      inputArtifacts: [displayMaintenancePath(memory, join(maintenanceRoot(memory), "doc-budgets", `${report.id}.json`))],
      createdBy: "maintenance-policy",
    });
  }
  return report;
}
