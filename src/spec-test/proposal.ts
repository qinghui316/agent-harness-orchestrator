import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { z } from "zod";
import { collectWorktreeDiff } from "../audit/diff.js";
import { buildCodexReadonlyArgv, detectCodexCapabilities } from "../codex/capabilities.js";
import { extractFinalMessageFromCodexJsonl } from "../codex/jsonl.js";
import { readRequiredJsonFile, writeJsonFile } from "../fs/json.js";
import { assertWritableMemory, resolveProjectMemory } from "../memory/resolver.js";
import { appendRunEvent, assertRunnableChange, buildContextProjection, buildRunId } from "../run/manager.js";
import { executeProcessStreaming } from "../run/process.js";
import { getTemplateRoot } from "../template-source/paths.js";
import { getLatestValidationSummary } from "../validation/artifacts.js";
import { getChangeStatus } from "../change/manager.js";
import { getSpecTestStatus, linkSpecTestRefs } from "./manager.js";
import type {
  ManagedProject,
  ResolvedMemory,
  RunMetadata,
  RunStatus,
  SpecTestProposal,
  SpecTestProposalEvidence,
  SpecTestProposalStatus,
  SpecTestProposalSummary,
} from "../types/index.js";

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

export interface SpecTestProposeOptions {
  worktreeId?: string;
  prompt?: string;
}

export interface SpecTestProposalRunResult {
  run: RunMetadata;
  proposal: SpecTestProposal;
}

export interface SpecTestProposalAcceptOptions {
  ac?: string;
  ref?: string;
  allExisting?: boolean;
}

export interface SpecTestProposalAcceptResult {
  proposal: SpecTestProposal;
  accepted: SpecTestProposalEvidence[];
  skipped: Array<{ refId: string; reason: string }>;
  status: Awaited<ReturnType<typeof getSpecTestStatus>>;
}

