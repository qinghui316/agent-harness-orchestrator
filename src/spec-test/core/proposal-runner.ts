import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { z } from "zod";
import { collectWorktreeDiff } from "../../audit/diff.js";
import { buildRoleContextArtifact, buildRoleContextPacket, contextSourceRef } from "../../context/packets.js";
import { readRequiredJsonFile, writeJsonFile } from "../../fs/json.js";
import type { ProviderTurnResult } from "../../provider-runtime/index.js";
import { projectRunArtifactReference } from "../../project-runtime/execution-ports.js";
import type { ProjectRunsPathPort } from "../../project-runtime/paths.js";
import { appendRunEvent, buildRunId } from "../../run/manager.js";
import {
  finishProviderAttempt,
  resolveCurrentMainAgentProviderThread,
  rollbackProviderAttempt,
  startProviderAttempt,
} from "../../workbench/provider-attempts.js";
import { getAgentProfilesRoot } from "../../template-source/paths.js";
import { getLatestValidationSummary } from "../../validation/repository.js";
import { getActiveSpecTestContext, getSpecTestContextForChange, getSpecTestEvidenceFingerprint, getSpecTestStatus, linkSpecTestEvidenceBatch } from "./status.js";
import { resolveSpecTestProvider } from "./provider.js";
import type {
  ManagedProject,
  RunMetadata,
  RunStatus,
  SpecTestProposal,
  SpecTestProposalEvidence,
  SpecTestProposalStatus,
  SpecTestProposalSummary,
} from "../../types/index.js";
import { defaultProjectRuntimeActivityRegistry } from "../../project-runtime/activity.js";
import type { HighImpactApprovalScope } from "../../workflow-actions/high-impact-approval.js";
import { createSpecTestAcceptancePublication } from "./acceptance-recovery.js";

const specTestRefSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("file"), path: z.string() }),
  z.object({ type: z.literal("testName"), name: z.string(), path: z.string() }),
  z.object({ type: z.literal("command"), commandName: z.string() }),
  z.object({ type: z.literal("note"), text: z.string() }),
]);

const proposalEvidenceSchema = z.object({
  refId: z.string(),
  acId: z.string(),
  source: z.enum(["source-root", "worktree-only", "suggested", "unknown"]),
  kind: z.enum(["existingEvidence", "alreadyLinked", "missingEvidence", "suggestedNewTests", "openQuestions"]),
  refs: z.array(specTestRefSchema).default([]),
  rationale: z.string().default(""),
});

const proposalSchema = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  runId: z.string(),
  changeId: z.string(),
  status: z.enum(["proposed", "blocked", "failed"]),
  worktreeId: z.string().optional(),
  startedAt: z.string(),
  finishedAt: z.string(),
  evidence: z.array(proposalEvidenceSchema),
  artifacts: z.object({
    proposal: z.string(),
    proposalMarkdown: z.string(),
    lastMessage: z.string(),
  }),
  warnings: z.array(z.string()),
});

const modelOutputSchema = z.object({
  status: z.enum(["proposed", "blocked", "failed"]),
  evidence: z.array(proposalEvidenceSchema.omit({ refId: true }).extend({ refId: z.string().optional() })).default([]),
  warnings: z.array(z.string()).default([]),
});

const proposalOutputJsonSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["status", "evidence", "warnings"],
  properties: {
    status: { type: "string", enum: ["proposed", "blocked", "failed"] },
    evidence: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["acId", "source", "kind", "refs", "rationale"],
        properties: {
          refId: { type: "string" },
          acId: { type: "string" },
          source: { type: "string", enum: ["source-root", "worktree-only", "suggested", "unknown"] },
          kind: { type: "string", enum: ["existingEvidence", "alreadyLinked", "missingEvidence", "suggestedNewTests", "openQuestions"] },
          refs: {
            type: "array",
            items: {
              anyOf: [
                { type: "object", additionalProperties: false, required: ["type", "path"], properties: { type: { const: "file" }, path: { type: "string" } } },
                { type: "object", additionalProperties: false, required: ["type", "name", "path"], properties: { type: { const: "testName" }, name: { type: "string" }, path: { type: "string" } } },
                { type: "object", additionalProperties: false, required: ["type", "commandName"], properties: { type: { const: "command" }, commandName: { type: "string" } } },
                { type: "object", additionalProperties: false, required: ["type", "text"], properties: { type: { const: "note" }, text: { type: "string" } } },
              ],
            },
          },
          rationale: { type: "string" },
        },
      },
    },
    warnings: { type: "array", items: { type: "string" } },
  },
};

