import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { z } from "zod";
import { buildCodexReadonlyArgv, detectCodexCapabilities } from "../codex/capabilities.js";
import { extractFinalMessageFromCodexJsonl } from "../codex/jsonl.js";
import { buildAcMap, parseAcceptanceCriteria, parseTasks } from "../ecl/anchors.js";
import { getActiveChanges } from "../ecl/index.js";
import { atomicWriteFile, readRequiredJsonFile, writeJsonFile } from "../fs/json.js";
import { assertWritableMemory, resolveProjectMemory } from "../memory/resolver.js";
import { appendRunEvent, assertRunnableChange, buildContextProjection, buildRunId } from "../run/manager.js";
import { executeProcessStreaming } from "../run/process.js";
import { getTemplateRoot } from "../template-source/paths.js";
import { getChangeStatus } from "./manager.js";
import type {
  ChangeProposalStatus,
  ChangeProposalSummary,
  ChangeProposalTargetHashes,
  ChangeStatus,
  ManagedProject,
  PlanProposal,
  ResolvedMemory,
  RunArtifactPaths,
  RunMetadata,
  RunRuntime,
  RunStatus,
  SpecProposal,
} from "../types/index.js";

const specProposalSchema = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  runId: z.string(),
  changeId: z.string(),
  status: z.enum(["proposed", "blocked", "failed"]),
  startedAt: z.string(),
  finishedAt: z.string(),
  targetHashes: z.object({ spec: z.string().optional(), plan: z.string().optional(), tasks: z.string().optional() }),
  specMd: z.string(),
  openQuestions: z.array(z.string()),
  assumptions: z.array(z.string()),
  warnings: z.array(z.string()),
  artifacts: z.object({
    proposal: z.string(),
    proposalMarkdown: z.string(),
    lastMessage: z.string(),
  }),
});

const planProposalSchema = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  runId: z.string(),
  changeId: z.string(),
  status: z.enum(["proposed", "blocked", "failed"]),
  startedAt: z.string(),
  finishedAt: z.string(),
  targetHashes: z.object({ spec: z.string().optional(), plan: z.string().optional(), tasks: z.string().optional() }),
  planMd: z.string(),
  tasksMd: z.string(),
  openQuestions: z.array(z.string()),
  assumptions: z.array(z.string()),
  warnings: z.array(z.string()),
  artifacts: z.object({
    proposal: z.string(),
    proposalMarkdown: z.string(),
    lastMessage: z.string(),
  }),
});

const specModelOutputSchema = z.object({
  status: z.enum(["proposed", "blocked", "failed"]),
  specMd: z.string().default(""),
  openQuestions: z.array(z.string()).default([]),
  assumptions: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
});

const planModelOutputSchema = z.object({
  status: z.enum(["proposed", "blocked", "failed"]),
  planMd: z.string().default(""),
  tasksMd: z.string().default(""),
  openQuestions: z.array(z.string()).default([]),
  assumptions: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
});

type ProposalKind = "spec" | "plan";

interface ProposalRunPaths {
  directory: string;
  run: string;
  context: string;
  prompt: string;
  events: string;
  stdout: string;
  stderr: string;
  codexEvents: string;
  lastMessage: string;
  proposal: string;
  proposalMarkdown: string;
}

interface CommonProposalRun {
  memory: ResolvedMemory;
  changeStatus: ChangeStatus;
  changeId: string;
  runId: string;
  paths: ProposalRunPaths;
  artifacts: RunArtifactPaths;
  context: string;
  targetHashes: ChangeProposalTargetHashes;
  startedAt: string;
}

export interface ChangeProposalRunOptions {
  prompt?: string;
}

export interface SpecProposalRunResult {
  run: RunMetadata;
  proposal: SpecProposal;
}

export interface PlanProposalRunResult {
  run: RunMetadata;
  proposal: PlanProposal;
}

export interface SpecProposalAcceptResult {
  proposal: SpecProposal;
  changeStatus: ChangeStatus;
  specPath: string;
}

export interface PlanProposalAcceptResult {
  proposal: PlanProposal;
  changeStatus: ChangeStatus;
  planPath: string;
  tasksPath: string;
}

