import { existsSync } from "node:fs";
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { z } from "zod";
import { parseJsonText, writeJsonFile } from "../fs/json.js";
import { getGitBranch, getGitCommit, isGitRepo } from "../project/git.js";
import {
  getCompiledProjectHarnessRuntimeEntry,
  getProjectHarnessSkillScaffoldRoot,
} from "../template-source/paths.js";
import type { CompleteAnalysisBundle } from "./analysis-bundle.js";
import { installProjectHarnessRuntimeDistribution } from "./distribution.js";
import { doctorProjectHarness } from "./diagnostics.js";
import { fingerprintProjectHarness, fingerprintProjectHarnessContent } from "./fingerprint.js";
import { reindexProjectKnowledge } from "./knowledge.js";
import {
  assertNoLinkedPathAncestors,
  assertPhysicalDirectory,
  resolveWithinPhysicalRoot,
} from "./path-safety.js";
import { assertPortableProjectId } from "./project-id.js";

const WORKFLOW_STAGES = [
  "intake",
  "locate",
  "plan",
  "implement",
  "verify",
  "close",
  "integrate",
  "evolve",
  "bootstrap-project",
] as const;

const ruleSchema = z.object({
  id: z.string().min(1),
  severity: z.enum(["critical", "standard"]),
  stages: z.array(z.string().min(1)).min(1),
  title: z.string().min(1),
  rule: z.string().min(1),
  on_violation: z.string().min(1),
}).strict();

const rulesSchema = z.object({
  schema_version: z.literal("1.0"),
  rules: z.array(ruleSchema).min(1),
}).strict();

interface CreationArtifact {
  path: string;
  action: string;
  source?: string;
}

export interface CreateProjectHarnessCandidateOptions {
  bundle: CompleteAnalysisBundle;
  projectRoot: string;
  projectId: string;
  candidateRoot: string;
  workspaceRoot: string;
  scaffoldRoot?: string;
  compiledRuntimeEntry?: string;
  revision?: number;
}

export interface ProjectHarnessCandidateResult {
  projectId: string;
  skillName: string;
  revision: number;
  candidateRoot: string;
  contentFingerprint: string;
  fullFingerprint: string;
  knowledgeDocuments: number;
}

export async function createProjectHarnessCandidate(
  options: CreateProjectHarnessCandidateOptions,
): Promise<ProjectHarnessCandidateResult> {
  assertPortableProjectId(options.projectId);
  const projectRoot = await assertPhysicalDirectory(options.projectRoot, "project source");
  await assertNoLinkedPathAncestors(projectRoot, "project source");
  const scaffoldPath = options.scaffoldRoot ?? getProjectHarnessSkillScaffoldRoot();
  await assertNoLinkedPathAncestors(scaffoldPath, "project Harness scaffold");
  const scaffoldRoot = await assertPhysicalDirectory(scaffoldPath, "project Harness scaffold");
  const skillName = `${options.projectId}-harness`;
  const workspaceRoot = await assertPhysicalDirectory(options.workspaceRoot, "project Harness onboarding workspace");
  const expectedCandidateRoot = join(workspaceRoot, "candidate", skillName);
  if (normalize(options.candidateRoot) !== normalize(expectedCandidateRoot)) {
    throw new Error("Project Harness candidate path is outside the Runtime-owned onboarding workspace.");
  }
  await assertNoLinkedPathAncestors(options.candidateRoot, "project Harness candidate");
  if (existsSync(options.candidateRoot)) {
    throw new Error(`Project Harness candidate already exists: ${options.candidateRoot}`);
  }
  await mkdir(options.candidateRoot, { recursive: false });
  const candidateRoot = await assertPhysicalDirectory(options.candidateRoot, "project Harness candidate");
  const revision = options.revision ?? 1;
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new Error("Initial project Harness revision must be a positive integer.");
  }

  await copyScaffold(scaffoldRoot, candidateRoot);
  await renderSkillEntry(scaffoldRoot, candidateRoot, {
    skillName,
    projectName: options.bundle.projectProfile.project_name,
    projectId: options.projectId,
    mode: await isGitRepo(projectRoot) ? "multi_lane" : "single_lane",
  });
  await applyCreationArtifacts(options.bundle, candidateRoot);
  await initializeState({
    candidateRoot,
    projectRoot,
    projectId: options.projectId,
    projectName: options.bundle.projectProfile.project_name,
    skillName,
    revision,
    bundle: options.bundle,
  });
  await renderRuleViews(candidateRoot);
  await installProjectHarnessRuntimeDistribution({
    skillRoot: candidateRoot,
    compiledRuntimeEntry: options.compiledRuntimeEntry ?? getCompiledProjectHarnessRuntimeEntry(),
  });
  const knowledge = await reindexProjectKnowledge({
    projectId: options.projectId,
    projectRoot,
    skillRoot: candidateRoot,
  });
  const doctor = await doctorProjectHarness({
    skillRoot: candidateRoot,
    expectedProjectId: options.projectId,
  });
  if (!doctor.healthy) {
    throw new Error(`Rendered project Harness candidate is unhealthy: ${doctor.findings.map((item) => item.message).join("; ")}`);
  }
  return {
    projectId: options.projectId,
    skillName,
    revision,
    candidateRoot,
    contentFingerprint: await fingerprintProjectHarnessContent(candidateRoot),
    fullFingerprint: await fingerprintProjectHarness(candidateRoot),
    knowledgeDocuments: knowledge.checkedDocuments,
  };
}