export interface SpecTestProposeOptions {
  worktreeId?: string;
  prompt?: string;
  changeId?: string;
}

export interface SpecTestProposalRunResult {
  run: RunMetadata;
  proposal: SpecTestProposal;
}

export interface SpecTestProposalAcceptOptions {
  ac?: string;
  ref?: string;
  allExisting?: boolean;
  scope?: HighImpactApprovalScope;
}

export interface SpecTestProposalAcceptResult {
  proposal: SpecTestProposal;
  accepted: SpecTestProposalEvidence[];
  skipped: Array<{ refId: string; reason: string }>;
  status: Awaited<ReturnType<typeof getSpecTestStatus>>;
  acceptanceTransactionId: string | null;
}

export function startSpecTestProposalRun(project: ManagedProject, options: SpecTestProposeOptions = {}): Promise<SpecTestProposalRunResult> {
  return defaultProjectRuntimeActivityRegistry.run(project.id, () => startSpecTestProposalRunActivity(project, options));
}

async function startSpecTestProposalRunActivity(project: ManagedProject, options: SpecTestProposeOptions): Promise<SpecTestProposalRunResult> {
  const contextScope = options.changeId
    ? await getSpecTestContextForChange(project, options.changeId)
    : await getActiveSpecTestContext(project);
  const changeStatus = contextScope.changeStatus;
  const changeId = contextScope.changeId;

  const runId = buildRunId(changeId, ["spec-test-proposer", options.worktreeId ?? "source-root", options.prompt ?? ""]);
  const directory = join(contextScope.runtime.runsRoot, runId);
  const artifactRoot = projectRunArtifactReference(contextScope.runtime, directory);
  const relativeDir = artifactRoot.directory;
  const artifacts = {
    owner: artifactRoot.owner,
    directory: relativeDir,
    context: `${relativeDir}/context.md`,
    contextPacket: `${relativeDir}/context-packet.json`,
    events: `${relativeDir}/events.jsonl`,
    stdout: `${relativeDir}/stdout.log`,
    stderr: `${relativeDir}/stderr.log`,
    prompt: `${relativeDir}/prompt.md`,
    providerEvents: `${relativeDir}/provider-events.jsonl`,
    providerSession: `${relativeDir}/provider-session.json`,
    lastMessage: `${relativeDir}/last-message.md`,
    specTestProposal: `${relativeDir}/spec-test-proposal.json`,
    specTestProposalMarkdown: `${relativeDir}/spec-test-proposal.md`,
  };
  const paths = {
    run: join(directory, "run.json"),
    context: join(directory, "context.md"),
    contextPacket: join(directory, "context-packet.json"),
    events: join(directory, "events.jsonl"),
    stdout: join(directory, "stdout.log"),
    stderr: join(directory, "stderr.log"),
    prompt: join(directory, "prompt.md"),
    providerEvents: join(directory, "provider-events.jsonl"),
    providerSession: join(directory, "provider-session.json"),
    lastMessage: join(directory, "last-message.md"),
    proposal: join(directory, "spec-test-proposal.json"),
    proposalMarkdown: join(directory, "spec-test-proposal.md"),
  };

  const now = new Date().toISOString();
  const specTestStatus = await getSpecTestStatus(project, { changeId, worktreeId: options.worktreeId });
  const latestValidation = await getLatestValidationSummary(contextScope.runtime, changeId, options.worktreeId ? { worktreeId: options.worktreeId } : {});
  const worktreeDiff = options.worktreeId ? await collectWorktreeDiff(contextScope.runtime, options.worktreeId, changeId) : null;
  const provider = await resolveSpecTestProvider(contextScope, project, "auditor", contextScope.projectRoot);
  const providerId = provider.id;
  const [capabilitySnapshot, mainThread] = await Promise.all([
    provider.capabilitySnapshot(project, "harness", project.path),
    resolveCurrentMainAgentProviderThread(contextScope.runtime, changeId, providerId),
  ]);
  let providerAttemptStarted = false;
  try {
  await mkdir(directory, { recursive: true });
  const contextArtifact = buildRoleContextArtifact(buildRoleContextPacket({
    roleId: "spec-test-proposer",
    changeStatus,
    goal: "Propose existing test evidence for the selected Acceptance Criteria without changing project state.",
    runId,
    projectHarness: contextScope.projectHarness,
    writableRoots: [],
    sandboxPolicy: "read-only",
    evidenceSummary: [
      `Spec-test mapping status contains ${specTestStatus.acceptanceCriteria.length} Acceptance Criteria.`,
      latestValidation ? `Latest validation selected: ${latestValidation.status} (${latestValidation.id}).` : "No validation run recorded for this Change.",
      worktreeDiff ? `Optional worktree diff selected: ${worktreeDiff.diffHash}.` : "No optional worktree evidence selected.",
    ],
    evidenceRefs: [
      contextSourceRef("spec-test-status", "spec-tests.json", "inline", "Current deterministic spec-test mapping status."),
      ...(latestValidation ? [contextSourceRef("latest-validation", latestValidation.id, "inline", "Latest relevant validation summary.")] : []),
      ...(worktreeDiff ? [contextSourceRef("worktree-diff", worktreeDiff.worktree.worktreeId, "ref", "Optional worktree evidence is supplied separately in the prompt.")] : []),
    ],
    createdAt: now,
  }), artifacts.contextPacket);
  let run: RunMetadata = {
    version: "1.0",
    id: runId,
    changeId,
    projectPath: project.path,
    runtime: "spec-test-proposer",
    executionMode: "direct",
    proposalOnly: true,
    command: ["provider", "turn.start"],
    status: "created",
    exitCode: null,
    signal: null,
    startedAt: now,
    finishedAt: null,
    artifacts,
    contextPacket: contextArtifact.ref,
  };
  await writeJsonFile(paths.run, run);
  await appendRunEvent(paths.events, { timestamp: now, type: "run.created", runId, data: { changeId, runtime: "spec-test-proposer", worktreeId: options.worktreeId } });

  const context = contextArtifact.markdown;
  await writeJsonFile(paths.contextPacket, contextArtifact.packet);
  await writeFile(paths.context, context, "utf8");
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "context.prepared", runId, data: { path: artifacts.context, contextPacket: artifacts.contextPacket, contextPacketHash: contextArtifact.hash } });
  const prompt = await composeSpecTestProposalPrompt({
    context,
    specTestStatus: JSON.stringify(specTestStatus, null, 2),
    latestValidation: latestValidation ? JSON.stringify(latestValidation, null, 2) : "No validation run recorded for this change.",
    sourceTests: await collectTestFileSummary(contextScope.projectRoot),
    worktreeId: options.worktreeId,
    worktreeDiffStat: worktreeDiff?.diffStat,
    worktreeDiff: worktreeDiff?.diff,
    extraPrompt: options.prompt,
  });
  await writeFile(paths.prompt, prompt, "utf8");

  run = {
    ...run,
    command: ["provider", "turn.start"],
    status: "running",
    enabledSkills: [{ ...contextScope.providerSkillInput, providerId }],
  };
  await writeJsonFile(paths.run, run);
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "spec-test.proposal.started", runId, data: { cwd: project.path, command: run.command } });
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "provider.started", runId, data: { cwd: project.path, providerId, capabilitySnapshot } });

  await startProviderAttempt(contextScope.runtime, {
    attemptId: runId,
    providerId,
    capabilitySnapshot,
    operationProfile: "auditor",
    roleId: "spec-test-proposer",
    parentAgentSurfaceId: mainThread.roleId,
    handoffHash: createHash("sha256").update(prompt).digest("hex"),
    changeId,
    conversationId: contextScope.conversationId,
    graphScopeId: contextScope.graphScopeId,
    worktreeId: options.worktreeId ?? null,
    model: capabilitySnapshot.effectiveModel ? { providerId, modelId: capabilitySnapshot.effectiveModel } : null,
  });
  providerAttemptStarted = true;

  let providerResult: ProviderTurnResult;
  try {
    providerResult = await provider.leafExecution.runTurn({
      providerId,
      operationProfile: "auditor",
      projectId: contextScope.projectId,
      conversationId: contextScope.conversationId,
      graphScopeId: contextScope.graphScopeId,
      changeId,
      runtimeScopeId: runId,
      roleId: "spec-test-proposer",
      runId,
      attemptId: runId,
      cwd: project.path,
      prompt,
      skillInputs: [contextScope.providerSkillInput],
      sandboxPolicy: "read-only",
      paths: {
        events: paths.providerEvents,
        stderr: paths.stderr,
        lastMessage: paths.lastMessage,
        session: paths.providerSession,
      },
      runtimeWorkspaceRoots: [...new Set([
        contextScope.projectRoot,
        contextScope.evidenceRoot,
        ...(worktreeDiff ? [worktreeDiff.worktree.checkoutPath] : []),
      ])],
      writableRoots: [],
      model: capabilitySnapshot.effectiveModel ? { providerId, modelId: capabilitySnapshot.effectiveModel } : null,
      outputSchema: proposalOutputJsonSchema,
    });
  } catch (error) {
    providerResult = failedProviderTurn(providerId, error);
  }
  await appendRunEvent(paths.events, {
    timestamp: new Date().toISOString(),
    type: "provider.exited",
    runId,
    data: { providerId, status: providerResult.status, sessionId: providerResult.session?.sessionId, turnId: providerResult.turnId, error: providerResult.error },
  });

  const lastMessage = await ensureProviderMessage(paths.lastMessage, providerResult);
  await writeFile(paths.stdout, providerResult.lastMessage, "utf8");
  if (providerResult.status !== "completed") {
    throw new Error(providerResult.error ?? `Spec-test proposer Provider turn ${providerResult.status}.`);
  }
  const parsed = parseSpecTestProposalMessage(lastMessage);
  if (parsed.status === "failed") {
    throw new Error(parsed.warnings[0] ?? "Spec-test proposal output failed schema validation.");
  }
  await finishProviderAttempt(
    contextScope.runtime,
    runId,
    "completed",
    providerResult.session?.sessionId ?? null,
    {
      parentAgentSurfaceId: mainThread.roleId,
    },
  );
  const proposal = await writeProposal(paths.proposal, paths.proposalMarkdown, {
    runId,
    changeId,
    status: parsed.status,
    message: lastMessage,
    output: parsed,
    worktreeId: options.worktreeId,
    artifacts,
    startedAt: now,
  });
  const status: RunStatus = "completed";
  run = await finishRun(paths.run, run, status, status === "completed" ? 0 : 1, null);
  await appendRunEvent(paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: proposal.status === "failed" ? "spec-test.proposal.failed" : "spec-test.proposal.completed", runId, data: { proposalStatus: proposal.status } });
  await appendRunEvent(paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: status === "completed" ? "run.completed" : "run.failed", runId });
  return { run, proposal };
  } catch (error) {
    try {
      if (providerAttemptStarted) {
        await rollbackProviderAttempt(contextScope.runtime, runId, "spec-test-proposer");
      }
      await rm(directory, { recursive: true, force: true });
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "Spec-Test proposer cleanup failed; Run and ProviderAttempt evidence were retained for recovery.",
      );
    }
    throw error;
  }
}