export async function startSpecProposalRun(project: ManagedProject, options: ChangeProposalRunOptions = {}): Promise<SpecProposalRunResult> {
  const prepared = await prepareProposalRun(project, "spec", options.prompt);
  const prompt = await composeSpecPrompt(prepared, options.prompt);
  await writeFile(prepared.paths.prompt, prompt, "utf8");
  const runResult = await executeCodexProposal(project, prepared, "spec-agent", "change.spec.proposal", prompt);
  const lastMessage = await ensureLastMessage(prepared.paths.lastMessage, runResult.stdoutSample, runResult.stderrSample);
  const parsed = parseSpecProposalMessage(lastMessage);
  const proposal = await writeSpecProposal(prepared.paths.proposal, prepared.paths.proposalMarkdown, {
    runId: prepared.runId,
    changeId: prepared.changeId,
    startedAt: prepared.startedAt,
    status: runResult.exitCode === 0 ? parsed.status : "failed",
    output: parsed,
    message: lastMessage,
    targetHashes: prepared.targetHashes,
    artifacts: prepared.artifacts,
  });
  const status: RunStatus = runResult.exitCode === 0 && proposal.status !== "failed" ? "completed" : "failed";
  const run = await finishRun(prepared.paths.run, runResult.run, status, runResult.exitCode, runResult.signal);
  await appendRunEvent(prepared.paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: proposal.status === "failed" ? "change.spec.proposal.failed" : "change.spec.proposal.completed", runId: prepared.runId, data: { proposalStatus: proposal.status } });
  await appendRunEvent(prepared.paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: status === "completed" ? "run.completed" : "run.failed", runId: prepared.runId });
  return { run, proposal };
}

export async function startPlanProposalRun(project: ManagedProject, options: ChangeProposalRunOptions = {}): Promise<PlanProposalRunResult> {
  const prepared = await prepareProposalRun(project, "plan", options.prompt);
  const active = await readActiveChangeFiles(prepared.memory);
  if (parseAcceptanceCriteria(active.spec).criteria.length === 0) {
    throw new Error("Cannot propose plan/tasks: spec.md must contain at least one Acceptance Criterion ID such as AC-001.");
  }
  const prompt = await composePlanPrompt(prepared, options.prompt);
  await writeFile(prepared.paths.prompt, prompt, "utf8");
  const runResult = await executeCodexProposal(project, prepared, "planner", "change.plan.proposal", prompt);
  const lastMessage = await ensureLastMessage(prepared.paths.lastMessage, runResult.stdoutSample, runResult.stderrSample);
  const parsed = parsePlanProposalMessage(lastMessage);
  const proposal = await writePlanProposal(prepared.paths.proposal, prepared.paths.proposalMarkdown, {
    runId: prepared.runId,
    changeId: prepared.changeId,
    startedAt: prepared.startedAt,
    status: runResult.exitCode === 0 ? parsed.status : "failed",
    output: parsed,
    message: lastMessage,
    targetHashes: prepared.targetHashes,
    artifacts: prepared.artifacts,
  });
  const status: RunStatus = runResult.exitCode === 0 && proposal.status !== "failed" ? "completed" : "failed";
  const run = await finishRun(prepared.paths.run, runResult.run, status, runResult.exitCode, runResult.signal);
  await appendRunEvent(prepared.paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: proposal.status === "failed" ? "change.plan.proposal.failed" : "change.plan.proposal.completed", runId: prepared.runId, data: { proposalStatus: proposal.status } });
  await appendRunEvent(prepared.paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: status === "completed" ? "run.completed" : "run.failed", runId: prepared.runId });
  return { run, proposal };
}

export async function listSpecProposalSummaries(project: ManagedProject): Promise<ChangeProposalSummary[]> {
  const memory = await resolveProjectMemory(project);
  const proposals = await listProposals(memory, "spec");
  return proposals.map((proposal) => summarizeProposal(proposal));
}

export async function listPlanProposalSummaries(project: ManagedProject): Promise<ChangeProposalSummary[]> {
  const memory = await resolveProjectMemory(project);
  const proposals = await listProposals(memory, "plan");
  return proposals.map((proposal) => summarizeProposal(proposal));
}

export async function showSpecProposal(project: ManagedProject, proposalId: string): Promise<SpecProposal> {
  const memory = await resolveProjectMemory(project);
  return readSpecProposal(memory, proposalId);
}

