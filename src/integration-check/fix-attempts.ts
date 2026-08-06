import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { getSortedSourceStatus, renderImplementationSummary, writeEmptyCodeArtifacts } from "../code/artifacts.js";
import { createCodeRunSession, finishRun } from "../code/run-session.js";
import { buildRoleContextArtifact, buildRoleContextPacket, contextSourceRef } from "../context/packets.js";
import { writeJsonFile } from "../fs/json.js";
import { resolveProjectHarnessAgentInput } from "../project-harness/agent-input.js";
import { git, gitText } from "../project/git.js";
import { withProjectWriteLeaseAtPath } from "../project/project-write-lease.js";
import { resolveProjectActiveExecutionScope } from "../project-runtime/active-execution-scope.js";
import type { ProjectCodeExecutionRuntimePort } from "../project-runtime/execution-ports.js";
import { defaultProviderRegistry } from "../provider-runtime/index.js";
import { DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY } from "../provider-runtime/project-harness-discovery.js";
import { appendRunEvent } from "../run/manager.js";
import { getGlobalWorktreeCheckoutRoot } from "../worktree/manager.js";
import { prepareWorktreeDependencyBridge } from "../worktree/dependencies.js";
import type { ManagedProject, RunMetadata } from "../types/index.js";
import { skillNativeIntegrationArtifact } from "./artifacts.js";
import { appendIntegrationEvent } from "./repository.js";
import { collectCheckoutPatch, prepareSkillNativeIntegrationFixCheckout } from "./patch-workspace.js";
import type { IntegrationArtifact, IntegrationFixAttempt, IntegrationFixAttemptStatus } from "./types.js";
import { openProjectRuntimeWorkbenchDatabase } from "../workbench/persistence/open-workbench-database.js";
import { finishProviderAttempt, startProviderAttempt } from "../workbench/provider-attempts.js";
import { defaultProjectRuntimeActivityRegistry } from "../project-runtime/activity.js";

export interface IntegrationFixRepairRunnerInput {
  project: ManagedProject;
  runtime: ProjectCodeExecutionRuntimePort;
  directory: string;
  checkId: string;
  changeId: string;
  attemptId: string;
  checkoutPath: string;
  inputPatchPath: string;
  reason: string;
}

export interface IntegrationFixRepairRunnerResult {
  repairMode?: IntegrationFixAttempt["repairMode"];
  runId?: string;
  runArtifactRefs?: string[];
  summary?: string;
}

export type IntegrationFixRepairRunner = (input: IntegrationFixRepairRunnerInput) => Promise<IntegrationFixRepairRunnerResult | void>;

export type SkillNativeIntegrationFixRepairRunnerInput = IntegrationFixRepairRunnerInput;

export type SkillNativeIntegrationFixRepairRunner = (
  input: SkillNativeIntegrationFixRepairRunnerInput,
) => Promise<IntegrationFixRepairRunnerResult | void>;

export interface IntegrationFixAttemptOptions {
  repairRunner?: IntegrationFixRepairRunner;
  changeId?: string;
}

export function runIntegrationFixAttempt(
  project: ManagedProject,
  directory: string,
  checkId: string,
  inputPatchPath: string,
  reason: string,
  options: IntegrationFixAttemptOptions = {},
): Promise<{ attempt: IntegrationFixAttempt; artifact?: IntegrationArtifact }> {
  return defaultProjectRuntimeActivityRegistry.run(project.id, async () => {
    const scope = await resolveProjectActiveExecutionScope(project, options.changeId);
    return runSkillNativeIntegrationFixAttemptActivity(
      project,
      scope.runtime,
      directory,
      checkId,
      inputPatchPath,
      reason,
      {
        repairRunner: options.repairRunner,
        changeId: scope.harness.planning.change.change_id,
      },
    );
  });
}