export async function listSpecTestProposalSummaries(project: ManagedProject): Promise<SpecTestProposalSummary[]> {
  const context = await getActiveSpecTestContext(project);
  const proposals = (await listSpecTestProposals(context.runtime))
    .filter((proposal) => proposal.changeId === context.changeId);
  return proposals.map(summarizeProposal);
}

export async function showSpecTestProposal(project: ManagedProject, proposalId: string): Promise<SpecTestProposal> {
  const context = await getActiveSpecTestContext(project);
  const proposal = await readSpecTestProposal(context.runtime, proposalId);
  if (proposal.changeId !== context.changeId) throw new Error("Spec-Test proposal scope is stale.");
  return proposal;
}

export async function acceptSpecTestProposal(project: ManagedProject, proposalId: string, options: SpecTestProposalAcceptOptions): Promise<SpecTestProposalAcceptResult> {
  if (!options.allExisting && (!options.ac || !options.ref)) {
    throw new Error("Use --all-existing or provide both --ac and --ref.");
  }
  if (options.allExisting && (options.ac || options.ref)) {
    throw new Error("Use either --all-existing or --ac/--ref, not both.");
  }
  const activeContext = await getActiveSpecTestContext(project);
  const proposal = await readSpecTestProposal(activeContext.runtime, proposalId);
  if (proposal.changeId !== activeContext.changeId) throw new Error("Spec-Test proposal scope is stale.");
  const proposalManifestHash = specTestProposalManifestHash(proposal);
  if (options.scope) {
    const currentFingerprint = await getSpecTestEvidenceFingerprint(project, proposal.changeId);
    if (options.scope.projectId !== activeContext.projectId
      || options.scope.changeId !== proposal.changeId
      || options.scope.conversationId !== activeContext.conversationId
      || options.scope.graphScopeId !== activeContext.graphScopeId
      || options.scope.workflowGraphPlanId !== activeContext.planning.graph.id
      || options.scope.acceptedProposalHash !== activeContext.planning.mainAcceptance.proposalHash
      || options.scope.authorizationId !== activeContext.planning.authorizationIntent.authorizationId
      || options.scope.evidenceDigest !== currentFingerprint
      || options.scope.targetManifestHash !== proposalManifestHash) {
      throw new Error("Spec-Test proposal approval scope is stale.");
    }
  }
  const accepted: SpecTestProposalEvidence[] = [];
  const skipped: Array<{ refId: string; reason: string }> = [];
  const candidates = options.allExisting
    ? proposal.evidence
    : proposal.evidence.filter((item) => item.acId.toUpperCase() === options.ac?.toUpperCase() && item.refId === options.ref);

  if (!options.allExisting && candidates.length === 0) {
    throw new Error(`Proposal evidence not found for AC ${options.ac} and ref ${options.ref}.`);
  }

  const acceptedCandidates: SpecTestProposalEvidence[] = [];
  for (const candidate of candidates) {
    const reason = getAcceptRejectReason(candidate, activeContext.projectRoot);
    if (reason) {
      if (!options.allExisting) {
        throw new Error(reason);
      }
      skipped.push({ refId: candidate.refId, reason });
      continue;
    }
    acceptedCandidates.push(candidate);
  }
  const publication = acceptedCandidates.length > 0 && options.scope
    ? createSpecTestAcceptancePublication({
      runtime: activeContext.runtime,
      proposal,
      accepted: acceptedCandidates,
      skipped,
      scope: options.scope,
    })
    : null;
  const status = acceptedCandidates.length > 0
    ? await linkSpecTestEvidenceBatch(
      project,
      proposal.changeId,
      acceptedCandidates,
      options.scope?.evidenceDigest,
      publication?.hooks,
    )
    : await getSpecTestStatus(project, { changeId: proposal.changeId });
  accepted.push(...acceptedCandidates);
  return { proposal, accepted, skipped, status, acceptanceTransactionId: publication?.transactionId ?? null };
}