export async function startSpecTestProposalRun(project: ManagedProject, options: SpecTestProposeOptions = {}): Promise<SpecTestProposalRunResult> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Spec-test proposal run");
  const changeStatus = await getChangeStatus(project);
  assertRunnableChange(changeStatus);
  const changeId = changeStatus.change?.id ?? changeStatus.activeChanges[0]?.name;
  if (!changeId) throw new Error("Cannot start spec-test proposal without an active change id.");

  const runId = buildRunId(changeId, ["spec-test-proposer", options.worktreeId ?? "source-root", options.prompt ?? ""]);
  const directory = join(memory.runsRoot, runId);
  const relativeDir = displayArtifactPath(memory, directory);
  const artifacts = {
    base: memory.artifactBase,
    directory: relativeDir,
    context: `${relativeDir}/context.md`,
    events: `${relativeDir}/events.jsonl`,
    stdout: `${relativeDir}/stdout.log`,
    stderr: `${relativeDir}/stderr.log`,
    prompt: `${relativeDir}/prompt.md`,
    codexEvents: `${relativeDir}/codex-events.jsonl`,
    lastMessage: `${relativeDir}/last-message.md`,
    specTestProposal: `${relativeDir}/spec-test-proposal.json`,
    specTestProposalMarkdown: `${relativeDir}/spec-test-proposal.md`,
  };
  const paths = {
    run: join(directory, "run.json"),
    context: join(directory, "context.md"),
    events: join(directory, "events.jsonl"),
    stdout: join(directory, "stdout.log"),
    stderr: join(directory, "stderr.log"),
    prompt: join(directory, "prompt.md"),
    codexEvents: join(directory, "codex-events.jsonl"),
    lastMessage: join(directory, "last-message.md"),
    proposal: join(directory, "spec-test-proposal.json"),
    proposalMarkdown: join(directory, "spec-test-proposal.md"),
  };

  await mkdir(directory, { recursive: true });
  const now = new Date().toISOString();
  let run: RunMetadata = {
    version: "1.0",
    id: runId,
    changeId,
    projectPath: project.path,
    runtime: "spec-test-proposer",
    executionMode: "direct",
    proposalOnly: true,
    command: ["codex"],
    status: "created",
    exitCode: null,
    signal: null,
    startedAt: now,
    finishedAt: null,
    artifacts,
  };
  await writeJsonFile(paths.run, run);
  await appendRunEvent(paths.events, { timestamp: now, type: "run.created", runId, data: { changeId, runtime: "spec-test-proposer", worktreeId: options.worktreeId } });

  const context = buildContextProjection(changeStatus);
  await writeFile(paths.context, context, "utf8");
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "context.prepared", runId, data: { path: artifacts.context } });

  const specTestStatus = await getSpecTestStatus(project, options.worktreeId ? { worktreeId: options.worktreeId } : {});
  const latestValidation = await getLatestValidationSummary(memory, changeId, options.worktreeId ? { worktreeId: options.worktreeId } : {});
  const worktreeDiff = options.worktreeId ? await collectWorktreeDiff(memory, options.worktreeId, changeId) : null;
  const prompt = await composeSpecTestProposalPrompt({
    memory,
    context,
    specTestStatus: JSON.stringify(specTestStatus, null, 2),
    latestValidation: latestValidation ? JSON.stringify(latestValidation, null, 2) : "No validation run recorded for this change.",
    sourceTests: await collectTestFileSummary(memory.projectRoot),
    worktreeId: options.worktreeId,
    worktreeDiffStat: worktreeDiff?.diffStat,
    worktreeDiff: worktreeDiff?.diff,
    extraPrompt: options.prompt,
  });
  await writeFile(paths.prompt, prompt, "utf8");

  const capabilities = await detectCodexCapabilities();
  if (capabilities.errors.length > 0) {
    await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "codex.capabilities.failed", runId, data: { capabilities } });
    const message = renderUnavailableProposalMessage(capabilities.errors);
    await writeFile(paths.lastMessage, message, "utf8");
    await writeFile(paths.stdout, "", "utf8");
    await writeFile(paths.codexEvents, "", "utf8");
    await writeFile(paths.stderr, `${capabilities.errors.join("\n")}\n`, "utf8");
    const proposal = await writeProposal(paths.proposal, paths.proposalMarkdown, {
      runId,
      changeId,
      status: "failed",
      message,
      output: { status: "failed", evidence: [], warnings: capabilities.errors },
      worktreeId: options.worktreeId,
      artifacts,
      startedAt: now,
    });
    run = await finishRun(paths.run, run, "failed", 1, null);
    await appendRunEvent(paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: "spec-test.proposal.failed", runId, data: { proposalStatus: proposal.status } });
    await appendRunEvent(paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: "run.failed", runId });
    return { run, proposal };
  }

  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "codex.capabilities.detected", runId, data: { capabilities } });
  const additionalReadDirs = [
    ...(memory.mode === "external-local" ? [memory.memoryRoot] : []),
    ...(options.worktreeId && capabilities.supportsAddDir && worktreeDiff ? [worktreeDiff.worktree.checkoutPath] : []),
  ];
  const argv = buildCodexReadonlyArgv(capabilities, {
    projectPath: project.path,
    lastMessagePath: paths.lastMessage,
    additionalReadDirs,
  });
  run = { ...run, command: [argv.command, ...argv.args], status: "running" };
  await writeJsonFile(paths.run, run);
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "spec-test.proposal.started", runId, data: { cwd: project.path, command: run.command } });
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "codex.started", runId, data: { cwd: project.path, command: run.command } });

  const processResult = await executeProcessStreaming({
    cwd: project.path,
    command: argv.command,
    args: argv.args,
    stdin: prompt,
    stdoutPath: paths.stdout,
    stderrPath: paths.stderr,
    mirrorStdoutPath: paths.codexEvents,
  });
  await appendRunEvent(paths.events, {
    timestamp: new Date().toISOString(),
    type: "codex.exited",
    runId,
    data: { exitCode: processResult.exitCode, signal: processResult.signal },
  });

  const lastMessage = await ensureLastMessage(paths.lastMessage, processResult.stdoutSample, processResult.stderrSample);
  const parsed = parseSpecTestProposalMessage(lastMessage);
  const proposal = await writeProposal(paths.proposal, paths.proposalMarkdown, {
    runId,
    changeId,
    status: processResult.exitCode === 0 ? parsed.status : "failed",
    message: lastMessage,
    output: parsed,
    worktreeId: options.worktreeId,
    artifacts,
    startedAt: now,
  });
  const status: RunStatus = processResult.exitCode === 0 && proposal.status !== "failed" ? "completed" : "failed";
  run = await finishRun(paths.run, run, status, processResult.exitCode, processResult.signal);
  await appendRunEvent(paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: proposal.status === "failed" ? "spec-test.proposal.failed" : "spec-test.proposal.completed", runId, data: { proposalStatus: proposal.status } });
  await appendRunEvent(paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: status === "completed" ? "run.completed" : "run.failed", runId });
  return { run, proposal };
}

export async function listSpecTestProposalSummaries(project: ManagedProject): Promise<SpecTestProposalSummary[]> {
  const memory = await resolveProjectMemory(project);
  const proposals = await listSpecTestProposals(memory);
  return proposals.map(summarizeProposal);
}

export async function showSpecTestProposal(project: ManagedProject, proposalId: string): Promise<SpecTestProposal> {
  const memory = await resolveProjectMemory(project);
  return readSpecTestProposal(memory, proposalId);
}

