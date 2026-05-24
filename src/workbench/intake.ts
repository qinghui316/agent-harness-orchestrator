import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { buildChangeIndex } from "../ecl/index.js";
import { writeJsonFile } from "../fs/json.js";
import { resolveProjectMemory } from "../memory/resolver.js";
import { getMemoryStatus } from "../memory/status.js";
import { getProjectStatus } from "../project/status.js";
import { appendRunEvent, buildRunId, displayArtifactPath } from "../run/manager.js";
import { listRuns } from "../run/manager.js";
import { listAuditResults, summarizeAudit } from "../audit/artifacts.js";
import { listValidationResults, summarizeValidation } from "../validation/artifacts.js";
import type { ManagedProject, ResolvedMemory, RunMetadata } from "../types/index.js";
import { appendTopicThreadEntry, readTopicThreadLog, type TopicThreadEntry } from "./chat.js";

export type ClarificationSource = "aho" | "codex";
export type ClarificationStatus = "pending" | "answered" | "skipped" | "expired";

export interface ClarificationQuestion {
  id: string;
  header?: string;
  question: string;
  options?: Array<{ label: string; description?: string }>;
  allowFreeform: boolean;
}

export interface ClarificationAnswer {
  questionId: string;
  answer: string;
}

export interface ClarificationRequest {
  id: string;
  projectId: string;
  changeId: string;
  runId?: string;
  turnId?: string;
  source: ClarificationSource;
  stage: "intake" | "spec" | "plan" | "run";
  status: ClarificationStatus;
  questions: ClarificationQuestion[];
  answers?: ClarificationAnswer[];
  createdAt: string;
  answeredAt?: string;
}

export interface WorkbenchIntakeScan {
  version: "1.0";
  id: string;
  runId: string;
  changeId: string;
  prompt: string;
  createdAt: string;
  repo: {
    path: string;
    branch: string | null;
    dirty: boolean | null;
  };
  memory: {
    mode: string;
    harnessReady: boolean;
    artifactBase: string;
  };
  scripts: Array<{ name: string; command: string }>;
  candidateFiles: string[];
  changes: {
    active: string[];
    parking: string[];
    archive: string[];
  };
  evidence: Array<{ label: string; status?: string; artifact?: string }>;
  missingInfo: string[];
  warnings: string[];
}

export interface WorkbenchIntakeIteration {
  version: "1.0";
  id: string;
  changeId: string;
  prompt: string;
  currentUnderstanding: string;
  confirmedConstraints: string[];
  openQuestions: string[];
  assumptions: string[];
  recommendedNextAction: "intake.reanalyze" | "change.spec.propose";
  scanRunId?: string;
  createdAt: string;
}

interface IntakeState {
  latestScan?: WorkbenchIntakeScan;
  latestIteration?: WorkbenchIntakeIteration;
  clarifications: ClarificationRequest[];
}

const scanSchemaVersion = "1.0";