export function parseSpecTestProposalMessage(message: string): { status: SpecTestProposalStatus; evidence: SpecTestProposalEvidence[]; warnings: string[] } {
  const jsonText = extractProposalJson(message);
  if (!jsonText) {
    return { status: "failed", evidence: [], warnings: ["Spec-test proposal output did not include parseable JSON."] };
  }
  try {
    const parsed = modelOutputSchema.parse(JSON.parse(jsonText));
    return {
      status: parsed.status,
      evidence: parsed.evidence.map((item, index) => ({
        refId: item.refId?.trim() || `ev-${String(index + 1).padStart(3, "0")}`,
        acId: item.acId.trim().toUpperCase(),
        source: item.source,
        kind: item.kind,
        refs: item.refs,
        rationale: item.rationale,
      })),
      warnings: parsed.warnings,
    };
  } catch (error) {
    return { status: "failed", evidence: [], warnings: [`Spec-test proposal JSON was invalid: ${(error as Error).message}`] };
  }
}

async function listSpecTestProposals(runtime: ProjectRunsPathPort): Promise<SpecTestProposal[]> {
  if (!existsSync(runtime.runsRoot)) return [];
  const entries = await readdir(runtime.runsRoot, { withFileTypes: true });
  const proposals: SpecTestProposal[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const path = join(runtime.runsRoot, entry.name, "spec-test-proposal.json");
    if (!existsSync(path)) continue;
    proposals.push(await readSpecTestProposal(runtime, entry.name));
  }
  return proposals.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

async function readSpecTestProposal(runtime: ProjectRunsPathPort, proposalId: string): Promise<SpecTestProposal> {
  return await readRequiredJsonFile(join(runtime.runsRoot, proposalId, "spec-test-proposal.json"), proposalSchema) as SpecTestProposal;
}

export function specTestProposalManifestHash(proposal: SpecTestProposal): string {
  return createHash("sha256").update(stableJson(proposal), "utf8").digest("hex");
}

async function composeSpecTestProposalPrompt(input: {
  context: string;
  specTestStatus: string;
  latestValidation: string;
  sourceTests: string;
  worktreeId?: string;
  worktreeDiffStat?: string;
  worktreeDiff?: string;
  extraPrompt?: string;
}): Promise<string> {
  const profile = await readBundledProposerProfile();
  return [
    "# AHO Spec-Test Evidence Proposal Run",
    "",
    "You are running as a read-only Spec-Test Proposer for Agent Harness Orchestrator.",
    "",
    profile.trim(),
    "",
    "## Output Contract",
    "",
    "Your final answer must be a JSON object matching the provider structured-output schema.",
    "The JSON shape is:",
    "",
    "```json",
    "{",
    "  \"status\": \"proposed | blocked | failed\",",
    "  \"evidence\": [",
    "    {",
    "      \"refId\": \"ev-001\",",
    "      \"acId\": \"AC-001\",",
    "      \"source\": \"source-root | worktree-only | suggested | unknown\",",
    "      \"kind\": \"existingEvidence | alreadyLinked | missingEvidence | suggestedNewTests | openQuestions\",",
    "      \"refs\": [",
    "        { \"type\": \"file\", \"path\": \"test/example.test.js\" },",
    "        { \"type\": \"testName\", \"path\": \"test/example.test.js\", \"name\": \"descriptive test name\" },",
    "        { \"type\": \"command\", \"commandName\": \"test\" }",
    "      ],",
    "      \"rationale\": \"Why this candidate relates to the AC.\"",
    "    }",
    "  ],",
    "  \"warnings\": []",
    "}",
    "```",
    "",
    "Use source-root only for files that already exist in the source project root.",
    "Use worktree-only for files that only appear in the optional worktree context.",
    "Use suggestedNewTests for tests that should be written later; these are not acceptable evidence in Phase 4B.",
    "Do not edit files. Do not claim proof or full coverage.",
    "",
    "## Run Context Projection",
    "",
    input.context.trim(),
    "",
    "## Current Spec-Test Status",
    "",
    input.specTestStatus.trim(),
    "",
    "## Latest Validation",
    "",
    input.latestValidation.trim(),
    "",
    "## Source-Root Test Files",
    "",
    input.sourceTests.trim() || "No source-root test files discovered by AHO.",
    "",
    input.worktreeId ? "## Worktree Context" : "",
    input.worktreeId ? `Worktree ID: ${input.worktreeId}` : "",
    input.worktreeDiffStat?.trim() ? "### Worktree Diff Stat" : "",
    input.worktreeDiffStat?.trim() ?? "",
    input.worktreeDiff?.trim() ? "### Worktree Diff" : "",
    input.worktreeDiff?.trim() ?? "",
    input.extraPrompt?.trim() ? "## Additional Human Prompt" : "",
    input.extraPrompt?.trim() ?? "",
    "",
  ].join("\n");
}

async function readBundledProposerProfile(): Promise<string> {
  return await readFile(join(getAgentProfilesRoot(), "spec-test-proposer.md"), "utf8");
}

async function collectTestFileSummary(root: string): Promise<string> {
  const files = await collectTestFiles(root);
  const lines: string[] = [];
  for (const file of files.slice(0, 40)) {
    const path = join(root, file);
    let snippet = "";
    try {
      snippet = (await readFile(path, "utf8")).split(/\r?\n/).slice(0, 80).join("\n");
    } catch {
      snippet = "(unreadable)";
    }
    lines.push(`### ${file}`, "", "```", snippet.slice(0, 4000), "```", "");
  }
  if (files.length > 40) lines.push(`Additional test-like files omitted: ${files.length - 40}`);
  return lines.join("\n");
}

async function collectTestFiles(root: string): Promise<string[]> {
  const result: string[] = [];
  const queue = [root];
  const excluded = new Set([".git", "node_modules", ".agent-harness", "dist", "coverage", ".tmp"]);
  while (queue.length > 0 && result.length < 120) {
    const current = queue.shift()!;
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!excluded.has(entry.name)) queue.push(join(current, entry.name));
        continue;
      }
      if (!entry.isFile()) continue;
      const absolute = join(current, entry.name);
      const rel = relative(root, absolute).replace(/\\/g, "/");
      if (isTestLikePath(rel)) result.push(rel);
    }
  }
  return result.sort((a, b) => a.localeCompare(b));
}