export async function showPlanProposal(project: ManagedProject, proposalId: string): Promise<PlanProposal> {
  const memory = await resolveProjectMemory(project);
  return readPlanProposal(memory, proposalId);
}

export async function acceptSpecProposal(project: ManagedProject, proposalId: string): Promise<SpecProposalAcceptResult> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Spec proposal accept");
  const proposal = await readSpecProposal(memory, proposalId);
  if (proposal.status !== "proposed") {
    throw new Error(`Cannot accept spec proposal with status ${proposal.status}.`);
  }
  if (parseAcceptanceCriteria(proposal.specMd).criteria.length === 0) {
    throw new Error("Cannot accept spec proposal: proposal must contain at least one Acceptance Criterion ID such as AC-001.");
  }
  const active = await getActiveChangePath(memory);
  const specPath = join(active.changePath, "spec.md");
  await assertTargetHashesUnchanged({ spec: specPath }, proposal.targetHashes);
  await atomicWriteFile(specPath, ensureTrailingNewline(proposal.specMd));
  const changeStatus = await getChangeStatus(project);
  await appendAcceptedEvent(memory, proposal.runId, "change.spec.proposal.accepted", { specPath: displayArtifactPath(memory, specPath) });
  return { proposal, changeStatus, specPath: displayArtifactPath(memory, specPath) };
}

export async function acceptPlanProposal(project: ManagedProject, proposalId: string): Promise<PlanProposalAcceptResult> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Plan proposal accept");
  const proposal = await readPlanProposal(memory, proposalId);
  if (proposal.status !== "proposed") {
    throw new Error(`Cannot accept plan proposal with status ${proposal.status}.`);
  }
  if (!proposal.planMd.trim() || !proposal.tasksMd.trim()) {
    throw new Error("Cannot accept plan proposal: planMd and tasksMd are required.");
  }
  const active = await getActiveChangePath(memory);
  const specPath = join(active.changePath, "spec.md");
  const planPath = join(active.changePath, "plan.md");
  const tasksPath = join(active.changePath, "tasks.md");
  await assertTargetHashesUnchanged({ plan: planPath, tasks: tasksPath }, proposal.targetHashes);
  const spec = await readFile(specPath, "utf8");
  const acMap = buildAcMap({
    changeId: active.changeId,
    specContent: spec,
    tasksContent: proposal.tasksMd,
    placeholderFiles: [
      { path: "plan.md", content: proposal.planMd },
      { path: "tasks.md", content: proposal.tasksMd },
    ],
  });
  if (acMap.blockingIssues.length > 0) {
    throw new Error(`Cannot accept plan proposal:\n${acMap.blockingIssues.map((issue) => `- ${issue}`).join("\n")}`);
  }
  if (parseTasks(proposal.tasksMd).tasks.length === 0) {
    throw new Error("Cannot accept plan proposal: tasksMd must contain at least one T-xxx task.");
  }
  await atomicWriteFile(planPath, ensureTrailingNewline(proposal.planMd));
  await atomicWriteFile(tasksPath, ensureTrailingNewline(proposal.tasksMd));
  const changeStatus = await getChangeStatus(project);
  await appendAcceptedEvent(memory, proposal.runId, "change.plan.proposal.accepted", {
    planPath: displayArtifactPath(memory, planPath),
    tasksPath: displayArtifactPath(memory, tasksPath),
  });
  return {
    proposal,
    changeStatus,
    planPath: displayArtifactPath(memory, planPath),
    tasksPath: displayArtifactPath(memory, tasksPath),
  };
}

export function parseSpecProposalMessage(message: string): Pick<SpecProposal, "status" | "specMd" | "openQuestions" | "assumptions" | "warnings"> {
  const jsonText = extractProposalJson(message);
  if (!jsonText) {
    return { status: "failed", specMd: "", openQuestions: [], assumptions: [], warnings: ["Spec proposal output did not include parseable JSON."] };
  }
  try {
    const parsed = specModelOutputSchema.parse(JSON.parse(jsonText));
    return parsed;
  } catch (error) {
    return { status: "failed", specMd: "", openQuestions: [], assumptions: [], warnings: [`Spec proposal JSON was invalid: ${(error as Error).message}`] };
  }
}