export async function runIntakeScan(project: ManagedProject, changeId: string, prompt = ""): Promise<{ run: RunMetadata; scan: WorkbenchIntakeScan }> {
  const memory = await resolveProjectMemory(project);
  assertActiveTopic(memory, changeId);
  const runId = buildRunId(changeId, ["intake", "scan"]);
  const directory = join(memory.runsRoot, runId);
  const relativeDir = displayArtifactPath(memory, directory);
  const artifacts = {
    base: memory.artifactBase,
    directory: relativeDir,
    context: `${relativeDir}/context.md`,
    events: `${relativeDir}/events.jsonl`,
    stdout: `${relativeDir}/stdout.log`,
    stderr: `${relativeDir}/stderr.log`,
    intakeScan: `${relativeDir}/scan.json`,
    intakeScanMarkdown: `${relativeDir}/scan.md`,
  };
  const paths = {
    run: join(directory, "run.json"),
    context: join(directory, "context.md"),
    events: join(directory, "events.jsonl"),
    stdout: join(directory, "stdout.log"),
    stderr: join(directory, "stderr.log"),
    scan: join(directory, "scan.json"),
    scanMarkdown: join(directory, "scan.md"),
  };
  await mkdir(directory, { recursive: true });
  const startedAt = new Date().toISOString();
  let run: RunMetadata = {
    version: "1.0",
    id: runId,
    changeId,
    projectPath: project.path,
    runtime: "intake-scan",
    executionMode: "direct",
    proposalOnly: true,
    command: ["intake", "scan"],
    status: "created",
    exitCode: null,
    signal: null,
    startedAt,
    finishedAt: null,
    artifacts,
    promptStack: ["user-demand", "project-facts", "change-state"],
  };
  await writeJsonFile(paths.run, run);
  await appendRunEvent(paths.events, { timestamp: startedAt, type: "run.created", runId, data: { changeId, runtime: "intake-scan" } });

  run = { ...run, status: "running" };
  await writeJsonFile(paths.run, run);
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "intake.scan.started", runId, data: { prompt } });

  const scan = await buildIntakeScan(project, memory, changeId, runId, prompt);
  await writeJsonFile(paths.scan, scan);
  await writeFile(paths.scanMarkdown, renderScanMarkdown(scan), "utf8");
  await writeFile(paths.context, renderScanContext(scan), "utf8");
  await writeFile(paths.stdout, "", "utf8");
  await writeFile(paths.stderr, "", "utf8");

  const finishedAt = new Date().toISOString();
  run = { ...run, status: "completed", exitCode: 0, finishedAt };
  await writeJsonFile(paths.run, run);
  await appendRunEvent(paths.events, { timestamp: finishedAt, type: "intake.scan.completed", runId, data: { candidateFileCount: scan.candidateFiles.length } });
  await appendRunEvent(paths.events, { timestamp: finishedAt, type: "run.completed", runId });

  await appendTopicThreadEntry(project, changeId, {
    type: "intake.scan",
    text: `已分析项目：找到 ${scan.candidateFiles.length} 个候选文件、${scan.scripts.length} 个脚本和 ${scan.evidence.length} 条证据。`,
    runId,
    artifact: artifacts.intakeScanMarkdown,
    intake: { scanId: scan.id, runId, scan },
  });
  return { run, scan };
}