export async function acceptSpecTestProposal(project: ManagedProject, proposalId: string, options: SpecTestProposalAcceptOptions): Promise<SpecTestProposalAcceptResult> {
  if (!options.allExisting && (!options.ac || !options.ref)) {
    throw new Error("Use --all-existing or provide both --ac and --ref.");
  }
  if (options.allExisting && (options.ac || options.ref)) {
    throw new Error("Use either --all-existing or --ac/--ref, not both.");
  }
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Spec-test proposal accept");
  const proposal = await readSpecTestProposal(memory, proposalId);
  const accepted: SpecTestProposalEvidence[] = [];
  const skipped: Array<{ refId: string; reason: string }> = [];
  const candidates = options.allExisting
    ? proposal.evidence
    : proposal.evidence.filter((item) => item.acId.toUpperCase() === options.ac?.toUpperCase() && item.refId === options.ref);

  if (!options.allExisting && candidates.length === 0) {
    throw new Error(`Proposal evidence not found for AC ${options.ac} and ref ${options.ref}.`);
  }

  let status = await getSpecTestStatus(project);
  for (const candidate of candidates) {
    const reason = getAcceptRejectReason(candidate, memory);
    if (reason) {
      if (!options.allExisting) {
        throw new Error(reason);
      }
      skipped.push({ refId: candidate.refId, reason });
      continue;
    }
    status = await linkSpecTestRefs(project, candidate.acId, candidate.refs);
    accepted.push(candidate);
  }

  return { proposal, accepted, skipped, status };
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

async function listSpecTestProposals(memory: ResolvedMemory): Promise<SpecTestProposal[]> {
  if (!existsSync(memory.runsRoot)) return [];
  const entries = await readdir(memory.runsRoot, { withFileTypes: true });
  const proposals: SpecTestProposal[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const path = join(memory.runsRoot, entry.name, "spec-test-proposal.json");
    if (!existsSync(path)) continue;
    proposals.push(await readSpecTestProposal(memory, entry.name));
  }
  return proposals.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

async function readSpecTestProposal(memory: ResolvedMemory, proposalId: string): Promise<SpecTestProposal> {
  return await readRequiredJsonFile(join(memory.runsRoot, proposalId, "spec-test-proposal.json"), proposalSchema) as SpecTestProposal;
}

async function composeSpecTestProposalPrompt(input: {
  memory: ResolvedMemory;
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
    "Your final answer must include a JSON object in a fenced ```json block.",
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
  return await readFile(join(getTemplateRoot(), "..", "agent-profiles", "spec-test-proposer.md"), "utf8");
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
    "## Codex Final Message",
    "",
    message.trim() || "(empty)",
    "",
  ].join("\n");
}

function parseStatusLine(message: string): SpecTestProposalStatus | null {
  const match = /^Status:\s*(proposed|blocked|failed)\s*$/im.exec(message);
  return match ? match[1] as SpecTestProposalStatus : null;
}

function extractProposalJson(message: string): string | null {
  const fenced = /```json\s*([\s\S]*?)```/i.exec(message);
  if (fenced) return fenced[1].trim();
  const begin = message.indexOf("{");
  const end = message.lastIndexOf("}");
  if (begin >= 0 && end > begin) return message.slice(begin, end + 1);
  const status = parseStatusLine(message);
  if (status) return JSON.stringify({ status, evidence: [], warnings: ["No JSON payload found; parsed status line only."] });
  return null;
}

function getAcceptRejectReason(candidate: SpecTestProposalEvidence, memory: ResolvedMemory): string | null {
  if (candidate.kind !== "existingEvidence") return `Cannot accept ${candidate.kind}; only existingEvidence can be accepted.`;
  if (candidate.source !== "source-root") return `Cannot accept ${candidate.source} evidence in Phase 4B.`;
  if (candidate.refs.length === 0) return "Candidate has no refs.";
  for (const ref of candidate.refs) {
    if ((ref.type === "file" || ref.type === "testName") && !existsSync(join(memory.projectRoot, ref.path))) {
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

function renderUnavailableProposalMessage(errors: string[]): string {
  return [
    "Status: failed",
    "",
    "# Spec-Test Proposal Unavailable",
    "",
    "AHO could not safely start Codex in read-only non-interactive mode.",
    "",
    ...errors.map((error) => `- ${error}`),
    "",
    "```json",
    JSON.stringify({ status: "failed", evidence: [], warnings: errors }, null, 2),
    "```",
    "",
  ].join("\n");
}

async function ensureLastMessage(path: string, stdout: string, stderr: string): Promise<string> {
  if (existsSync(path)) {
    const existing = await readFile(path, "utf8");
    if (existing.trim()) return existing;
  }
  const parsed = extractFinalMessageFromCodexJsonl(stdout);
  const message = parsed ?? [
    "Status: failed",
    "",
    "AHO did not find a final Codex message in output-last-message or JSONL stdout.",
    "",
    stderr.trim() ? "## stderr sample" : "",
    stderr.trim(),
    "",
    "```json",
    JSON.stringify({ status: "failed", evidence: [], warnings: ["Codex final message was not captured."] }, null, 2),
    "```",
    "",
  ].join("\n");
  await writeFile(path, message, "utf8");
  return message;
}

function displayArtifactPath(memory: ResolvedMemory, absolutePath: string): string {
  const base = memory.artifactBase === "memory-root" ? memory.memoryRoot : memory.projectRoot;
  return relative(base, absolutePath).replace(/\\/g, "/");
}

async function finishRun(path: string, run: RunMetadata, status: RunStatus, exitCode: number | null, signal: NodeJS.Signals | null): Promise<RunMetadata> {
  const finished = { ...run, status, exitCode, signal, finishedAt: new Date().toISOString() };
  await writeJsonFile(path, finished);
  return finished;
}