export function parsePlanProposalMessage(message: string): Pick<PlanProposal, "status" | "planMd" | "tasksMd" | "openQuestions" | "assumptions" | "warnings"> {
  const jsonText = extractProposalJson(message);
  if (!jsonText) {
    return { status: "failed", planMd: "", tasksMd: "", openQuestions: [], assumptions: [], warnings: ["Plan proposal output did not include parseable JSON."] };
  }
  try {
    const parsed = planModelOutputSchema.parse(JSON.parse(jsonText));
    return parsed;
  } catch (error) {
    return { status: "failed", planMd: "", tasksMd: "", openQuestions: [], assumptions: [], warnings: [`Plan proposal JSON was invalid: ${(error as Error).message}`] };
  }
}

async function prepareProposalRun(project: ManagedProject, kind: ProposalKind, extraPrompt?: string): Promise<CommonProposalRun> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, `${kind} proposal run`);
  const changeStatus = await getChangeStatus(project);
  assertRunnableChange(changeStatus);
  const changeId = changeStatus.change?.id ?? changeStatus.activeChanges[0]?.name;
  if (!changeId) throw new Error(`Cannot start ${kind} proposal without an active change id.`);

  const runId = buildRunId(changeId, [kind === "spec" ? "spec-agent" : "planner", extraPrompt ?? ""]);
  const directory = join(memory.runsRoot, runId);
  const relativeDir = displayArtifactPath(memory, directory);
  const artifacts: RunArtifactPaths = {
    base: memory.artifactBase,
    directory: relativeDir,
    context: `${relativeDir}/context.md`,
    events: `${relativeDir}/events.jsonl`,
    stdout: `${relativeDir}/stdout.log`,
    stderr: `${relativeDir}/stderr.log`,
    prompt: `${relativeDir}/prompt.md`,
    codexEvents: `${relativeDir}/codex-events.jsonl`,
    lastMessage: `${relativeDir}/last-message.md`,
    ...(kind === "spec"
      ? { specProposal: `${relativeDir}/spec-proposal.json`, specProposalMarkdown: `${relativeDir}/spec-proposal.md` }
      : { planProposal: `${relativeDir}/plan-proposal.json`, planProposalMarkdown: `${relativeDir}/plan-proposal.md` }),
  };
  const paths: ProposalRunPaths = {
    directory,
    run: join(directory, "run.json"),
    context: join(directory, "context.md"),
    prompt: join(directory, "prompt.md"),
    events: join(directory, "events.jsonl"),
    stdout: join(directory, "stdout.log"),
    stderr: join(directory, "stderr.log"),
    codexEvents: join(directory, "codex-events.jsonl"),
    lastMessage: join(directory, "last-message.md"),
    proposal: join(directory, kind === "spec" ? "spec-proposal.json" : "plan-proposal.json"),
    proposalMarkdown: join(directory, kind === "spec" ? "spec-proposal.md" : "plan-proposal.md"),
  };

  await mkdir(directory, { recursive: true });
  const now = new Date().toISOString();
  const context = buildContextProjection(changeStatus);
  await writeFile(paths.context, context, "utf8");
  const targetHashes = await readTargetHashes(memory);
  const run: RunMetadata = {
    version: "1.0",
    id: runId,
    changeId,
    projectPath: project.path,
    runtime: kind === "spec" ? "spec-agent" : "planner",
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
  await appendRunEvent(paths.events, { timestamp: now, type: "run.created", runId, data: { changeId, runtime: run.runtime } });
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "context.prepared", runId, data: { path: artifacts.context } });
  return { memory, changeStatus, changeId, runId, paths, artifacts, context, targetHashes, startedAt: now };
}