async function copyScaffold(sourceRoot: string, targetRoot: string): Promise<void> {
  for (const entry of await readdir(sourceRoot, { withFileTypes: true })) {
    if (entry.name === "SKILL.md.tpl") continue;
    const source = join(sourceRoot, entry.name);
    const target = join(targetRoot, entry.name);
    const info = await lstat(source);
    if (info.isSymbolicLink()) throw new Error(`Project Harness scaffold contains a link or Junction: ${source}`);
    if (info.isDirectory()) {
      await mkdir(target);
      await copyScaffold(source, target);
    } else if (info.isFile()) {
      await copyFile(source, target);
    }
  }
}

async function renderSkillEntry(
  scaffoldRoot: string,
  candidateRoot: string,
  input: { skillName: string; projectName: string; projectId: string; mode: string },
): Promise<void> {
  const template = await readFile(join(scaffoldRoot, "SKILL.md.tpl"), "utf8");
  const launcher = "<skill>/scripts/project-harness-runtime/harness.ps1";
  const command = `powershell -NoProfile -ExecutionPolicy Bypass -File ${launcher}`;
  const replacements: Record<string, string> = {
    SKILL_NAME: input.skillName,
    PROJECT_NAME: input.projectName,
    PROJECT_ID: input.projectId,
    MODE: input.mode,
    PROJECT_COMMAND: command,
    CHANGE_COMMAND: `${command} change`,
    INTEGRATE_COMMAND: `${command} integrate`,
    EVOLVE_COMMAND: `${command} evolve`,
    KNOWLEDGE_COMMAND: `${command} knowledge`,
  };
  const rendered = template.replace(/\{\{([A-Z_]+)\}\}/g, (_match, key: string) => {
    const value = replacements[key];
    if (value === undefined) throw new Error(`Unknown project Harness scaffold placeholder: ${key}`);
    return value;
  });
  await writeFile(join(candidateRoot, "SKILL.md"), rendered, "utf8");
}

async function applyCreationArtifacts(bundle: CompleteAnalysisBundle, candidateRoot: string): Promise<void> {
  const artifacts = bundle.creationDelta.artifacts as CreationArtifact[];
  for (const artifact of artifacts) {
    if (["retain", "archive-only"].includes(artifact.action)) continue;
    if (artifact.action === "retire") {
      throw new Error(`Initial project Harness creation cannot retire an artifact: ${artifact.path}`);
    }
    if (artifact.action === "merge") {
      throw new Error(`Initial project Harness creation does not support merge; provide the final artifact with replace: ${artifact.path}`);
    }
    if (!artifact.source) throw new Error(`Project Harness artifact has no source: ${artifact.path}`);
    const target = await resolveWithinPhysicalRoot(candidateRoot, artifact.path, "project Harness candidate artifact");
    const source = await resolveWithinPhysicalRoot(bundle.root, artifact.source, "analysis bundle artifact");
    const targetExists = existsSync(target);
    if (artifact.action === "create" && targetExists) {
      throw new Error(`Creation delta cannot create an existing scaffold artifact: ${artifact.path}`);
    }
    if (artifact.action === "replace" && !targetExists) {
      throw new Error(`Creation delta cannot replace a missing scaffold artifact: ${artifact.path}`);
    }
    await mkdir(dirname(target), { recursive: true });
    await copyFile(source, target);
  }
}

