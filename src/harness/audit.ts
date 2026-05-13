import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import type { HarnessAuditResult, HarnessComponentStatus, HarnessReadiness } from "../types/index.js";
import { getActiveChanges, hasPendingEvolution } from "../ecl/index.js";
import { readProjectMarker } from "../project/marker.js";
import { resolveMemory } from "../memory/resolver.js";

const requiredComponents: Array<Omit<HarnessComponentStatus, "exists">> = [
  { name: "AGENTS.md", path: "AGENTS.md", location: "project", required: true },
  { name: ".agent-harness/project.json", path: ".agent-harness/project.json", location: "project", required: true },
  { name: "docs/ECL.md", path: "docs/ECL.md", location: "memory", required: true },
  { name: "docs/STATUS.md", path: "docs/STATUS.md", location: "memory", required: true },
  { name: "harness/changes", path: "harness/changes", location: "memory", required: true },
  { name: "harness/evolution", path: "harness/evolution", location: "memory", required: true },
  { name: "harness/templates/change", path: "harness/templates/change", location: "memory", required: true },
  { name: "scripts/harness-change.ps1", path: "scripts/harness-change.ps1", location: "memory", required: true },
  { name: "scripts/harness-evolve.ps1", path: "scripts/harness-evolve.ps1", location: "memory", required: true },
  { name: "scripts/lint-ecl.ps1", path: "scripts/lint-ecl.ps1", location: "memory", required: true },
  { name: "scripts/lint-encoding.ps1", path: "scripts/lint-encoding.ps1", location: "memory", required: true },
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
  const components = requiredComponents.map((component) => {
    const root = component.location === "project" ? memory.projectRoot : memory.memoryRoot;
    const absolute = join(root, component.path);
    return {
      ...component,
      path: displayPath(root, absolute),
      exists: existsSync(absolute),
    };
  });
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

function displayPath(basePath: string, absolutePath: string): string {
  return relative(basePath, absolutePath).replace(/\\/g, "/") || ".";
}