async function executeCodexProposal(
  project: ManagedProject,
  prepared: CommonProposalRun,
  runtime: RunRuntime,
  eventPrefix: "change.spec.proposal" | "change.plan.proposal",
  prompt: string,
): Promise<{ run: RunMetadata; exitCode: number | null; signal: NodeJS.Signals | null; stdoutSample: string; stderrSample: string }> {
  const capabilities = await detectCodexCapabilities();
  if (capabilities.errors.length > 0) {
    await appendRunEvent(prepared.paths.events, { timestamp: new Date().toISOString(), type: "codex.capabilities.failed", runId: prepared.runId, data: { capabilities } });
    const message = renderUnavailableProposalMessage(prepared, capabilities.errors);
    await writeFile(prepared.paths.lastMessage, message, "utf8");
    await writeFile(prepared.paths.stdout, "", "utf8");
    await writeFile(prepared.paths.codexEvents, "", "utf8");
    await writeFile(prepared.paths.stderr, `${capabilities.errors.join("\n")}\n`, "utf8");
    const run = await finishRun(prepared.paths.run, await readRunMetadata(prepared.paths.run), "failed", 1, null);
    return { run, exitCode: 1, signal: null, stdoutSample: "", stderrSample: capabilities.errors.join("\n") };
  }

  await appendRunEvent(prepared.paths.events, { timestamp: new Date().toISOString(), type: "codex.capabilities.detected", runId: prepared.runId, data: { capabilities } });
  const argv = buildCodexReadonlyArgv(capabilities, {
    projectPath: project.path,
    lastMessagePath: prepared.paths.lastMessage,
    additionalReadDirs: prepared.memory.mode === "external-local" ? [prepared.memory.memoryRoot] : [],
  });
  let run = await readRunMetadata(prepared.paths.run);
  run = { ...run, command: [argv.command, ...argv.args], status: "running", runtime };
  await writeJsonFile(prepared.paths.run, run);
  await appendRunEvent(prepared.paths.events, { timestamp: new Date().toISOString(), type: `${eventPrefix}.started`, runId: prepared.runId, data: { cwd: project.path, command: run.command } });
  await appendRunEvent(prepared.paths.events, { timestamp: new Date().toISOString(), type: "codex.started", runId: prepared.runId, data: { cwd: project.path, command: run.command } });

  const processResult = await executeProcessStreaming({
    cwd: project.path,
    command: argv.command,
    args: argv.args,
    stdin: prompt,
    stdoutPath: prepared.paths.stdout,
    stderrPath: prepared.paths.stderr,
    mirrorStdoutPath: prepared.paths.codexEvents,
  });
  await appendRunEvent(prepared.paths.events, {
    timestamp: new Date().toISOString(),
    type: "codex.exited",
    runId: prepared.runId,
    data: { exitCode: processResult.exitCode, signal: processResult.signal },
  });
  return { run, exitCode: processResult.exitCode, signal: processResult.signal, stdoutSample: processResult.stdoutSample, stderrSample: processResult.stderrSample };
}

async function composeSpecPrompt(prepared: CommonProposalRun, extraPrompt?: string): Promise<string> {
  const files = await readActiveChangeFiles(prepared.memory);
  const docs = await collectBoundedProjectDocs(prepared.memory);
  const profile = await readBundledProfile("spec-agent");
  return [
    "# AHO Spec Agent Proposal Run",
    "",
    "You are running as a read-only Spec Agent. Generate a proposal only.",
    "",
    profile.trim(),
    "",
    "## Output Contract",
    "",
    "Your final answer must include a JSON object in a fenced ```json block.",
    "",
    "```json",
    "{",
    "  \"status\": \"proposed | blocked | failed\",",
    "  \"specMd\": \"complete proposed spec.md content\",",
    "  \"openQuestions\": [],",
    "  \"assumptions\": [],",
    "  \"warnings\": []",
    "}",
    "```",
    "",
    "High-impact open questions must make status blocked. Low-risk assumptions may remain proposed.",
    "Only define WHAT/WHY. Do not write implementation plan, tasks, code, validation commands, or reviews.",
    "",
    "## Run Context Projection",
    prepared.context,
    "",
    "## Active Change Files",
    renderActiveFiles(files),
    "",
    "## Bounded Project Docs Context",
    docs,
    "",
    extraPrompt?.trim() ? "## Additional Human Prompt" : "",
    extraPrompt?.trim() ?? "",
    "",
  ].join("\n");
}