async function initializeState(input: {
  candidateRoot: string;
  projectRoot: string;
  projectId: string;
  projectName: string;
  skillName: string;
  revision: number;
  bundle: CompleteAnalysisBundle;
}): Promise<void> {
  const directories = [
    "state/analysis",
    "state/changes/active",
    "state/changes/parking",
    "state/changes/archive",
    "state/registry/changes",
    "state/registry/lanes",
    "state/registry/contracts",
    "state/registry/integrations",
    "state/registry/baseline-events",
    "state/evolution",
    "state/migration",
    "references/project_wiki",
  ];
  await Promise.all(directories.map((path) => mkdir(join(input.candidateRoot, path), { recursive: true })));
  const now = new Date().toISOString();
  const repository = await isGitRepo(input.projectRoot);
  await writeJsonFile(join(input.candidateRoot, "state", "manifest.json"), {
    schema_version: "2.0",
    project_id: input.projectId,
    project_name: input.projectName,
    skill_name: input.skillName,
    skill_revision: input.revision,
    analysis_status: "complete",
  });
  await writeJsonFile(join(input.candidateRoot, "state", "changes", "INDEX.json"), {
    schema_version: "1.0",
    changes: [],
  });
  await writeJsonFile(join(input.candidateRoot, "state", "registry", "baseline.json"), {
    schema_version: "1.0",
    canonical_branch: repository ? await getGitBranch(input.projectRoot) : null,
    canonical_commit: repository ? await getGitCommit(input.projectRoot) : null,
    updated_at: now,
  });
  await writeFile(join(input.candidateRoot, "state", "evolution", "results.tsv"),
    "timestamp\tproposal_id\tdecision\tscore\tnote\n", "utf8");
  await Promise.all([
    writeJsonFile(join(input.candidateRoot, "state", "analysis", "project-profile.json"), input.bundle.projectProfile),
    writeJsonFile(join(input.candidateRoot, "state", "analysis", "architecture.json"), input.bundle.architecture),
    writeJsonFile(join(input.candidateRoot, "state", "analysis", "audit.json"), input.bundle.audit),
    writeJsonFile(join(input.candidateRoot, "state", "analysis", "creation-delta.json"), input.bundle.creationDelta),
    writeJsonFile(join(input.candidateRoot, "state", "analysis", "bundle.json"), {
      schema_version: "1.0",
      content_fingerprint: input.bundle.contentFingerprint,
      source_paths: input.bundle.sourcePaths,
    }),
  ]);
}

async function renderRuleViews(candidateRoot: string): Promise<void> {
  const sourcePath = join(candidateRoot, "references", "rules", "red_lines.yaml");
  const rules = rulesSchema.parse(parseJsonText(await readFile(sourcePath, "utf8"), sourcePath));
  const root = join(candidateRoot, "references", "rules");
  await mkdir(join(root, "by-stage"), { recursive: true });
  const critical = rules.rules.filter((rule) => rule.severity === "critical");
  await writeFile(join(root, "critical.md"), renderRules("Critical Harness Rules", critical), "utf8");
  await Promise.all(WORKFLOW_STAGES.map(async (stage) => {
    const selected = rules.rules.filter((rule) => rule.stages.includes("all") || rule.stages.includes(stage));
    await writeFile(join(root, "by-stage", `${stage}.md`), renderRules(`${stageTitle(stage)} Stage Rules`, selected), "utf8");
  }));
}

function renderRules(title: string, rules: z.infer<typeof ruleSchema>[]): string {
  return [
    `# ${title}`,
    "",
    "> Generated from `red_lines.yaml`. Do not edit this file directly.",
    "",
    ...rules.flatMap((rule) => [
      `## ${rule.id}: ${rule.title}`,
      "",
      rule.rule,
      "",
      `**On violation:** ${rule.on_violation}`,
      "",
    ]),
  ].join("\n");
}

function stageTitle(stage: string): string {
  return stage.split("-").map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join(" ");
}

export async function assertCandidateIsRuntimeOwned(root: string, expectedParent: string): Promise<void> {
  const candidate = await assertPhysicalDirectory(root, "project Harness candidate");
  const parent = await assertPhysicalDirectory(expectedParent, "project Harness onboarding workspace");
  const rel = relative(parent, candidate);
  if (rel !== "candidate") throw new Error("Project Harness candidate is outside the Runtime-owned onboarding workspace.");
}

function normalize(path: string): string {
  const value = resolve(path);
  return process.platform === "win32" ? value.toLowerCase() : value;
}
