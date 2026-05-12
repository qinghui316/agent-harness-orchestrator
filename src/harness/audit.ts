import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import type { HarnessAuditResult, HarnessComponentStatus, HarnessReadiness } from "../types/index.js";
import { getActiveChanges, hasPendingEvolution } from "../ecl/index.js";
import { readProjectMarker } from "../project/marker.js";
import { resolveMemory } from "../memory/resolver.js";

const requiredComponents: Array<Omit<HarnessComponentStatus, "exists">> = [
  { name: "AGENTS.md", path: "AGENTS.md", required: true },
  { name: "docs/ECL.md", path: "docs/ECL.md", required: true },
  { name: "docs/STATUS.md", path: "docs/STATUS.md", required: true },
  { name: "harness/changes", path: "harness/changes", required: true },
  { name: "harness/evolution", path: "harness/evolution", required: true },
  { name: "harness/templates/change", path: "harness/templates/change", required: true },
  { name: "scripts/harness-change.ps1", path: "scripts/harness-change.ps1", required: true },
  { name: "scripts/harness-evolve.ps1", path: "scripts/harness-evolve.ps1", required: true },
  { name: "scripts/lint-ecl.ps1", path: "scripts/lint-ecl.ps1", required: true },
  { name: "scripts/lint-encoding.ps1", path: "scripts/lint-encoding.ps1", required: true },
];

export async function auditHarness(projectPath: string): Promise<HarnessAuditResult> {
  const marker = await readProjectMarker(projectPath);
  const memory = resolveMemory({ path: projectPath, marker });
  if (!memory.supported) {
    return {
      projectPath,
      managed: marker !== null,
      readiness: "missing",
      activeChanges: [],
      pendingEvolution: false,
      components: requiredComponents.map((component) => ({
        ...component,
        exists: false,
      })),
    };
  }
  const components = requiredComponents.map((component) => ({
    ...component,
    path: displayPath(projectPath, join(memory.harnessRoot, component.path)),
    exists: existsSync(join(memory.harnessRoot, component.path)),
  }));
  const required = components.filter((component) => component.required);
  const existing = required.filter((component) => component.exists);
  const readiness: HarnessReadiness =
    existing.length === 0 ? "missing" : existing.length === required.length ? "ready" : "partial";

  return {
    projectPath,
    managed: marker !== null,
    readiness,
    activeChanges: await getActiveChanges(memory),
    pendingEvolution: hasPendingEvolution(memory),
    components,
  };
}

function displayPath(projectPath: string, absolutePath: string): string {
  return relative(projectPath, absolutePath).replace(/\\/g, "/") || ".";
}