async function composePlanPrompt(prepared: CommonProposalRun, extraPrompt?: string): Promise<string> {
  const files = await readActiveChangeFiles(prepared.memory);
  const docs = await collectBoundedProjectDocs(prepared.memory);
  const profile = await readBundledProfile("planner");
  return [
    "# AHO Planner Proposal Run",
    "",
    "You are running as a read-only Planner Agent. Generate plan/tasks proposal only.",
    "",
    profile.trim(),
    "",
    "## Output Contract",
    "",
    "Your final answer must include a JSON object in a fenced ```json block.",
    "",
    "```json",
    "{",
    "  \"status\": \"proposed | blocked | failed\",",
    "  \"planMd\": \"complete proposed plan.md content\",",
    "  \"tasksMd\": \"complete proposed tasks.md content\",",
    "  \"openQuestions\": [],",
    "  \"assumptions\": [],",
    "  \"warnings\": []",
    "}",
    "```",
    "",
    "Tasks must use T-xxx IDs and each task must include a Covers line with AC-xxx IDs.",
    "Do not write code, create worktrees, run validation, edit reviews, or claim approval.",
    "",
    "## Run Context Projection",
    prepared.context,
    "",
    "## Active Change Files",
    renderActiveFiles(files),
    "",
    "## Bounded Project Docs Context",
    docs,
    "",
    extraPrompt?.trim() ? "## Additional Human Prompt" : "",
    extraPrompt?.trim() ?? "",
    "",
  ].join("\n");
}

async function readActiveChangeFiles(memory: ResolvedMemory): Promise<{ summary: string; spec: string; plan: string; tasks: string; review: string }> {
  const active = await getActiveChangePath(memory);
  return {
    summary: await safeRead(join(active.changePath, "summary.md")),
    spec: await safeRead(join(active.changePath, "spec.md")),
    plan: await safeRead(join(active.changePath, "plan.md")),
    tasks: await safeRead(join(active.changePath, "tasks.md")),
    review: await safeRead(join(active.changePath, "reviews", "review.md")),
  };
}

async function getActiveChangePath(memory: ResolvedMemory): Promise<{ changeId: string; changePath: string }> {
  const active = await getActiveChanges(memory);
  if (active.length !== 1) {
    throw new Error(`Expected exactly one active change; found ${active.length}.`);
  }
  return { changeId: active[0].name, changePath: join(memory.memoryRoot, active[0].path) };
}

async function readTargetHashes(memory: ResolvedMemory): Promise<ChangeProposalTargetHashes> {
  const active = await getActiveChangePath(memory);
  return {
    spec: await hashFile(join(active.changePath, "spec.md")),
    plan: await hashFile(join(active.changePath, "plan.md")),
    tasks: await hashFile(join(active.changePath, "tasks.md")),
  };
}

async function assertTargetHashesUnchanged(paths: { spec?: string; plan?: string; tasks?: string }, expected: ChangeProposalTargetHashes): Promise<void> {
  for (const [key, path] of Object.entries(paths) as Array<[keyof ChangeProposalTargetHashes, string]>) {
    const current = await hashFile(path);
    if (expected[key] !== current) {
      throw new Error(`${key}.md changed after proposal was generated; re-run proposal before accept.`);
    }
  }
}

async function hashFile(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function safeRead(path: string, maxChars = 12000): Promise<string> {
  if (!existsSync(path)) return "";
  const value = await readFile(path, "utf8");
  return value.length > maxChars ? `${value.slice(0, maxChars)}\n\n[AHO truncated file at ${maxChars} chars]\n` : value;
}

async function collectBoundedProjectDocs(memory: ResolvedMemory): Promise<string> {
  const docs = [
    { label: "AGENTS.md", path: memory.agentGuidePath },
    { label: "docs/ECL.md", path: join(memory.docsRoot, "ECL.md") },
    { label: "docs/PRODUCT.md", path: join(memory.docsRoot, "PRODUCT.md") },
    { label: "docs/ARCHITECTURE.md", path: join(memory.docsRoot, "ARCHITECTURE.md") },
    { label: "docs/BOUNDARIES.md", path: join(memory.docsRoot, "BOUNDARIES.md") },
    { label: "docs/STATUS.md", path: join(memory.docsRoot, "STATUS.md") },
  ];
  const sections: string[] = [];
  for (const doc of docs) {
    if (!existsSync(doc.path)) continue;
    sections.push(`### ${doc.label}`, "", "```markdown", await safeRead(doc.path, 6000), "```", "");
  }
  return sections.join("\n") || "No bounded project docs discovered.";
}

function renderActiveFiles(files: Awaited<ReturnType<typeof readActiveChangeFiles>>): string {
  return [
    "### summary.md",
    "```markdown",
    files.summary,
    "```",
    "### spec.md",
    "```markdown",
    files.spec,
    "```",
    "### plan.md",
    "```markdown",
    files.plan,
    "```",
    "### tasks.md",
    "```markdown",
    files.tasks,
    "```",
    "### reviews/review.md",
    "```markdown",
    files.review,
    "```",
  ].join("\n");
}

async function readBundledProfile(name: "spec-agent" | "planner"): Promise<string> {
  return await readFile(join(getTemplateRoot(), "..", "agent-profiles", `${name}.md`), "utf8");
}

async function listProposals(memory: ResolvedMemory, kind: ProposalKind): Promise<Array<SpecProposal | PlanProposal>> {
  if (!existsSync(memory.runsRoot)) return [];
  const entries = await readdir(memory.runsRoot, { withFileTypes: true });
  const proposals: Array<SpecProposal | PlanProposal> = [];
  const file = kind === "spec" ? "spec-proposal.json" : "plan-proposal.json";
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!existsSync(join(memory.runsRoot, entry.name, file))) continue;
    proposals.push(kind === "spec" ? await readSpecProposal(memory, entry.name) : await readPlanProposal(memory, entry.name));
  }
  return proposals.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