function isTestLikePath(path: string): boolean {
  return /(^|\/)(__tests__|tests?|specs?)(\/|$)/i.test(path) ||
    /\.(test|spec)\.[cm]?[jt]sx?$/i.test(path) ||
    /_test\.(go|py)$/i.test(path) ||
    /^test_.*\.py$/i.test(path.split("/").at(-1) ?? "");
}

async function writeProposal(
  proposalPath: string,
  markdownPath: string,
  input: {
    runId: string;
    changeId: string;
    status: SpecTestProposalStatus;
    message: string;
    output: { status: SpecTestProposalStatus; evidence: SpecTestProposalEvidence[]; warnings: string[] };
    worktreeId?: string;
    artifacts: RunMetadata["artifacts"];
    startedAt: string;
  },
): Promise<SpecTestProposal> {
  const proposal: SpecTestProposal = {
    version: "1.0",
    id: input.runId,
    runId: input.runId,
    changeId: input.changeId,
    status: input.status === "failed" ? "failed" : input.output.status,
    worktreeId: input.worktreeId,
    startedAt: input.startedAt,
    finishedAt: new Date().toISOString(),
    evidence: input.output.evidence,
    artifacts: {
      proposal: input.artifacts.specTestProposal ?? "",
      proposalMarkdown: input.artifacts.specTestProposalMarkdown ?? "",
      lastMessage: input.artifacts.lastMessage ?? "",
    },
    warnings: input.output.warnings,
  };
  await writeJsonFile(proposalPath, proposal);
  await writeFile(markdownPath, renderProposalMarkdown(proposal, input.message), "utf8");
  return proposal;
}