export function runSkillNativeIntegrationFixAttempt(
  project: ManagedProject,
  runtime: ProjectCodeExecutionRuntimePort,
  directory: string,
  checkId: string,
  inputPatchPath: string,
  reason: string,
  options: { repairRunner?: SkillNativeIntegrationFixRepairRunner; changeId: string },
): Promise<{ attempt: IntegrationFixAttempt; artifact?: IntegrationArtifact }> {
  return defaultProjectRuntimeActivityRegistry.run(project.id, () => runSkillNativeIntegrationFixAttemptActivity(
    project,
    runtime,
    directory,
    checkId,
    inputPatchPath,
    reason,
    options,
  ));
}

async function runSkillNativeIntegrationFixAttemptActivity(
  project: ManagedProject,
  runtime: ProjectCodeExecutionRuntimePort,
  directory: string,
  checkId: string,
  inputPatchPath: string,
  reason: string,
  options: { repairRunner?: SkillNativeIntegrationFixRepairRunner; changeId: string },
): Promise<{ attempt: IntegrationFixAttempt; artifact?: IntegrationArtifact }> {
    const startedAt = new Date().toISOString();
    const attemptId = `fix-${checkId}-${Math.max(1, Date.now()).toString(36)}`;
    const checkoutPath = join(getGlobalWorktreeCheckoutRoot(runtime.projectId), "integration", shortFixCheckoutName(checkId, attemptId));
    let artifact: IntegrationArtifact | undefined;
    let status: IntegrationFixAttemptStatus = "failed";
    let summary = "自动修复未能生成可验证的组合补丁。";
    let repairMode: IntegrationFixAttempt["repairMode"] | undefined;
    let runId: string | undefined;
    let runArtifactRefs: string[] | undefined;
    try {
      await prepareSkillNativeIntegrationFixCheckout(project, runtime, checkoutPath, inputPatchPath);
      const repair = await (options.repairRunner ?? runProviderIntegrationRepair)({
        project,
        runtime,
        directory,
        checkId,
        changeId: options.changeId,
        attemptId,
        checkoutPath,
        inputPatchPath,
        reason,
      });
      repairMode = repair?.repairMode;
      runId = repair?.runId;
      runArtifactRefs = repair?.runArtifactRefs;
      const repairedPatch = await collectCheckoutPatch(checkoutPath);
      if (!repairedPatch.trim()) throw new Error("IntegrationFix did not produce a repaired diff.");
      const repairedPatchPath = join(directory, "repaired.patch");
      await writeFile(repairedPatchPath, repairedPatch, "utf8");
      artifact = skillNativeIntegrationArtifact(runtime, repairedPatchPath, repairedPatch, "repaired", "integration-fix-agent");
      status = "completed";
      summary = repair?.summary ?? "integration-fix-agent 已生成修复后的组合补丁。";
    } catch (cause) {
      summary = cause instanceof Error ? cause.message : String(cause);
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, "integration-fix-stderr.log"), `${summary}\n`, { encoding: "utf8", flag: "a" });
    } finally {
      await withProjectWriteLeaseAtPath(runtime.projectWriteLeasePath, {}, async () => {
        await git(project.path, ["worktree", "remove", "--force", checkoutPath]).catch(() => "");
        await rm(checkoutPath, { recursive: true, force: true }).catch(() => undefined);
        await git(project.path, ["worktree", "prune"]).catch(() => "");
      }).catch(() => undefined);
    }
    const attempt: IntegrationFixAttempt = {
      id: attemptId,
      roleId: "integration-fix-agent",
      status,
      repairMode,
      reason,
      inputArtifactRef: basename(inputPatchPath),
      runId,
      runArtifactRefs,
      outputArtifactRef: artifact?.path,
      outputArtifactHash: artifact?.hash,
      summary,
      startedAt,
      finishedAt: new Date().toISOString(),
    };
    await appendIntegrationEvent(directory, checkId, "integration-fix.completed", { attemptId, status, artifact: artifact?.path });
    return { attempt, artifact };
}