async function readSpecProposal(memory: ResolvedMemory, proposalId: string): Promise<SpecProposal> {
  return await readRequiredJsonFile(join(memory.runsRoot, proposalId, "spec-proposal.json"), specProposalSchema) as SpecProposal;
}

async function readPlanProposal(memory: ResolvedMemory, proposalId: string): Promise<PlanProposal> {
  return await readRequiredJsonFile(join(memory.runsRoot, proposalId, "plan-proposal.json"), planProposalSchema) as PlanProposal;
}

async function readRunMetadata(path: string): Promise<RunMetadata> {
  const schema = z.object({
    version: z.literal("1.0"),
    id: z.string(),
    changeId: z.string(),
    projectPath: z.string(),
    runtime: z.string(),
    executionMode: z.enum(["direct", "worktree"]).optional(),
    proposalOnly: z.boolean().optional(),
    command: z.array(z.string()),
    status: z.enum(["created", "running", "completed", "failed"]),
    exitCode: z.number().nullable(),
    signal: z.string().nullable(),
    startedAt: z.string(),
    finishedAt: z.string().nullable(),
    artifacts: z.record(z.string(), z.unknown()),
  });
  return await readRequiredJsonFile(path, schema) as unknown as RunMetadata;
}

async function writeSpecProposal(
  path: string,
  markdownPath: string,
  input: {
    runId: string;
    changeId: string;
    startedAt: string;
    status: ChangeProposalStatus;
    output: Pick<SpecProposal, "status" | "specMd" | "openQuestions" | "assumptions" | "warnings">;
    message: string;
    targetHashes: ChangeProposalTargetHashes;
    artifacts: RunArtifactPaths;
  },
): Promise<SpecProposal> {
  const proposal: SpecProposal = {
    version: "1.0",
    id: input.runId,
    runId: input.runId,
    changeId: input.changeId,
    status: input.status === "failed" ? "failed" : input.output.status,
    startedAt: input.startedAt,
    finishedAt: new Date().toISOString(),
    targetHashes: input.targetHashes,
    specMd: input.output.specMd,
    openQuestions: input.output.openQuestions,
    assumptions: input.output.assumptions,
    warnings: input.output.warnings,
    artifacts: {
      proposal: input.artifacts.specProposal ?? "",
      proposalMarkdown: input.artifacts.specProposalMarkdown ?? "",
      lastMessage: input.artifacts.lastMessage ?? "",
    },
  };
  await writeJsonFile(path, proposal);
  await writeFile(markdownPath, renderSpecProposalMarkdown(proposal, input.message), "utf8");
  return proposal;
}