export async function reanalyzeIntake(project: ManagedProject, changeId: string, message: string): Promise<{ iteration: WorkbenchIntakeIteration; clarification: ClarificationRequest | null }> {
  const memory = await resolveProjectMemory(project);
  assertActiveTopic(memory, changeId);
  const state = await readIntakeState(memory, changeId);
  const now = new Date().toISOString();
  const constraints = mergeConstraints(state.latestIteration?.confirmedConstraints ?? [], extractConstraints(message));
  const goal = firstUserGoal(await readTopicThreadLog(memory, `harness/changes/active/${changeId}`), message);
  const related = state.latestScan?.candidateFiles.slice(0, 5) ?? [];
  const openQuestions = buildOpenQuestions(message, constraints, state.latestScan);
  const assumptions = buildAssumptions(state.latestScan);
  const iteration: WorkbenchIntakeIteration = {
    version: scanSchemaVersion,
    id: `intake-iteration-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    changeId,
    prompt: message,
    currentUnderstanding: buildUnderstanding(goal, constraints, related),
    confirmedConstraints: constraints,
    openQuestions,
    assumptions,
    recommendedNextAction: openQuestions.length > 0 ? "intake.reanalyze" : "change.spec.propose",
    scanRunId: state.latestScan?.runId,
    createdAt: now,
  };
  await appendTopicThreadEntry(project, changeId, {
    type: "intake.iteration",
    text: iteration.currentUnderstanding,
    artifact: state.latestScan ? state.latestScan.runId : undefined,
    intake: { iteration },
  });
  const clarification = openQuestions.length > 0 ? await createClarification(project, changeId, openQuestions.slice(0, 3), state.latestScan?.runId) : null;
  return { iteration, clarification };
}

export async function answerClarification(project: ManagedProject, changeId: string, clarificationId: string, answers: ClarificationAnswer[]): Promise<{ clarification: ClarificationRequest; iteration: WorkbenchIntakeIteration }> {
  const memory = await resolveProjectMemory(project);
  assertActiveTopic(memory, changeId);
  const state = await readIntakeState(memory, changeId);
  const existing = state.clarifications.find((item) => item.id === clarificationId);
  if (!existing) throw new Error(`Clarification not found: ${clarificationId}`);
  if (existing.status !== "pending") throw new Error(`Clarification is not pending: ${clarificationId}`);
  const answered: ClarificationRequest = { ...existing, status: "answered", answers, answeredAt: new Date().toISOString() };
  await appendTopicThreadEntry(project, changeId, {
    type: "clarification.answer",
    text: answers.map((answer) => answer.answer).join("\n"),
    clarification: answered,
  });
  const combined = answers.map((answer) => answer.answer).join(" ");
  const { iteration } = await reanalyzeIntake(project, changeId, combined);
  return { clarification: answered, iteration };
}

export async function skipClarification(project: ManagedProject, changeId: string, clarificationId: string): Promise<{ clarification: ClarificationRequest }> {
  const memory = await resolveProjectMemory(project);
  assertActiveTopic(memory, changeId);
  const state = await readIntakeState(memory, changeId);
  const existing = state.clarifications.find((item) => item.id === clarificationId);
  if (!existing) throw new Error(`Clarification not found: ${clarificationId}`);
  const skipped: ClarificationRequest = { ...existing, status: "skipped", answeredAt: new Date().toISOString() };
  await appendTopicThreadEntry(project, changeId, {
    type: "clarification.skip",
    text: "用户跳过了这个需求确认问题。",
    clarification: skipped,
  });
  return { clarification: skipped };
}

export async function readIntakeState(memory: ResolvedMemory, changeId: string): Promise<IntakeState> {
  const entries = await readTopicThreadLog(memory, `harness/changes/active/${changeId}`).catch(async () => {
    const allRoots = ["active", "parking", "archive"];
    for (const root of allRoots) {
      const path = `harness/changes/${root}/${changeId}`;
      if (existsSync(join(memory.memoryRoot, path))) return readTopicThreadLog(memory, path);
    }
    return [] as TopicThreadEntry[];
  });
  let latestScan: WorkbenchIntakeScan | undefined;
  let latestIteration: WorkbenchIntakeIteration | undefined;
  const clarifications = new Map<string, ClarificationRequest>();
  for (const entry of entries) {
    const intake = isRecord(entry.intake) ? entry.intake : {};
    const clarification = isRecord(entry.clarification) ? entry.clarification : null;
    if (isRecord(intake.scan) && isIntakeScan(intake.scan)) latestScan = intake.scan;
    if (isRecord(intake.iteration) && isIntakeIteration(intake.iteration)) latestIteration = intake.iteration;
    if (isClarificationRequest(clarification)) clarifications.set(clarification.id, clarification);
  }
  return { latestScan, latestIteration, clarifications: [...clarifications.values()] };
}

async function buildIntakeScan(project: ManagedProject, memory: ResolvedMemory, changeId: string, runId: string, prompt: string): Promise<WorkbenchIntakeScan> {
  const [projectStatus, memoryStatus, index, runs, validations, audits] = await Promise.all([
    getProjectStatus(project, project.path).catch(() => null),
    getMemoryStatus(project, project.path),
    buildChangeIndex(memory).catch(() => ({ active: [], parking: [], archive: [], generated_at: "" })),
    listRuns(memory).catch(() => []),
    listValidationResults(memory).then((items) => items.map(summarizeValidation)).catch(() => []),
    listAuditResults(memory).then((items) => items.map(summarizeAudit)).catch(() => []),
  ]);
  return {
    version: scanSchemaVersion,
    id: `scan-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    runId,
    changeId,
    prompt,
    createdAt: new Date().toISOString(),
    repo: {
      path: project.path,
      branch: projectStatus?.branch ?? null,
      dirty: projectStatus?.dirty ?? null,
    },
    memory: {
      mode: memoryStatus.memoryMode,
      harnessReady: memoryStatus.harnessReady,
      artifactBase: memoryStatus.artifactBase,
    },
    scripts: await readPackageScripts(project.path),
    candidateFiles: await discoverCandidateFiles(project.path),
    changes: {
      active: index.active.map((item) => item.name),
      parking: index.parking.map((item) => item.name),
      archive: index.archive.slice(-8).map((item) => item.name),
    },
    evidence: [
      ...runs.filter((run) => run.changeId === changeId).slice(0, 5).map((run) => ({ label: `${run.runtime} ${run.status}`, status: run.status, artifact: run.artifacts.directory })),
      ...validations.filter((item) => item.changeId === changeId).slice(0, 3).map((item) => ({ label: `Validation ${item.status}`, status: item.status })),
      ...audits.filter((item) => item.changeId === changeId).slice(0, 3).map((item) => ({ label: `Audit ${item.status}`, status: item.status })),
    ],
    missingInfo: buildScanMissingInfo(prompt),
    warnings: [
      ...(memoryStatus.harnessReady ? [] : ["Harness memory is not fully ready."]),
      ...(projectStatus?.dirty ? ["Source repository has uncommitted changes."] : []),
    ],
  };
}