function renderProposalMarkdown(proposal: SpecTestProposal, message: string): string {
  return [
    `# Spec-Test Proposal: ${proposal.id}`,
    "",
    `- Status: ${proposal.status}`,
    `- Change: ${proposal.changeId}`,
    proposal.worktreeId ? `- Worktree: ${proposal.worktreeId}` : "- Worktree: none",
    `- Evidence items: ${proposal.evidence.length}`,
    "",
    "## Parsed Evidence",
    "",
    ...proposal.evidence.map((item) => [
      `### ${item.refId}: ${item.acId}`,
      "",
      `- Kind: ${item.kind}`,
      `- Source: ${item.source}`,
      `- Rationale: ${item.rationale}`,
      `- Refs: ${item.refs.length}`,
      "",
    ].join("\n")),
    proposal.warnings.length ? "## Warnings" : "",
    ...proposal.warnings.map((warning) => `- ${warning}`),
    "",
    "## Provider Final Message",
    "",
    message.trim() || "(empty)",
    "",
  ].join("\n");
}

function extractProposalJson(message: string): string | null {
  const fenced = /```json\s*([\s\S]*?)```/i.exec(message);
  if (fenced) return fenced[1].trim();
  const begin = message.indexOf("{");
  const end = message.lastIndexOf("}");
  if (begin >= 0 && end > begin) return message.slice(begin, end + 1);
  return null;
}

