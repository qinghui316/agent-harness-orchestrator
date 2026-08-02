import { resolve } from "node:path";
import { fingerprintProjectHarnessContent } from "./fingerprint.js";
import { checkProjectKnowledge, scanProjectKnowledge } from "./knowledge.js";
import { readProjectHarnessManifest } from "./manifest.js";
import { auditProjectHarness, doctorProjectHarness } from "./diagnostics.js";
import type {
  ProjectHarnessDailyRuntimeInvocation,
} from "./distribution.js";

interface DailyCommandArguments {
  action: string | null;
  projectRoot: string;
}

export async function runProjectHarnessDailyCommand(
  invocation: ProjectHarnessDailyRuntimeInvocation,
): Promise<unknown> {
  const parsed = parseDailyArguments(invocation.args);
  const skillRoot = resolve(invocation.skillRoot);
  const manifest = await readProjectHarnessManifest(skillRoot);

  if (invocation.command === "doctor") {
    return doctorProjectHarness({
      skillRoot,
      projectRoot: parsed.projectRoot,
      expectedProjectId: manifest.project_id,
    });
  }
  if (invocation.command === "audit") {
    return auditProjectHarness({
      skillRoot,
      projectRoot: parsed.projectRoot,
      expectedProjectId: manifest.project_id,
    });
  }
  if (invocation.command === "knowledge") {
    const context = {
      projectId: manifest.project_id,
      projectRoot: parsed.projectRoot,
      skillRoot,
    };
    if (parsed.action === "scan") return scanProjectKnowledge(context);
    if (parsed.action === "check") return checkProjectKnowledge(context);
    throw new Error("Knowledge command requires scan or check.");
  }

  throw new Error(`Daily Runtime command is not wired: ${invocation.command}.`);
}

export async function describeProjectHarnessDailyRuntime(skillRoot: string): Promise<{
  projectId: string;
  revision: number;
  contentFingerprint: string;
}> {
  const manifest = await readProjectHarnessManifest(skillRoot);
  return {
    projectId: manifest.project_id,
    revision: manifest.skill_revision,
    contentFingerprint: await fingerprintProjectHarnessContent(skillRoot),
  };
}

function parseDailyArguments(args: readonly string[]): DailyCommandArguments {
  let action: string | null = null;
  let projectRoot: string | null = null;
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--project-root") {
      const next = args[index + 1];
      if (!next) throw new Error("--project-root requires a path.");
      projectRoot = resolve(next);
      index += 1;
      continue;
    }
    if (value.startsWith("--")) continue;
    if (action === null) action = value;
  }
  if (!projectRoot) throw new Error("Daily Runtime requires --project-root <path>.");
  return { action, projectRoot };
}
