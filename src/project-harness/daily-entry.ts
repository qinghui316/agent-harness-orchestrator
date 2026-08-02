import { resolve } from "node:path";
import { fingerprintProjectHarnessContent } from "./fingerprint.js";
import { checkProjectKnowledge, scanProjectKnowledge } from "./knowledge.js";
import { readProjectHarnessManifest } from "./manifest.js";
import { auditProjectHarness, doctorProjectHarness } from "./diagnostics.js";
import { DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY } from "../provider-runtime/project-harness-discovery.js";
import type {
  ProjectHarnessDailyRuntimeInvocation,
} from "./distribution.js";
import {
  assertDailyProjectBinding,
  parseProjectHarnessDailyArguments,
  runDailyChangeCommand,
  runDailyEvolutionCommand,
  runDailyIntegrationCommand,
} from "./daily-commands.js";

export async function runProjectHarnessDailyCommand(
  invocation: ProjectHarnessDailyRuntimeInvocation,
): Promise<unknown> {
  const skillRoot = resolve(invocation.skillRoot);
  const manifest = await readProjectHarnessManifest(skillRoot);
  const parsed = parseProjectHarnessDailyArguments(invocation.args, manifest.project_id);

  if (parsed.help && ["doctor", "audit", "knowledge"].includes(invocation.command)) {
    return { command: invocation.command, actions: invocation.command === "knowledge" ? ["scan", "check"] : [] };
  }

  if (invocation.command === "doctor") {
    return doctorProjectHarness({
      skillRoot,
      projectRoot: parsed.projectRoot,
      expectedProjectId: manifest.project_id,
      discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
    });
  }
  if (invocation.command === "audit") {
    return auditProjectHarness({
      skillRoot,
      projectRoot: parsed.projectRoot,
      expectedProjectId: manifest.project_id,
      discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
    });
  }
  if (invocation.command === "knowledge") {
    await assertDailyProjectBinding(skillRoot, manifest, parsed.projectRoot, DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY);
    const context = {
      projectId: manifest.project_id,
      projectRoot: parsed.projectRoot,
      skillRoot,
    };
    if (parsed.action === "scan") return scanProjectKnowledge(context);
    if (parsed.action === "check") return checkProjectKnowledge(context);
    throw new Error("Knowledge command requires scan or check.");
  }
  if (invocation.command === "change") return runDailyChangeCommand(skillRoot, manifest, parsed, DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY);
  if (invocation.command === "integrate") return runDailyIntegrationCommand(skillRoot, manifest, parsed, DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY);
  if (invocation.command === "evolve") return runDailyEvolutionCommand(skillRoot, manifest, parsed, DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY);

  throw new Error(`Unsupported daily Runtime command: ${invocation.command}.`);
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