async function writePlanProposal(
  path: string,
  markdownPath: string,
  input: {
    runId: string;
    changeId: string;
    startedAt: string;
    status: ChangeProposalStatus;
    output: Pick<PlanProposal, "status" | "planMd" | "tasksMd" | "openQuestions" | "assumptions" | "warnings">;
    message: string;
    targetHashes: ChangeProposalTargetHashes;
    artifacts: RunArtifactPaths;
  },
): Promise<PlanProposal> {
  const proposal: PlanProposal = {
    version: "1.0",
    id: input.runId,
    runId: input.runId,
    changeId: input.changeId,
    status: input.status === "failed" ? "failed" : input.output.status,
    startedAt: input.startedAt,
    finishedAt: new Date().toISOString(),
    targetHashes: input.targetHashes,
    planMd: input.output.planMd,
    tasksMd: input.output.tasksMd,
    openQuestions: input.output.openQuestions,
    assumptions: input.output.assumptions,
    warnings: input.output.warnings,
    artifacts: {
      proposal: input.artifacts.planProposal ?? "",
      proposalMarkdown: input.artifacts.planProposalMarkdown ?? "",
      lastMessage: input.artifacts.lastMessage ?? "",
    },
  };
  await writeJsonFile(path, proposal);
  await writeFile(markdownPath, renderPlanProposalMarkdown(proposal, input.message), "utf8");
  return proposal;
}

function renderSpecProposalMarkdown(proposal: SpecProposal, message: string): string {
  return renderProposalMarkdown("Spec", proposal.id, proposal.status, proposal.changeId, proposal.openQuestions, proposal.assumptions, proposal.warnings, message);
}

function renderPlanProposalMarkdown(proposal: PlanProposal, message: string): string {
  return renderProposalMarkdown("Plan", proposal.id, proposal.status, proposal.changeId, proposal.openQuestions, proposal.assumptions, proposal.warnings, message);
}

function renderProposalMarkdown(kind: string, id: string, status: ChangeProposalStatus, changeId: string, questions: string[], assumptions: string[], warnings: string[], message: string): string {
  return [
    `# ${kind} Proposal: ${id}`,
    "",
    `- Status: ${status}`,
    `- Change: ${changeId}`,
    `- Open questions: ${questions.length}`,
    `- Assumptions: ${assumptions.length}`,
    `- Warnings: ${warnings.length}`,
    "",
    questions.length ? "## Open Questions" : "",
    ...questions.map((item) => `- ${item}`),
    assumptions.length ? "## Assumptions" : "",
    ...assumptions.map((item) => `- ${item}`),
    warnings.length ? "## Warnings" : "",
    ...warnings.map((item) => `- ${item}`),
    "",
    "## Codex Final Message",
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
  const status = /^Status:\s*(proposed|blocked|failed)\s*$/im.exec(message);
  if (status) return JSON.stringify({ status: status[1], openQuestions: [], assumptions: [], warnings: ["No JSON payload found; parsed status line only."] });
  return null;
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
    JSON.stringify({ status: "failed", openQuestions: [], assumptions: [], warnings: ["Codex final message was not captured."] }, null, 2),
    "```",
    "",
  ].join("\n");
  await writeFile(path, message, "utf8");
  return message;
}

function renderUnavailableProposalMessage(prepared: CommonProposalRun, errors: string[]): string {
  const isSpec = prepared.artifacts.specProposal !== undefined;
  return [
    "Status: failed",
    "",
    `# ${isSpec ? "Spec" : "Plan"} Proposal Unavailable`,
    "",
    "AHO could not safely start Codex in read-only non-interactive mode.",
    "",
    ...errors.map((error) => `- ${error}`),
    "",
    "```json",
    JSON.stringify({ status: "failed", openQuestions: [], assumptions: [], warnings: errors }, null, 2),
    "```",
    "",
  ].join("\n");
}

function summarizeProposal(proposal: SpecProposal | PlanProposal): ChangeProposalSummary {
  return {
    id: proposal.id,
    runId: proposal.runId,
    changeId: proposal.changeId,
    status: proposal.status,
    startedAt: proposal.startedAt,
    finishedAt: proposal.finishedAt,
    openQuestionCount: proposal.openQuestions.length,
    warningCount: proposal.warnings.length,
  };
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

async function appendAcceptedEvent(memory: ResolvedMemory, runId: string, type: "change.spec.proposal.accepted" | "change.plan.proposal.accepted", data: Record<string, unknown>): Promise<void> {
  const events = join(memory.runsRoot, runId, "events.jsonl");
  if (existsSync(events)) {
    await appendRunEvent(events, { timestamp: new Date().toISOString(), type, runId, data });
  }
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}