async function readPackageScripts(projectPath: string): Promise<Array<{ name: string; command: string }>> {
  const packagePath = join(projectPath, "package.json");
  if (!existsSync(packagePath)) return [];
  const parsed = JSON.parse(await readFile(packagePath, "utf8")) as Record<string, unknown>;
  const scripts = isRecord(parsed.scripts) ? parsed.scripts : {};
  return Object.entries(scripts)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .slice(0, 12)
    .map(([name, command]) => ({ name, command }));
}

async function discoverCandidateFiles(projectPath: string): Promise<string[]> {
  const direct = ["AGENTS.md", "README.md", "package.json", "tsconfig.json", "vite.config.ts", "src", "tests", "test"];
  const files: string[] = [];
  for (const item of direct) {
    const absolute = join(projectPath, item);
    if (!existsSync(absolute)) continue;
    if (await stat(absolute).then((info) => info.isDirectory()).catch(() => false)) {
      files.push(...await collectFiles(absolute, projectPath, 2, 24));
    } else {
      files.push(item.replace(/\\/g, "/"));
    }
  }
  return [...new Set(files)].slice(0, 40);
}

async function collectFiles(root: string, projectPath: string, maxDepth: number, maxFiles: number, depth = 0): Promise<string[]> {
  if (depth > maxDepth) return [];
  const output: string[] = [];
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (output.length >= maxFiles) break;
    if (entry.name.startsWith(".") || ["node_modules", "dist", "build", "coverage"].includes(entry.name)) continue;
    const absolute = join(root, entry.name);
    if (entry.isDirectory()) {
      output.push(...await collectFiles(absolute, projectPath, maxDepth, maxFiles - output.length, depth + 1));
    } else if (isLikelyRelevantFile(entry.name)) {
      output.push(relative(projectPath, absolute).replace(/\\/g, "/"));
    }
  }
  return output;
}