function getAcceptRejectReason(candidate: SpecTestProposalEvidence, projectRoot: string): string | null {
  if (candidate.kind !== "existingEvidence") return `Cannot accept ${candidate.kind}; only existingEvidence can be accepted.`;
  if (candidate.source !== "source-root") return `Cannot accept ${candidate.source} evidence in Phase 4B.`;
  if (candidate.refs.length === 0) return "Candidate has no refs.";
  for (const ref of candidate.refs) {
    if ((ref.type === "file" || ref.type === "testName") && !existsSync(join(projectRoot, ref.path))) {
      return `Source-root evidence file does not exist: ${ref.path}.`;
    }
  }
  return null;
}

function summarizeProposal(proposal: SpecTestProposal): SpecTestProposalSummary {
  const existing = proposal.evidence.filter((item) => item.kind === "existingEvidence");
  return {
    id: proposal.id,
    runId: proposal.runId,
    changeId: proposal.changeId,
    status: proposal.status,
    worktreeId: proposal.worktreeId,
    startedAt: proposal.startedAt,
    finishedAt: proposal.finishedAt,
    evidenceCount: proposal.evidence.length,
    existingEvidenceCount: existing.length,
    acceptedSourceRootCount: existing.filter((item) => item.source === "source-root").length,
  };
}

async function ensureProviderMessage(path: string, result: ProviderTurnResult): Promise<string> {
  if (result.lastMessage.trim()) {
    if (!existsSync(path)) await writeFile(path, result.lastMessage, "utf8");
    return result.lastMessage;
  }
  const message = [
    "Status: failed",
    "",
    `The provider turn ended with status ${result.status} without a final proposal message.${result.error ? ` ${result.error}` : ""}`,
    "",
    "```json",
    JSON.stringify({ status: "failed", evidence: [], warnings: ["Provider final message was not captured."] }, null, 2),
    "```",
    "",
  ].join("\n");
  await writeFile(path, message, "utf8");
  return message;
}

function failedProviderTurn(providerId: string, error: unknown): ProviderTurnResult {
  return {
    providerId,
    status: "failed",
    session: null,
    turnId: null,
    lastMessage: "",
    childThreads: [],
    changedFiles: [],
    error: error instanceof Error ? error.message : String(error),
  };
}

async function finishRun(path: string, run: RunMetadata, status: RunStatus, exitCode: number | null, signal: NodeJS.Signals | null): Promise<RunMetadata> {
  const finished = { ...run, status, exitCode, signal, finishedAt: new Date().toISOString() };
  await writeJsonFile(path, finished);
  return finished;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