async function runProviderIntegrationRepair(input: IntegrationFixRepairRunnerInput): Promise<IntegrationFixRepairRunnerResult> {
  const runId = `${input.attemptId}-provider`;
  const session = await createCodeRunSession(input.runtime, runId);
  const projectHarnessInput = await resolveProjectHarnessAgentInput(input.project, DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY);
  const scope = await resolveProjectActiveExecutionScope(input.project, input.changeId);
  if (scope.runtime.projectId !== input.runtime.projectId
    || scope.runtime.runArtifactRoot !== input.runtime.runArtifactRoot) {
    throw new Error("IntegrationFix runtime scope is stale.");
  }
  const changeStatus = scope.harness.changeStatus;
  if (changeStatus.change?.id !== input.changeId) {
    throw new Error(`IntegrationFix expected active Change ${input.changeId}, found ${changeStatus.change?.id ?? "none"}.`);
  }
  const sourceBefore = await getSortedSourceStatus(input.project.path);
  const prompt = await buildIntegrationFixPrompt(input);
  const now = new Date().toISOString();
  const contextArtifact = buildRoleContextArtifact(buildRoleContextPacket({
    roleId: "integration-fix-agent",
    changeStatus,
    goal: `Repair IntegrationCheck ${input.checkId} in the isolated integration checkout.`,
    runId,
    projectHarness: projectHarnessInput.identity,
    writableRoots: [input.checkoutPath],
    sandboxPolicy: "workspace-write",
    evidenceSummary: [
      `IntegrationCheck: ${input.checkId}.`,
      `Repair reason: ${input.reason}.`,
    ],
    evidenceRefs: [
      contextSourceRef("integration-input-patch", input.inputPatchPath, "ref", "Exact aggregate patch selected for bounded repair."),
    ],
    createdAt: now,
  }), session.artifacts.contextPacket!);
  const run: RunMetadata = {
    version: "1.0",
    id: runId,
    changeId: input.changeId,
    projectPath: input.project.path,
    runtime: "provider-code",
    executionMode: "worktree",
    proposalOnly: true,
    command: ["provider", "turn.start"],
    status: "created",
    exitCode: null,
    signal: null,
    startedAt: now,
    finishedAt: null,
    artifacts: session.artifacts,
    contextPacket: contextArtifact.ref,
    promptStack: ["integration-check", "integration-fix", "provider-repair"],
  };
  await writeJsonFile(session.paths.run, run);
  await writeJsonFile(session.paths.contextPacket, contextArtifact.packet);
  await writeFile(session.paths.context, `${contextArtifact.markdown}\n${buildIntegrationFixContext(input)}`, "utf8");
  await writeFile(session.paths.prompt, prompt, "utf8");
  await appendRunEvent(session.paths.events, { timestamp: now, type: "run.created", runId, data: { checkId: input.checkId, attemptId: input.attemptId, runtime: "provider-code", executionMode: "worktree" } });
  await appendRunEvent(session.paths.events, { timestamp: now, type: "context.prepared", runId, data: { path: session.artifacts.context } });

  try {
    const dependencyBridge = await prepareWorktreeDependencyBridge({ sourceRoot: input.project.path, checkoutPath: input.checkoutPath });
    await appendRunEvent(session.paths.events, {
      timestamp: new Date().toISOString(),
      type: "code.dependency_bridge.prepared",
      runId,
      data: bridgeData(dependencyBridge),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeFile(session.paths.stderr, `## dependency setup\n${message}\n`, "utf8");
    await appendRunEvent(session.paths.events, {
      timestamp: new Date().toISOString(),
      type: "code.dependency_bridge.failed",
      runId,
      data: { error: message },
    });
    await writeEmptyCodeArtifacts(session.paths, [
      "# IntegrationFix Unavailable",
      "",
      "AHO could not prepare local project dependencies for the integration fix checkout.",
      "",
      message,
      "",
    ].join("\n"));
    await finishRun(session.paths.run, run, "failed", 1, null);
    throw new Error(message);
  }

  const providerId = await selectedProviderForIntegrationFix(input.runtime, input.project, input.changeId);
  const provider = await defaultProviderRegistry.require(providerId, "coder", input.project, input.checkoutPath);
  const capabilities = await provider.capabilitySnapshot(input.project, input.checkoutPath);
  let running: RunMetadata = {
    ...run,
    command: ["provider", "turn.start"],
    status: "running",
    enabledSkills: [{ ...projectHarnessInput.providerSkillInput, providerId }],
  };
  await writeJsonFile(session.paths.run, running);
  await appendRunEvent(session.paths.events, { timestamp: new Date().toISOString(), type: "coder.started", runId, data: { cwd: input.checkoutPath, command: running.command } });
  await appendRunEvent(session.paths.events, { timestamp: new Date().toISOString(), type: "provider.started", runId, data: { cwd: input.checkoutPath, providerId, capabilities } });
  await startProviderAttempt(input.runtime, {
    attemptId: runId,
    providerId,
    capabilitySnapshot: capabilities,
    operationProfile: "coder",
    roleId: "integration-fix-agent",
    parentAgentSurfaceId: "main-agent",
    handoffHash: createHash("sha256").update(prompt).digest("hex"),
    changeId: input.changeId,
    model: capabilities.effectiveModel ? { providerId, modelId: capabilities.effectiveModel } : null,
  });
  let result;
  try {
    result = await provider.leafExecution.runTurn({
    providerId,
    operationProfile: "coder",
    projectId: input.project.id,
    changeId: input.changeId,
    runtimeScopeId: runId,
    roleId: "integration-fix-agent",
    runId,
    attemptId: runId,
    cwd: input.checkoutPath,
    prompt,
    skillInputs: [projectHarnessInput.providerSkillInput],
    sandboxPolicy: "workspace-write",
    paths: { events: session.paths.providerEvents, stderr: session.paths.stderr, lastMessage: session.paths.lastMessage, session: session.paths.providerSession },
    runtimeWorkspaceRoots: [input.checkoutPath, input.runtime.runArtifactRoot],
    writableRoots: [input.checkoutPath],
    model: capabilities.effectiveModel ? { providerId, modelId: capabilities.effectiveModel } : null,
    additionalContext: {
      "aho.role-context": { kind: "application", value: contextArtifact.markdown },
    },
    });
  } catch (error) {
    await finishProviderAttempt(input.runtime, runId, "failed", null);
    throw error;
  }
  await finishProviderAttempt(input.runtime, runId, result.status === "completed" ? "completed" : result.status === "interrupted" ? "interrupted" : "failed", result.session?.sessionId ?? null);
  await appendRunEvent(session.paths.events, { timestamp: new Date().toISOString(), type: "provider.exited", runId, data: { providerId, status: result.status, sessionId: result.session?.sessionId, turnId: result.turnId, error: result.error } });
  const lastMessage = result.lastMessage || result.error || "Provider did not return a final message.";
  await writeFile(session.paths.lastMessage, lastMessage, "utf8");
  const repairedPatch = await collectCheckoutPatch(input.checkoutPath);
  const diffStat = await gitText(input.checkoutPath, ["diff", "--stat", "HEAD"]);
  await writeFile(session.paths.diff, repairedPatch, "utf8");
  await writeFile(session.paths.diffStat, diffStat, "utf8");
  await appendRunEvent(session.paths.events, { timestamp: new Date().toISOString(), type: "diff.collected", runId, data: { bytes: Buffer.byteLength(repairedPatch, "utf8"), stat: diffStat } });

  const sourceAfter = await getSortedSourceStatus(input.project.path);
  const sourceChanged = JSON.stringify(sourceBefore) !== JSON.stringify(sourceAfter);
  await appendRunEvent(session.paths.events, { timestamp: new Date().toISOString(), type: "source.checked", runId, data: { before: sourceBefore, after: sourceAfter, changed: sourceChanged } });

  const processSucceeded = result.status === "completed";
  const warnings = [
    ...(repairedPatch.trim() ? [] : ["IntegrationFix provider run completed without producing a repaired diff."]),
    ...(sourceChanged ? ["Source project git status changed during IntegrationFix; the provider may have modified outside the integration checkout."] : []),
    ...(processSucceeded ? [] : [`Provider IntegrationFix failed: ${result.error ?? result.status}`]),
  ];
  await writeFile(session.paths.implementation, renderImplementationSummary({
    lastMessage,
    diffStat,
    diff: repairedPatch,
    warnings,
    sourceBefore,
    sourceAfter,
  }), "utf8");

  const completed = processSucceeded && !sourceChanged && repairedPatch.trim().length > 0;
  running = await finishRun(session.paths.run, running, completed ? "completed" : "failed", completed ? 0 : 1, null);
  await appendRunEvent(session.paths.events, { timestamp: running.finishedAt ?? new Date().toISOString(), type: completed ? "run.completed" : "run.failed", runId, data: { warnings } });
  if (!completed) {
    throw new Error(warnings[0] ?? "IntegrationFix provider repair failed.");
  }

  return {
    repairMode: "provider",
    runId,
    runArtifactRefs: [
      `${session.relativeDir}/run.json`,
      session.artifacts.providerEvents,
      session.artifacts.lastMessage,
      session.artifacts.diff,
      session.artifacts.diffStat,
      session.artifacts.implementation,
    ].filter((ref): ref is string => Boolean(ref)),
    summary: `${provider.displayName} 在 integration fix checkout 中生成了修复后的组合补丁。`,
  };
}

async function selectedProviderForIntegrationFix(memory: ProjectCodeExecutionRuntimePort, project: ManagedProject, changeId: string): Promise<string> {
  const store = await openProjectRuntimeWorkbenchDatabase(memory);
  try {
    return store.conversations.findConversationForChange(memory.projectId, changeId)?.selectedProviderId
      ?? (project.defaultProviderId ? defaultProviderRegistry.get(project.defaultProviderId).id : undefined)
      ?? defaultProviderRegistry.requireOnly().id;
  } finally {
    store.close();
  }
}

async function buildIntegrationFixPrompt(input: IntegrationFixRepairRunnerInput): Promise<string> {
  const patch = await readFile(input.inputPatchPath, "utf8").catch(() => "");
  return [
    "# AHO IntegrationFix Repair",
    "",
    "You are repairing the current integration checkout for Agent Harness Orchestrator.",
    "",
    "## Hard Boundaries",
    "",
    "- Edit only the current integration fix checkout.",
    "- Do not edit the original source root, AHO memory, Harness docs, remote branches, or external services.",
    "- Produce a real repaired diff; do not claim success without changing the integration checkout.",
    "- Keep the repair bounded to the aggregate validation/audit/conflict reason.",
    "",
    "## Failure Reason",
    "",
    input.reason.trim() || "IntegrationCheck failed.",
    "",
    "## Input Patch",
    "",
    `Patch file: ${input.inputPatchPath}`,
    "",
    "```diff",
    truncateForPrompt(patch, 120_000),
    "```",
    "",
    "## Expected Result",
    "",
    "Update files in this checkout so the combined integration result can pass aggregate validation and audit.",
    "Leave a concise final message describing the repair and any remaining blocker.",
    "",
  ].join("\n");
}

function buildIntegrationFixContext(input: IntegrationFixRepairRunnerInput): string {
  return [
    "# IntegrationFix Context",
    "",
`- Check id: ${input.checkId}`,
    `- Change id: ${input.changeId}`,
    `- Attempt id: ${input.attemptId}`,
    `- Checkout: ${input.checkoutPath}`,
    `- Input patch: ${input.inputPatchPath}`,
    `- Reason: ${input.reason}`,
    "",
    "This is a bounded integration-layer repair. Source root mutation is not allowed.",
    "",
  ].join("\n");
}

function truncateForPrompt(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n\n[truncated ${value.length - maxChars} chars]`;
}

function bridgeData(input: {
  status: string;
  checkoutDependencyPath: string;
  sourceDependencyPath?: string;
  reason?: string;
}): Record<string, unknown> {
  return {
    status: input.status,
    checkoutDependencyPath: input.checkoutDependencyPath,
    sourceDependencyPath: input.sourceDependencyPath,
    reason: input.reason,
  };
}

function shortFixCheckoutName(checkId: string, attemptId: string): string {
  const hash = createHash("sha256").update(`${checkId}:${attemptId}`).digest("hex").slice(0, 10);
  return `ifix-${hash}`;
}