function isLikelyRelevantFile(name: string): boolean {
  return [".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".yml", ".yaml"].includes(extname(name));
}

function renderScanMarkdown(scan: WorkbenchIntakeScan): string {
  return [
    "# Intake Scan",
    "",
    `- Change: ${scan.changeId}`,
    `- Prompt: ${scan.prompt || "(none)"}`,
    `- Repo: ${scan.repo.path}`,
    `- Branch: ${scan.repo.branch ?? "unknown"}`,
    `- Dirty: ${scan.repo.dirty === null ? "unknown" : scan.repo.dirty}`,
    "",
    "## Scripts",
    "",
    ...(scan.scripts.length ? scan.scripts.map((script) => `- ${script.name}: \`${script.command}\``) : ["- None detected."]),
    "",
    "## Candidate Files",
    "",
    ...(scan.candidateFiles.length ? scan.candidateFiles.map((file) => `- ${file}`) : ["- None detected."]),
    "",
    "## Missing Information",
    "",
    ...(scan.missingInfo.length ? scan.missingInfo.map((item) => `- ${item}`) : ["- No obvious gaps detected."]),
  ].join("\n");
}

function renderScanContext(scan: WorkbenchIntakeScan): string {
  return `# Intake Scan Context\n\n${renderScanMarkdown(scan)}\n`;
}

function buildScanMissingInfo(prompt: string): string[] {
  const gaps: string[] = [];
  if (!prompt.trim()) gaps.push("需求原文为空，需要用户说明目标。");
  if (!/(测试|test|验证|validation)/i.test(prompt)) gaps.push("需要确认验收/测试证据。");
  if (!/(不|未|边界|会员|非会员|折扣|金额|round|四舍五入)/i.test(prompt)) gaps.push("需要确认关键业务边界。");
  return gaps.slice(0, 3);
}

function extractConstraints(message: string): string[] {
  return message
    .split(/[。；;\n]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, 8);
}

function mergeConstraints(existing: string[], next: string[]): string[] {
  return [...new Set([...existing, ...next])].slice(0, 12);
}

function buildOpenQuestions(message: string, constraints: string[], scan?: WorkbenchIntakeScan): string[] {
  const combined = `${message}\n${constraints.join("\n")}`;
  const questions: string[] = [];
  if (!/(测试|test|验证|validation)/i.test(combined)) questions.push("需要补哪些测试或验证命令？");
  if (!/(四舍五入|round|分|金额|精度)/i.test(combined)) questions.push("金额计算和取整规则是什么？");
  if (!scan?.candidateFiles.length) questions.push("当前项目里哪些文件最可能承载这条需求？");
  return questions.slice(0, 3);
}

function buildAssumptions(scan?: WorkbenchIntakeScan): string[] {
  const assumptions = ["需求澄清不会修改业务代码。"];
  if (scan?.scripts.length) assumptions.push("后续验证优先使用项目已有 package scripts。");
  return assumptions;
}

function buildUnderstanding(goal: string, constraints: string[], relatedFiles: string[]): string {
  const parts = [`当前目标：${goal}`];
  if (constraints.length) parts.push(`已确认约束：${constraints.join("；")}`);
  if (relatedFiles.length) parts.push(`相关候选文件：${relatedFiles.join("、")}`);
  return parts.join("\n");
}

async function createClarification(project: ManagedProject, changeId: string, questions: string[], runId?: string): Promise<ClarificationRequest> {
  const request: ClarificationRequest = {
    id: `clarification-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    projectId: project.id,
    changeId,
    runId,
    source: "aho",
    stage: "intake",
    status: "pending",
    questions: questions.map((question, index) => ({
      id: `q${index + 1}`,
      header: index === 0 ? "需要确认" : undefined,
      question,
      allowFreeform: true,
    })),
    createdAt: new Date().toISOString(),
  };
  await appendTopicThreadEntry(project, changeId, {
    type: "clarification.request",
    text: questions.join("\n"),
    runId,
    clarification: request,
  });
  return request;
}

function firstUserGoal(entries: TopicThreadEntry[], fallback: string): string {
  return entries.find((entry) => entry.type === "user.message" && entry.text?.trim())?.text?.trim() ?? fallback;
}

function assertActiveTopic(memory: ResolvedMemory, changeId: string): void {
  if (!existsSync(join(memory.changesRoot, "active", changeId))) {
    throw new Error(`Intake actions require an active Topic: ${changeId}`);
  }
}

function isIntakeScan(value: unknown): value is WorkbenchIntakeScan {
  return isRecord(value) && value.version === scanSchemaVersion && typeof value.runId === "string" && typeof value.changeId === "string";
}

function isIntakeIteration(value: unknown): value is WorkbenchIntakeIteration {
  return isRecord(value) && value.version === scanSchemaVersion && typeof value.currentUnderstanding === "string" && Array.isArray(value.confirmedConstraints);
}

function isClarificationRequest(value: unknown): value is ClarificationRequest {
  return isRecord(value) && typeof value.id === "string" && Array.isArray(value.questions) && typeof value.status === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
